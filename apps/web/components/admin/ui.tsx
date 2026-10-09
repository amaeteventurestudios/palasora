import { Time } from "../Time";

/** AdminMetric (05 §5): value, unit, scope, period, source and explicit empty/delay states. */
export function Metric({ label, value, unit = "", period, source, state = "ok", hint }: {
  label: string; value: number | string | null; unit?: string; period: string; source: string; state?: "ok" | "zero" | "not_connected" | "delayed" | "unknown"; hint?: string;
}) {
  const shown = state === "not_connected" ? "Not connected" : state === "unknown" ? "Unknown" : state === "delayed" ? "Delayed" : value ?? "–";
  return (
    <div className="card p-4" data-testid="admin-metric">
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className={`mt-1 font-extrabold ${typeof shown === "number" || /^\d/.test(String(shown)) ? "text-[28px]" : "text-[18px]"}`}>{shown}{state === "ok" && unit ? <span className="ml-1 text-base font-semibold text-muted">{unit}</span> : null}</p>
      <p className="meta mt-1">{period} · Source: {source}</p>
      {hint && <p className="meta">{hint}</p>}
    </div>
  );
}

export function Table({ caption, head, children, empty }: { caption: string; head: string[]; children: React.ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div className="card overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="p-3 text-left font-semibold">{caption}</caption>
        <thead className="border-y border-border bg-card-muted"><tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{rows.length ? children : <tr><td colSpan={head.length} className="px-3 py-4 text-muted">{empty ?? "Nothing here yet."}</td></tr>}</tbody>
      </table>
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad"; children: React.ReactNode }) {
  const style = { neutral: "border-border", good: "border-[var(--success)] text-success", warn: "border-[var(--brand-gold)]", bad: "border-[var(--danger)] text-danger" }[tone];
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${style}`}>{children}</span>;
}

export function Ago({ v }: { v?: string | null }) {
  return v ? <Time value={v} /> : <span className="text-muted">never</span>;
}

export function H1({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return <div className="mb-5"><h1 className="text-[26px] font-extrabold tracking-tight">{children}</h1>{sub && <p className="text-muted">{sub}</p>}</div>;
}
