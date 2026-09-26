"use client";

import { onIdTokenChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { schoolsFromClaims } from "@shared/school";
import type { UserDoc } from "@shared/types";
import { auth, db } from "./firebase/client";

interface AuthState {
  user: User | null;
  loading: boolean;
  isCreator: boolean;
  /** Écoles administrées (propriétaire ou co-administrateur), d'après les custom claims. */
  schools: string[];
  signOut: () => Promise<void>;
  /** Recharge les claims (ex. après activation du rôle formateur). */
  refreshClaims: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Crée users/{uid} et profiles/{uid} au premier login s'ils n'existent pas. */
async function ensureUserDocs(user: User) {
  const profileRef = doc(db, "profiles", user.uid);
  const userRef = doc(db, "users", user.uid);
  const [profile, userDoc] = await Promise.all([getDoc(profileRef), getDoc(userRef)]);
  const writes: Promise<void>[] = [];
  if (!profile.exists()) {
    writes.push(
      setDoc(profileRef, {
        displayName: user.displayName || (user.email ?? "Membre").split("@")[0],
        avatarUrl: user.photoURL ?? null,
        createdAt: serverTimestamp(),
      }),
    );
  }
  if (!userDoc.exists() && user.email) {
    writes.push(
      setDoc(userRef, { email: user.email, notifyOnComment: true, createdAt: serverTimestamp() }),
    );
  }
  await Promise.all(writes);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [schools, setSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const tokenIssuedAt = useRef(0);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (nextUser) => {
        setUser(nextUser);
        if (nextUser) {
          const token = await nextUser.getIdTokenResult();
          tokenIssuedAt.current = Date.parse(token.issuedAtTime);
          setIsCreator(token.claims.creator === true);
          setSchools((current) => {
            const next = schoolsFromClaims(nextUser.uid, token.claims);
            return current.join("|") === next.join("|") ? current : next;
          });
          ensureUserDocs(nextUser).catch((error) => console.error("ensureUserDocs", error));
        } else {
          setIsCreator(false);
          setSchools([]);
        }
        setLoading(false);
      }),
    [],
  );

  // Écoles modifiées côté serveur (invitation, retrait) : on recharge le jeton et ses claims.
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const updatedAt = (snap.data() as UserDoc | undefined)?.claimsUpdatedAt?.toMillis() ?? 0;
        if (updatedAt > tokenIssuedAt.current && auth.currentUser?.uid === uid) {
          tokenIssuedAt.current = updatedAt;
          auth.currentUser.getIdToken(true).catch(() => undefined);
        }
      },
      () => undefined,
    );
  }, [uid]);

  const signOut = useCallback(() => firebaseSignOut(auth), []);
  const refreshClaims = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.getIdToken(true);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isCreator, schools, signOut, refreshClaims }),
    [user, loading, isCreator, schools, signOut, refreshClaims],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return context;
}
