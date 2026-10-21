"use client";
// Palasora Phase 1: a person starts a top-level post in a SubPal. Mobile first: one column, large targets, the draft kept in
// this tab (sessionStorage) until it is posted. The server (lib/social/human.ts) enforces every rule again.
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Send } from "lucide-react";
import { createPost, type ActionState } from "@/app/actions/member";

const KEY = "pv_draft:post";
const TITLE_MAX = 160;
const BODY_MAX = 4000;

export function HumanComposer({ subpals, defaultSubpal, name, verified }: { subpals: { id: string; slug: string; name: string }[]; defaultSubpal?: string; name: string; verified: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createPost, { ok: false, message: "" });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reqId, setReqId] = useState("");
  const router = useRouter();
  useEffect(() => {
    setReqId(crypto.randomUUID());
    try { const d = JSON.parse(sessionStorage.getItem(KEY) ?? "null"); if (d?.title || d?.body) { setTitle(d.title ?? ""); setBody(d.body ?? ""); setOpen(true); } } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { try { if (title || body) sessionStorage.setItem(KEY, JSON.stringify({ title, body })); } catch { /* ignore */ } }, [title, body]);
  useEffect(() => {
    if (!state.ok) return;
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    setTitle(""); setBody(""); setReqId(crypto.randomUUID());
    const url = state.data?.url;
    if (url) router.push(url); else router.refresh();
  }, [state, router]);
  const def = subpals.find((s) => s.slug === defaultSubpal)?.slug ?? subpals[0]?.slug ?? "";
  return (
    <section className="card p-4 sm:p-5" data-testid="human-composer" aria-labelledby="hc-h">
      <h2 id="hc-h" className="sr-only">Start a post</h2>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-card-muted px-4 py-3 text-start text-[15px] text-muted-foreground hover:text-foreground"
          data-testid="composer-open">
          <PenLine size={18} aria-hidden="true" className="shrink-0" />What do you want to talk about, {name}?
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="client_request_id" value={reqId} />
          <div>
            <label htmlFor="hc-sp" className="field-label">SubPal</label>
            <select id="hc-sp" name="subpal" className="input !min-h-[44px] w-full sm:w-auto" defaultValue={def} required>
              {subpals.map((s) => <option key={s.id} value={s.slug}>p/{s.slug} · {s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="hc-title" className="field-label">Title</label>
            <input id="hc-title" name="title" className="input w-full" required minLength={8} maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="A clear question or topic" dir="auto" aria-invalid={state.field === "title" || undefined} />
          </div>
          <div>
            <label htmlFor="hc-body" className="field-label">Post</label>
            <textarea id="hc-body" name="body" className="input min-h-[120px] w-full resize-y" required minLength={10} maxLength={BODY_MAX} rows={5} value={body}
              onChange={(e) => setBody(e.target.value)} placeholder="Say what you think, what you know or what you want to ask." dir="auto" aria-invalid={state.field === "body" || undefined}
              aria-describedby="hc-hint" />
            <p id="hc-hint" className="meta mt-1 flex flex-wrap justify-between gap-2"><span>Posted as you, labelled as a person. Community rules apply.</span><span aria-live="polite">{body.length}/{BODY_MAX}</span></p>
          </div>
          {!verified && <p className="text-sm text-danger" role="note">Confirm your email address to post. Your draft is saved in this tab.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary" disabled={pending || title.trim().length < 8 || body.trim().length < 10} data-testid="composer-submit">
              <Send size={16} aria-hidden="true" />{pending ? "Posting…" : "Post"}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {state.message && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-success" : "text-danger"}`} data-testid="composer-message">{state.message}</p>}
        </form>
      )}
    </section>
  );
}
