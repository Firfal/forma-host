/** Rendu des modèles d'email ({{variable}}). Toutes les valeurs sont échappées. */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match,
  );
}

/** Corps texte (paragraphes séparés par une ligne vide) → HTML sûr. */
export function textToHtml(text: string, vars: Record<string, string>): string {
  const escapedVars = Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [key, escapeHtml(value)]),
  );
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((paragraph) => fillTemplate(paragraph, escapedVars).replace(/\n/g, "<br>"))
    .map((paragraph) => `<p style="margin:0 0 16px">${paragraph}</p>`)
    .join("\n");
}

export interface EmailLayoutInput {
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  brandName: string;
  brandColor: string;
  footer?: string;
}

export function emailLayout({
  bodyHtml,
  ctaLabel,
  ctaUrl,
  brandName,
  brandColor,
  footer,
}: EmailLayoutInput): string {
  const color = /^#[0-9a-f]{6}$/i.test(brandColor) ? brandColor : "#06040e";
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif;color:#06040e">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d6d6d7;border-radius:8px">
        <tr><td style="padding:24px 32px 0;font-size:16px;font-weight:600">${escapeHtml(brandName)}</td></tr>
        <tr><td style="padding:24px 32px 8px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
        <tr><td style="padding:0 32px 32px">
          <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:6px">${escapeHtml(ctaLabel)}</a>
        </td></tr>
      </table>
      <p style="font-size:12px;color:#717073;margin:16px 0 0">${escapeHtml(footer ?? "")}</p>
    </td></tr>
  </table>
</body>
</html>`;
}
