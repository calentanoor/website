"use client";

import { useEffect, useState } from "react";
import type { ScreenerRow } from "./types";

// Loads screener rows from /api/rows for the given index ids and symbols.
export function useRows(indexIds: string[], symbols: string[]) {
  const key = `index=${indexIds.join(",")}&symbols=${symbols.map(encodeURIComponent).join(",")}`;
  const empty = !indexIds.length && !symbols.length;
  const [state, setState] = useState<{ key: string; rows?: ScreenerRow[]; error?: string }>({ key: "" });

  useEffect(() => {
    if (empty) return;
    let cancelled = false;
    fetch(`/api/rows?${key}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (!cancelled) setState({ key, rows: body.rows });
      })
      .catch((e) => !cancelled && setState({ key, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [key, empty]);

  if (empty) return { rows: [] as ScreenerRow[], loading: false };
  const current = state.key === key;
  return { rows: current ? state.rows : undefined, error: current ? state.error : undefined, loading: !current };
}
