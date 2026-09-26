import { z } from "zod";

/** Token Vimeo de l'école (Admin > Paramètres), vérifié puis chiffré par les Functions. */

export const vimeoSettingsInput = z.object({
  token: z
    .string()
    .trim()
    .min(20, "Token trop court : copie-le en entier")
    .max(200)
    .regex(/^[A-Za-z0-9]+$/, "Token invalide : lettres et chiffres uniquement"),
});
export type VimeoSettingsInput = z.infer<typeof vimeoSettingsInput>;

/** Offres Vimeo sur lesquelles les vidéos ne peuvent pas être masquées ni limitées à un domaine. */
const FREE_ACCOUNTS = new Set(["basic", "free"]);

export function isFreeVimeoAccount(account: string | null | undefined): boolean {
  return FREE_ACCOUNTS.has((account ?? "").toLowerCase());
}

export function vimeoAccountLabel(account: string | null | undefined): string {
  if (!account) return "inconnue";
  if (isFreeVimeoAccount(account)) return "gratuite";
  return account
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
