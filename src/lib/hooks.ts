"use client";

import {
  onSnapshot,
  queryEqual,
  refEqual,
  type DocumentReference,
  type Query,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";

export interface Loadable<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** Garde la même référence tant que la requête est équivalente (évite les réabonnements). */
function useStableRef<T>(value: T | null, equal: (a: T, b: T) => boolean): T | null {
  const ref = useRef(value);
  const same =
    value === ref.current || (value !== null && ref.current !== null && equal(ref.current, value));
  if (!same) ref.current = value;
  return ref.current;
}

/** Document en temps réel. `ref` à null : rien n'est chargé. */
export function useDocData<T>(
  ref: DocumentReference | null,
): Loadable<(T & { id: string }) | null> {
  const stable = useStableRef<DocumentReference>(ref, (a, b) => refEqual(a, b));
  const [state, setState] = useState<Loadable<(T & { id: string }) | null>>({
    data: null,
    loading: Boolean(ref),
    error: null,
  });

  useEffect(() => {
    if (!stable) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    return onSnapshot(
      stable,
      (snap) =>
        setState({
          data: snap.exists()
            ? ({ id: snap.id, ...(snap.data() as T) } as T & { id: string })
            : null,
          loading: false,
          error: null,
        }),
      (error) => setState({ data: null, loading: false, error }),
    );
  }, [stable]);

  return state;
}

/** Requête en temps réel. `query` à null : rien n'est chargé. */
export function useQueryData<T>(query: Query | null): Loadable<(T & { id: string })[]> {
  const stable = useStableRef<Query>(query, (a, b) => queryEqual(a, b));
  const [state, setState] = useState<Loadable<(T & { id: string })[]>>({
    data: [],
    loading: Boolean(query),
    error: null,
  });

  useEffect(() => {
    if (!stable) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    return onSnapshot(
      stable,
      (snap) =>
        setState({
          data: snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as T) })),
          loading: false,
          error: null,
        }),
      (error) => setState({ data: [], loading: false, error }),
    );
  }, [stable]);

  return state;
}

/** Plusieurs documents en temps réel (ex. les formations de « Mes formations »). */
export function useDocsData<T>(
  refs: DocumentReference[],
): Loadable<Map<string, T & { id: string }>> {
  const key = refs.map((ref) => ref.path).join("|");
  const [state, setState] = useState<Loadable<Map<string, T & { id: string }>>>({
    data: new Map(),
    loading: refs.length > 0,
    error: null,
  });

  useEffect(() => {
    if (refs.length === 0) {
      setState({ data: new Map(), loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    const results = new Map<string, T & { id: string }>();
    const settled = new Set<string>();
    const unsubscribes = refs.map((ref) =>
      onSnapshot(
        ref,
        (snap) => {
          if (snap.exists()) results.set(snap.id, { id: snap.id, ...(snap.data() as T) });
          else results.delete(snap.id);
          settled.add(ref.path);
          setState({ data: new Map(results), loading: settled.size < refs.length, error: null });
        },
        (error) => {
          settled.add(ref.path);
          setState({ data: new Map(results), loading: settled.size < refs.length, error });
        },
      ),
    );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` résume la liste des références
  }, [key]);

  return state;
}
