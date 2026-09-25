import { deleteObject, getBlob, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase/client";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function validateImage(file: File, maxMb = 5): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "Format accepté : PNG, JPEG, GIF ou WEBP.";
  if (file.size > maxMb * 1024 * 1024) return `Image trop lourde (${maxMb} Mo maximum).`;
  return null;
}

function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .slice(0, 60);
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      : "";
  return `${Date.now()}-${base || "fichier"}${ext ? `.${ext}` : ""}`;
}

/** Téléverse un fichier public (miniature, logo) et retourne son URL. */
export async function uploadPublicFile(
  pathFor: (fileName: string) => string,
  file: File,
): Promise<string> {
  const objectRef = ref(storage, pathFor(safeFileName(file.name)));
  await uploadBytes(objectRef, file, {
    contentType: file.type,
    cacheControl: "public, max-age=31536000",
  });
  return getDownloadURL(objectRef);
}

/** Téléverse un fichier protégé (pièce jointe) et retourne son chemin. */
export async function uploadProtectedFile(
  pathFor: (fileName: string) => string,
  file: File,
): Promise<string> {
  const path = pathFor(safeFileName(file.name));
  await uploadBytes(ref(storage, path), file, {
    contentType: file.type || "application/octet-stream",
    contentDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`,
  });
  return path;
}

/** Télécharge un fichier protégé (les règles vérifient l'inscription) puis le propose au navigateur. */
export async function downloadProtectedFile(path: string, fileName: string): Promise<void> {
  const blob = await getBlob(ref(storage, path));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function deleteFile(path: string): Promise<void> {
  await deleteObject(ref(storage, path)).catch((error: { code?: string }) => {
    if (error.code !== "storage/object-not-found") throw error;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}
