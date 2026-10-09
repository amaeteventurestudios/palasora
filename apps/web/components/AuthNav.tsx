"use client";
import { useEffect, useState } from "react";
import type { ActionState } from "@/app/actions/member";

/** Marks the form as JS-enabled so the server returns the destination instead of a 303. */
export function JsFlag() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  return on ? <input type="hidden" name="js" value="1" /> : null;
}

/** Full navigation (not a client transition) so the root layout re-renders with the new session. */
export function useNavigateOnSuccess(s: ActionState) {
  useEffect(() => {
    if (!s.ok || !s.data?.next) return;
    const u = new URL(s.data.next, window.location.href);
    if (u.pathname === window.location.pathname && u.search === window.location.search) {
      // Same document (only the #hash differs): assign() would not reload, so force it.
      window.history.replaceState(null, "", u.href);
      window.location.reload();
    } else window.location.assign(u.href);
  }, [s]);
}
