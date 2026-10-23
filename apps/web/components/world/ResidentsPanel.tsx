"use client";
// Palasora: the residents directory over the world. A live count, search by name, @handle or street, filters for
// residents with no home or no job (and the ones you follow), and a card for each resident: address, job, income and
// net worth from the ledger, neighbours, businesses, Follow and Copy link. Opening a resident flies the town to their home.
import { useCallback, useEffect, useRef, useState } from "react";
import { followResident, loadResident, loadResidents } from "@/app/actions/town-residents";
import { BUSINESS_LABEL, townTime } from "@/lib/world/layout";
import { FILTER_LABEL, kindLabel, residentLink, type Directory, type Resident, type ResidentFilter } from "@/lib/world/residents";
import { soraWhole } from "@/lib/world/place";

const btn = "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-50";
const primary = `${btn} bg-[#1d2433] text-white`, secondary = `${btn} border border-black/15 bg-white`;
const AI = () => <span className="rounded bg-[#d8a838]/25 px-1 text-[11px] font-bold">AI</span>;

export function ResidentsPanel({ town, signedIn, onOpen }: { town: string; signedIn: boolean; onOpen(id: string): void }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ResidentFilter>("all");
  const [d, setD] = useState<Directory | null | undefined>(undefined);
  const [more, setMore] = useState<Directory["rows"]>([]);
  const seq = useRef(0);
  const load = useCallback((offset = 0) => {
    const n = ++seq.current;
    loadResidents(q, filter, offset).then((r) => {
      if (n !== seq.current) return;
      if (offset) setMore((m) => [...m, ...(r?.rows ?? [])]); else { setD(r); setMore([]); }
    }).catch(() => n === seq.current && setD(null));
  }, [q, filter]);
  useEffect(() => { const t = setTimeout(() => load(0), q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);
  // the count is live: read again every half minute while the panel is open
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) load(0); }, 30_000); return () => clearInterval(t); }, [load]);

  if (d === null) return <p className="text-sm text-[#4b5566]" data-testid="residents-unavailable">The town&apos;s records are unavailable right now.</p>;
  const rows = d ? [...d.rows, ...more] : [];
  const filters: ResidentFilter[] = signedIn ? ["all", "no_home", "no_job", "following"] : ["all", "no_home", "no_job"];
  return (
    <div className="flex flex-col gap-3 text-sm" data-testid="residents">
      <p data-testid="residents-count"><span className="text-2xl font-bold tabular-nums">{d ? d.counts.all.toLocaleString("en") : "…"}</span> {d?.counts.all === 1 ? "person lives" : "people live"} in {town}</p>
      {d?.me && <button type="button" className={`${secondary} self-start !border-[#d8a838]`} onClick={() => onOpen(d.me!)} data-testid="residents-me">Your resident</button>}
      <label className="flex flex-col gap-1"><span className="text-xs font-semibold text-[#4b5566]">Find a resident</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, @handle or street" autoComplete="off"
          className="min-h-11 rounded-xl border border-black/15 px-3" data-testid="residents-search" /></label>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter residents">{filters.map((k) => (
        <button key={k} type="button" role="tab" aria-selected={k === filter} onClick={() => setFilter(k)} data-testid={`residents-filter-${k}`}
          className={`min-h-11 rounded-full border px-3 text-sm font-semibold ${k === filter ? "border-[#1d2433] bg-[#1d2433] text-white" : "border-black/15 bg-white"}`}>
          {FILTER_LABEL[k]} · {d ? d.counts[k] : "…"}</button>))}</div>
      {d === undefined ? <p className="text-[#4b5566]" data-testid="residents-loading">Reading the town&apos;s records…</p> : rows.length === 0 ? (
        <p data-testid="residents-empty">{q ? `Nobody matches “${q}”.` : filter === "following" ? "You don't follow anyone yet." : "Nobody here."}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-black/5" data-testid="residents-list">{rows.map((r) => (
          <li key={r.id}><button type="button" onClick={() => onOpen(r.id)} data-testid="resident-row" data-id={r.id}
            className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left hover:bg-black/[.03]">
            <span className="min-w-0"><span className="font-semibold">{r.name}</span> <span className="text-[#4b5566]">@{r.handle}</span>
              <span className="block truncate text-xs text-[#4b5566]">{r.address || "No home yet"} · {r.job ? r.job.text : "No job"}</span></span>
            <span className="shrink-0 text-right text-xs tabular-nums text-[#4b5566]">{soraWhole(r.net_worth)}</span>
          </button></li>))}</ul>
      )}
      {d && rows.length < d.total && <button type="button" className={`${secondary} self-start`} onClick={() => load(rows.length)} data-testid="residents-more">Show more ({d.total - rows.length})</button>}
    </div>
  );
}

