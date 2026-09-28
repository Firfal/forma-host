import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import {
  ASSISTANT_DAILY_LIMIT,
  ASSISTANT_HISTORY_MAX,
  ASSISTANT_MODEL,
  assistantSystemPrompt,
  courseContext,
  usageDay,
  type AskAssistantInput,
  type AssistantAnswer,
  type AssistantTurn,
  type LessonText,
} from "@shared/assistant";
import { enrollmentId } from "@shared/paths";
import type { CourseDoc, CreatorDoc, EnrollmentDoc, LessonDoc } from "@shared/types";
import { decryptSecret, encryptSecret } from "./crypto";
import { db } from "./db";
import type { KeyProvider } from "./mail-settings";

/** Erreur au message déjà lisible par l'utilisateur. */
export class AssistantError extends Error {}

/** Appels à Claude, remplaçables en test (émulateurs : réponses de démonstration). */
export interface AssistantClient {
  validateKey(apiKey: string): Promise<void>;
  answer(apiKey: string, params: { system: string; messages: AssistantTurn[] }): Promise<string>;
}

export const anthropicAssistant: AssistantClient = {
  async validateKey(apiKey) {
    try {
      await new Anthropic({ apiKey, maxRetries: 1 }).models.retrieve(ASSISTANT_MODEL);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new AssistantError(
          "Clé refusée par Anthropic : vérifie qu'elle est complète et active.",
        );
      }
      if (
        error instanceof Anthropic.PermissionDeniedError ||
        error instanceof Anthropic.NotFoundError
      ) {
        throw new AssistantError("Cette clé n'a pas accès au modèle de l'assistant.");
      }
      if (error instanceof Anthropic.APIError) {
        throw new AssistantError(`Anthropic : erreur ${error.status ?? "réseau"}, réessaie.`);
      }
      throw error;
    }
  },

  async answer(apiKey, { system, messages }) {
    const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 90_000 });
    try {
      const response = await client.beta.messages.create({
        model: ASSISTANT_MODEL,
        max_tokens: 16000,
        // Refus d'un classifieur : la requête est rejouée côté serveur sur le modèle recommandé.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        // Questions-réponses : un effort bas suffit et garde des réponses rapides.
        output_config: { effort: "low" },
        // Le contenu de la formation est stable : mis en cache d'une question à l'autre.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
      });
      if (response.stop_reason === "refusal") {
        throw new AssistantError(
          "L'assistant ne peut pas répondre à cette question. Pose-la à ton formateur.",
        );
      }
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n")
        .trim();
      if (!text) throw new AssistantError("Réponse vide, réessaie.");
      return text;
    } catch (error) {
      if (error instanceof AssistantError) throw error;
      if (error instanceof Anthropic.RateLimitError) {
        throw new AssistantError("L'assistant est très sollicité : réessaie dans une minute.");
      }
      if (error instanceof Anthropic.APIError) {
        throw new AssistantError(
          "L'assistant est indisponible pour le moment, réessaie plus tard.",
        );
      }
      throw error;
    }
  },
};

export const fakeAssistant: AssistantClient = {
  async validateKey(apiKey) {
    if (apiKey.includes("refusee")) throw new AssistantError("Clé refusée par Anthropic.");
  },
  async answer(_apiKey, { messages }) {
    return `Réponse de démonstration : ${messages.at(-1)?.content.split("\n").at(-1) ?? ""}`;
  },
};

const SECRET_PATH = "platformSecrets/assistant";
const SETTINGS_PATH = "platform/assistant";
const SECRET_CONTEXT = "assistant";

