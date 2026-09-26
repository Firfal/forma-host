import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// L'émulateur ignore firestore.indexes.json : seul `firebase deploy` le valide.
// On vérifie ici la forme attendue pour ne pas le découvrir au déploiement.
interface IndexField {
  fieldPath?: string;
  order?: string;
  arrayConfig?: string;
}

interface IndexesFile {
  indexes: { collectionGroup: string; queryScope: string; fields: IndexField[] }[];
  fieldOverrides: { collectionGroup: string; fieldPath?: string }[];
}

const file = JSON.parse(
  readFileSync(new URL("../../firestore.indexes.json", import.meta.url), "utf8"),
) as IndexesFile;

describe("firestore.indexes.json", () => {
  it("chaque index composite a au moins deux champs ordonnés", () => {
    for (const index of file.indexes) {
      expect(index.fields.length, index.collectionGroup).toBeGreaterThanOrEqual(2);
      for (const field of index.fields) {
        expect(field.fieldPath, index.collectionGroup).toBeTruthy();
        expect(field.order ?? field.arrayConfig, index.collectionGroup).toBeTruthy();
      }
    }
  });

  it("chaque exception de champ désigne un champ", () => {
    for (const override of file.fieldOverrides) {
      expect(override.fieldPath, override.collectionGroup).toBeTruthy();
    }
  });

  it("aucun index en double", () => {
    const keys = file.indexes.map((index) => JSON.stringify(index));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
