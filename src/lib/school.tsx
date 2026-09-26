"use client";

import { documentId, collection, query, where } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { schoolAdminSet } from "@shared/school";
import type { CreatorDoc } from "@shared/types";
import { useAuth } from "./auth";
import { useCreator } from "./creator";
import { db } from "./firebase/client";
import { useQueryData } from "./hooks";

/**
 * École active de l'espace formateur. Un formateur peut administrer plusieurs écoles
 * (la sienne et celles où il est co-administrateur) : le choix est mémorisé dans le navigateur.
 */

const STORAGE_KEY = "forma-host:school";

interface SchoolState {
  schoolId: string | null;
  schools: string[];
  /** Propriétaire de l'école active : accès aux réglages sensibles (équipe, emails, Vimeo). */
  isOwner: boolean;
  setSchoolId: (schoolId: string) => void;
}

const SchoolContext = createContext<SchoolState | null>(null);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const { user, schools } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSelected(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      // Stockage indisponible (navigation privée…) : école par défaut.
    }
  }, []);

  const setSchoolId = useCallback((schoolId: string) => {
    setSelected(schoolId);
    try {
      window.localStorage.setItem(STORAGE_KEY, schoolId);
    } catch {
      // Sans stockage, le choix vaut pour la session.
    }
  }, []);

  const value = useMemo<SchoolState>(() => {
    const fallback = user && schools.includes(user.uid) ? user.uid : (schools[0] ?? null);
    const schoolId = selected && schools.includes(selected) ? selected : fallback;
    return { schoolId, schools, isOwner: Boolean(user && schoolId === user.uid), setSchoolId };
  }, [user, schools, selected, setSchoolId]);

  return <SchoolContext.Provider value={value}>{children}</SchoolContext.Provider>;
}

export function useSchool(): SchoolState {
  const context = useContext(SchoolContext);
  if (!context) throw new Error("useSchool doit être utilisé dans <SchoolProvider>");
  return context;
}

/** Fiches des écoles administrées (nom, logo), pour le sélecteur d'école. */
export function useSchoolDocs(schools: string[]) {
  const schoolsQuery = useMemo(
    () =>
      schools.length > 1
        ? query(collection(db, "creators"), where(documentId(), "in", schools.slice(0, 30)))
        : null,
    [schools],
  );
  return useQueryData<CreatorDoc>(schoolsQuery);
}

/** Équipe d'une école (propriétaire et co-administrateurs) : badge « Créateur », fil d'activité. */
export function useSchoolStaff(schoolId: string | null | undefined): Set<string> {
  const { data: creator } = useCreator(schoolId);
  return useMemo(
    () => (schoolId ? schoolAdminSet(schoolId, creator) : new Set<string>()),
    [schoolId, creator],
  );
}