/** Vérifie la clé auprès d'Anthropic puis l'enregistre chiffrée ; l'assistant devient disponible. */
export async function saveAssistantKey(
  apiKey: string,
  deps: { key: KeyProvider; client: AssistantClient },
): Promise<{ keyLast4: string }> {
  await deps.client.validateKey(apiKey);
  const keyLast4 = apiKey.slice(-4);
  const batch = db().batch();
  batch.set(db().doc(SECRET_PATH), {
    apiKey: encryptSecret(apiKey, deps.key(), SECRET_CONTEXT),
  });
  batch.set(db().doc(SETTINGS_PATH), {
    enabled: true,
    keyLast4,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { keyLast4 };
}

export async function deleteAssistantKey(): Promise<void> {
  const batch = db().batch();
  batch.delete(db().doc(SECRET_PATH));
  batch.set(db().doc(SETTINGS_PATH), {
    enabled: false,
    keyLast4: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

async function loadAssistantKey(key: KeyProvider): Promise<string | null> {
  const secret = (await db().doc(SECRET_PATH).get()).data() as { apiKey: string } | undefined;
  return secret ? decryptSecret(secret.apiKey, key(), SECRET_CONTEXT) : null;
}

/** Historique renvoyé au modèle : échanges complets, en commençant par une question. */
function cleanHistory(history: AssistantTurn[]): AssistantTurn[] {
  const turns = history.slice(-ASSISTANT_HISTORY_MAX * 2);
  while (turns[0]?.role === "assistant") turns.shift();
  const clean: AssistantTurn[] = [];
  for (const turn of turns) {
    if (clean.at(-1)?.role === turn.role) clean.pop();
    clean.push(turn);
  }
  while (clean.at(-1)?.role === "user") clean.pop();
  return clean;
}

/** Réponse de l'assistant à un élève inscrit (ou à l'équipe de l'école), dans la limite du jour. */
export async function askAssistant(
  params: {
    input: AskAssistantInput & { history: AssistantTurn[] };
    uid: string;
    schools: string[];
  },
  deps: { key: KeyProvider; client: AssistantClient; now?: Date },
): Promise<AssistantAnswer> {
  const { input, uid } = params;
  const courseSnap = await db().doc(`courses/${input.courseId}`).get();
  const course = courseSnap.data() as (CourseDoc & { assistant?: boolean }) | undefined;
  if (!course || course.assistant !== true) {
    throw new AssistantError("L'assistant n'est pas activé sur cette formation.");
  }
  const isStaff = uid === course.creatorId || params.schools.includes(course.creatorId);
  if (!isStaff) {
    const enrollment = (
      await db()
        .doc(`enrollments/${enrollmentId(input.courseId, uid)}`)
        .get()
    ).data() as EnrollmentDoc | undefined;
    if (enrollment?.status !== "active") {
      throw new AssistantError("Tu n'es pas inscrit à cette formation.");
    }
  }
  const apiKey = await loadAssistantKey(deps.key);
  if (!apiKey) throw new AssistantError("L'assistant n'est pas disponible pour le moment.");

  // Quota du jour, compté avant l'appel (une question en échec compte aussi).
  const usageRef = db().doc(`assistantUsage/${uid}_${usageDay(deps.now ?? new Date())}`);
  const used = await db().runTransaction(async (tx) => {
    const count = ((await tx.get(usageRef)).data()?.count as number | undefined) ?? 0;
    if (count >= ASSISTANT_DAILY_LIMIT) {
      throw new AssistantError(
        `Tu as posé ${ASSISTANT_DAILY_LIMIT} questions aujourd'hui : l'assistant sera de nouveau disponible demain.`,
      );
    }
    tx.set(usageRef, { uid, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
    return count + 1;
  });

  const [lessonsSnap, creatorSnap] = await Promise.all([
    db().collection(`courses/${input.courseId}/lessons`).select("body").get(),
    db().doc(`creators/${course.creatorId}`).get(),
  ]);
  const lessons: LessonText[] = lessonsSnap.docs.map((doc) => ({
    id: doc.id,
    body: (doc.data() as Pick<LessonDoc, "body">).body ?? null,
  }));
  const system = assistantSystemPrompt({
    schoolName: (creatorSnap.data() as CreatorDoc | undefined)?.name ?? "",
    courseTitle: course.title,
    context: courseContext(course.items, lessons),
  });
  const lessonTitle = input.lessonId
    ? course.items.find((item) => item.id === input.lessonId)?.title
    : null;
  const question = lessonTitle
    ? `Leçon en cours : « ${lessonTitle} »\n\n${input.question}`
    : input.question;
  const answer = await deps.client.answer(apiKey, {
    system,
    messages: [...cleanHistory(input.history), { role: "user", content: question }],
  });
  return { answer, remaining: Math.max(0, ASSISTANT_DAILY_LIMIT - used) };
}
