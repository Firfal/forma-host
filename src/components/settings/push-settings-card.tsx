"use client";

import { BellRing, Share } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardBody } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { errorMessage } from "@/lib/firebase/callables";
import { usePush, type PushState } from "@/lib/push";

const HINTS: Record<PushState, string> = {
  loading: "",
  unsupported: "Ce navigateur ne gère pas les notifications push.",
  "needs-install":
    "Sur iPhone et iPad, ajoute d'abord l'app à l'écran d'accueil (bouton Partager, puis «\u00a0Sur l'écran d'accueil\u00a0»), puis ouvre-la depuis l'icône pour activer les notifications.",
  denied:
    "Notifications bloquées pour ce site : autorise-les dans les réglages du navigateur, puis recharge la page.",
  off: "Reçois les nouveautés même quand l'app est fermée.",
  on: "Activées sur cet appareil.",
};

/** Interrupteur « Notifications sur cet appareil » (web push). */
export function PushSettingsCard() {
  const { user, isCreator } = useAuth();
  const { state, enable, disable } = usePush(user?.uid);
  const [busy, setBusy] = useState(false);
  const available = state === "on" || state === "off";

  async function toggle(checked: boolean) {
    setBusy(true);
    try {
      if (checked) {
        await enable();
        toast.success("Notifications activées sur cet appareil");
      } else {
        await disable();
        toast.success("Notifications désactivées sur cet appareil");
      }
    } catch (error) {
      toast.error(errorMessage(error), { duration: 10_000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-3">
            <BellRing className="mt-0.5 size-4 shrink-0 text-muted" />
            <div>
              <p className="font-medium">Notifications sur cet appareil</p>
              <p className="text-[13px] text-muted">
                {isCreator
                  ? "Nouveaux élèves, commentaires et messages."
                  : "Réponses à tes commentaires et messages de ton formateur."}
              </p>
            </div>
          </div>
          <Switch
            checked={state === "on"}
            onCheckedChange={toggle}
            disabled={!available || busy}
            aria-label="Notifications sur cet appareil"
          />
        </div>
        {state !== "loading" ? (
          <p
            className={
              state === "needs-install" || state === "denied"
                ? "flex gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-[13px] text-warning"
                : "text-[13px] text-muted"
            }
          >
            {state === "needs-install" ? <Share className="mt-0.5 size-4 shrink-0" /> : null}
            {HINTS[state]}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
