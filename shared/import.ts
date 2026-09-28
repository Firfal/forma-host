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

/**
 * Même règle que z.email() (zod 4), vérifiée par un test : pas de zod dans la page des élèves
 * pour ce seul contrôle. Le serveur revalide de toute façon chaque email.
 */
export const EMAIL_PATTERN =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
const isEmail = (value: string) => EMAIL_PATTERN.test(value);

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
  "e-mail address",
  "adresse mail",
  "courriel",
  "user email",
  "student email",
];
const NAME_HEADERS = [
  "name",
  "nom",
  "full name",
  "nom complet",
  "customer",
  "customer name",
  "client",
  "student name",
  "user name",
  "nom et prénom",
  "prénom et nom",
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
  "enrolled at",
  "enrolled on",
  "enrollment date",
  "date enrolled",
  "started at",
  "member since",
  "purchase date",
  "date d'achat",
  "créé le",
  "date de création",
];

/** En-tête comparable : sans BOM (Excel), guillemets ni espaces superflus, en minuscules. */
const normalizeHeader = (header: string) =>
  header
    .replace(/^\uFEFF/, "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

function findColumn(headers: string[], candidates: string[]): number {
  return headers.map(normalizeHeader).findIndex((header) => candidates.includes(header));
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

function studentName(
  row: string[],
  columns: { nameIndex: number; firstIndex: number; lastIndex: number; lastIsNom: boolean },
): string {
  const cell = (index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");
  if (
    columns.firstIndex >= 0 &&
    (columns.lastIndex >= 0 || columns.lastIsNom || columns.nameIndex === -1)
  ) {
    const last = columns.lastIsNom ? cell(columns.nameIndex) : cell(columns.lastIndex);
    return [cell(columns.firstIndex), last].filter(Boolean).join(" ");
  }
  if (columns.nameIndex >= 0) return cell(columns.nameIndex);
  return cell(columns.lastIndex);
}

/** Lignes d'un CSV (première ligne = en-têtes) → élèves. */
export function parseStudentRows(rows: string[][]): ParseResult & { emailColumnFound: boolean } {
  const [headers = [], ...data] = rows;
  let emailIndex = findColumn(headers, EMAIL_HEADERS);
  const nameIndex = findColumn(headers, NAME_HEADERS);
  const firstIndex = findColumn(headers, FIRST_NAME_HEADERS);
  const lastIndex = findColumn(headers, LAST_NAME_HEADERS);
  const dateIndex = findColumn(headers, DATE_HEADERS);
  // Exports français (Systeme.io, LearnyBox…) : « Prénom » + « Nom » = nom de famille.
  const lastIsNom =
    firstIndex >= 0 && lastIndex === -1 && normalizeHeader(headers[nameIndex] ?? "") === "nom";
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
    const name = studentName(row, { nameIndex, firstIndex, lastIndex, lastIsNom });
    const joinedAt = dateIndex >= 0 ? parseLooseDate(row[dateIndex]) : undefined;
    students.set(email, { email, ...(name ? { name } : {}), ...(joinedAt ? { joinedAt } : {}) });
  }
  return { students: [...students.values()], invalid, emailColumnFound: true };
}
