import { noveniqueConfig } from "@/lib/novenique";

const NOTES: Record<string, string> = {
  cancelled: "Sign-in was cancelled. You can try again.",
  expired: "That sign-in took too long. Please try again.",
  failed: "We couldn't sign you in with Novenique. Please try again.",
};

/** "Continue with Novenique" (one account for every Novenique game). Renders nothing unless NOVENIQUE_SIGNIN=on. */
export function NoveniqueButton({ next, note, label = "Continue with Novenique" }: { next: string; note?: string; label?: string }) {
  if (!noveniqueConfig().on) return null;
  return (
    <div className="mb-6" data-testid="novenique-signin">
      {note && NOTES[note] && <p role="alert" className="mb-3 text-sm text-danger">{NOTES[note]}</p>}
      <a className="btn btn-primary w-full" href={`/auth/novenique/start?next=${encodeURIComponent(next)}`}>{label}</a>
      <p className="mt-2 text-sm text-muted-foreground">One account for Palasora and Agent Grand Prix. Sign in with Google or an email code.</p>
      <div className="mt-5 flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true"><span className="h-px flex-1 bg-border" />or with a password<span className="h-px flex-1 bg-border" /></div>
    </div>
  );
}
