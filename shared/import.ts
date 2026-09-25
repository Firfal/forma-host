import { z } from "zod";

/** Analyse des listes d'élèves : saisie libre (invitation) et CSV exporté de Podia ou autre. */

export interface ParsedStudent {
  email: string;
  name?: string;
  joinedAt?: string;
}

export interface ParseResult {
  students: ParsedStudent[];
  invalid: string[];
}

const isEmail = (value: string) => z.email().safeParse(value).success;

/**
 * Une ligne par élève : « email », « Nom <email> » ou « email, Nom ».
 * Les virgules et points-virgules séparent aussi plusieurs emails sur une ligne.
 */
export function parseInviteText(text: string): ParseResult {
  const students = new Map<string, ParsedStudent>();
  const invalid: string[] = [];
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const angle = line.match(/^(.*)<([^>]+)>\s*$/);
    if (angle) {
      const email = angle[2].trim().toLowerCase();
      const name = angle[1].trim().replace(/^["']|["']$/g, "");
      if (isEmail(email)) students.set(email, { email, ...(name ? { name } : {}) });
      else invalid.push(line);
      continue;
    }
    const parts = line
      .split(/[;,\t]/)
      .map((part) => part.trim())
      .filter(Boolean);
    const emails = parts.filter((part) => part.includes("@"));
    const others = parts.filter((part) => !part.includes("@"));
    if (emails.length === 0) {
      invalid.push(line);
      continue;
    }
    for (const candidate of emails) {
      const email = candidate.toLowerCase();
      if (!isEmail(email)) {
        invalid.push(candidate);
        continue;
      }
      const name = emails.length === 1 ? others.join(" ").trim() : "";
      students.set(email, { email, ...(name ? { name } : {}) });
    }
  }
  return { students: [...students.values()], invalid };
}

const EMAIL_HEADERS = [
  "email",
  "e-mail",
  "mail",
  "adresse email",
  "adresse e-mail",
  "customer email",
  "email address",
];
const NAME_HEADERS = [
  "name",
  "nom",
  "full name",
  "nom complet",
  "customer",
  "customer name",
  "client",
];
const FIRST_NAME_HEADERS = ["first name", "prénom", "prenom", "firstname"];
const LAST_NAME_HEADERS = ["last name", "nom de famille", "lastname", "surname"];
const DATE_HEADERS = [
  "signed up",
  "signed up at",
  "sign-up",
  "signup date",
  "joined",
  "joined at",
  "date",
  "created",
  "created at",
  "inscription",
  "date d'inscription",
];

function findColumn(headers: string[], candidates: string[]): number {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  return normalized.findIndex((header) => candidates.includes(header));
}

/** Date d'un export (ISO, « Feb 6, 2025 », « 06/02/2025 » en jour/mois) → ISO 8601, sinon undefined. */
export function parseLooseDate(value: string | undefined): string | undefined {
  const text = (value ?? "").trim();
  if (!text) return undefined;
  const french = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  const date = french
    ? new Date(Date.UTC(Number(french[3]), Number(french[2]) - 1, Number(french[1]), 12))
    : new Date(text);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() < 2000 ||
    date.getTime() > Date.now() + 86_400_000
  ) {
    return undefined;
  }
  return date.toISOString();
}

/** Lignes d'un CSV (première ligne = en-têtes) → élèves. */
export function parseStudentRows(rows: string[][]): ParseResult & { emailColumnFound: boolean } {
  const [headers = [], ...data] = rows;
  let emailIndex = findColumn(headers, EMAIL_HEADERS);
  const nameIndex = findColumn(headers, NAME_HEADERS);
  const firstIndex = findColumn(headers, FIRST_NAME_HEADERS);
  const lastIndex = findColumn(headers, LAST_NAME_HEADERS);
  const dateIndex = findColumn(headers, DATE_HEADERS);
  // Sans en-tête reconnu : colonne contenant des emails.
  if (emailIndex === -1) emailIndex = headers.findIndex((cell) => cell.includes("@"));
  if (emailIndex === -1) return { students: [], invalid: [], emailColumnFound: false };
  const rowsToRead = findColumn(headers, EMAIL_HEADERS) === -1 ? rows : data;

  const students = new Map<string, ParsedStudent>();
  const invalid: string[] = [];
  for (const row of rowsToRead) {
    const email = (row[emailIndex] ?? "").trim().toLowerCase();
    if (!email) continue;
    if (!isEmail(email)) {
      invalid.push(email);
      continue;
    }
    const name =
      (nameIndex >= 0
        ? row[nameIndex]
        : [row[firstIndex] ?? "", row[lastIndex] ?? ""].join(" ")
      )?.trim() ?? "";
    const joinedAt = dateIndex >= 0 ? parseLooseDate(row[dateIndex]) : undefined;
    students.set(email, { email, ...(name ? { name } : {}), ...(joinedAt ? { joinedAt } : {}) });
  }
  return { students: [...students.values()], invalid, emailColumnFound: true };
}