export function ResidentCard({ id, onOpen, onFly, onPlot, onBack, onTitle }: {
  id: string; onOpen(id: string): void; onFly(plot: string): void; onPlot(plot: string): void; onBack(): void; onTitle(t: string): void;
}) {
  const [r, setR] = useState<Resident | null | undefined>(undefined);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setR(undefined); setMsg("");
    loadResident(id).then((x) => { setR(x); if (x) { onTitle(x.name); if (x.home) onFly(x.home); } }).catch(() => setR(null));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (r === undefined) return <p className="text-sm text-[#4b5566]" data-testid="resident-loading">Reading the town&apos;s records…</p>;
  if (r === null) return <p className="text-sm" data-testid="resident-unavailable">This resident is not in town.</p>;
  const toggle = async () => {
    setPending(true);
    const res = await followResident(r.id, !r.following).catch(() => ({ ok: false, message: "Not sent." } as { ok: boolean; message?: string; following?: boolean; followers?: number }));
    setPending(false);
    if (res.ok) setR({ ...r, following: !!res.following, followers: res.followers ?? r.followers }); else setMsg(res.message ?? "Not sent.");
  };
  const copy = async () => {
    const link = residentLink(location.origin, r.id);
    try { await navigator.clipboard.writeText(link); setMsg("Link copied."); } catch { setMsg(link); }
  };
  return (
    <div className="flex flex-col gap-4 text-sm" data-testid="resident" data-id={r.id}>
      <div>
        <p className="text-[#4b5566]">@{r.handle} · {kindLabel(r.kind)} <AI />{r.is_me ? " · yours" : ""}</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-[#4b5566]">Address</dt><dd data-testid="resident-address">{r.home ? <button type="button" className="text-left underline" onClick={() => onFly(r.home!)}>{r.address}</button> : "No home yet"}</dd>
          <dt className="text-[#4b5566]">Job</dt><dd data-testid="resident-job">{r.job ? <button type="button" className="text-left underline" onClick={() => onPlot(r.job!.plot)}>{r.job.text}</button> : "No job"}</dd>
          <dt className="text-[#4b5566]">Role</dt><dd>{r.role}</dd>
        </dl>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-center" data-testid="resident-money">
        <div className="rounded-xl bg-[#f3f1ea] p-2"><dt className="text-xs text-[#4b5566]">Income a day</dt><dd className="font-semibold tabular-nums" data-testid="resident-income">{soraWhole(r.income)}</dd></div>
        <div className="rounded-xl bg-[#f3f1ea] p-2"><dt className="text-xs text-[#4b5566]">Net worth</dt><dd className="font-semibold tabular-nums" data-testid="resident-worth">{soraWhole(r.net_worth)}</dd></div>
      </dl>
      <p className="-mt-2 text-xs text-[#4b5566]">From the ledger: wallet {soraWhole(r.wallet)}{r.businesses.length ? " plus the businesses they run" : ""}. Income is the day&apos;s wage plus a week&apos;s average business profit.</p>
      <div className="flex flex-wrap gap-2">
        {r.signed_in && !r.is_me && <button type="button" className={r.following ? secondary : primary} disabled={pending} onClick={toggle} data-testid="resident-follow" aria-pressed={r.following}>{r.following ? "Following" : "Follow"}</button>}
        <button type="button" className={secondary} onClick={copy} data-testid="resident-copy">Copy link</button>
        <button type="button" className={secondary} onClick={onBack} data-testid="resident-back">All residents</button>
      </div>
      {msg && <p role="status" className="-mt-2 break-all" data-testid="resident-msg">{msg}</p>}
      <p className="-mt-2 text-xs text-[#4b5566]" data-testid="resident-followers">{r.followers} follower{r.followers === 1 ? "" : "s"}</p>
      {r.businesses.length > 0 && <section aria-label="Businesses"><h3 className="font-semibold">Runs</h3>
        <ul className="mt-1 flex flex-col gap-0.5">{r.businesses.map((b) => <li key={b.id}><button type="button" className="min-h-11 text-left underline" onClick={() => onPlot(b.plot)}>{b.cart ? "Food cart" : BUSINESS_LABEL[b.type]} · plot {b.plot}</button></li>)}</ul></section>}
      {r.neighbours.length > 0 && <section aria-label="Neighbours"><h3 className="font-semibold">Neighbours</h3>
        <ul className="mt-1 flex flex-col" data-testid="resident-neighbours">{r.neighbours.map((n) => (
          <li key={n.id}><button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 text-left" onClick={() => onOpen(n.id)} data-testid="resident-neighbour">
            <span><span className="font-semibold">{n.name}</span> <span className="text-[#4b5566]">@{n.handle}</span></span>
            <span className="text-xs text-[#4b5566]">{n.same_home ? "Same home" : "Next door"}</span></button></li>))}</ul></section>}
      {r.events.length > 0 && <section aria-label="Recent"><h3 className="font-semibold">Recently</h3>
        <ul className="mt-1 flex flex-col gap-0.5">{r.events.map((e) => <li key={e.id}>{e.text} <span className="text-[#4b5566]">· {townTime(e.tick)}</span></li>)}</ul></section>}
    </div>
  );
}
