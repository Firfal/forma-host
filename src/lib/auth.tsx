"use client";

import { onIdTokenChanged, signOut as firebaseSignOut, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth, db } from "./firebase/client";

interface AuthState {
  user: User | null;
  loading: boolean;
  isCreator: boolean;
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
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onIdTokenChanged(auth, async (nextUser) => {
        setUser(nextUser);
        if (nextUser) {
          const token = await nextUser.getIdTokenResult();
          setIsCreator(token.claims.creator === true);
          ensureUserDocs(nextUser).catch((error) => console.error("ensureUserDocs", error));
        } else {
          setIsCreator(false);
        }
        setLoading(false);
      }),
    [],
  );

  const signOut = useCallback(() => firebaseSignOut(auth), []);
  const refreshClaims = useCallback(async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.getIdToken(true);
  }, []);

  const value = useMemo(
    () => ({ user, loading, isCreator, signOut, refreshClaims }),
    [user, loading, isCreator, signOut, refreshClaims],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return context;
}
