// Palasora Phase 4 (Doc 06 section 13, "failed deliveries"): the town event relay. Deliveries that failed MAX_ATTEMPTS times
// wait here, held; nothing is lost and nothing is posted twice. Staff retry them after fixing the cause, and can withdraw an
// event (its post is retracted with the public reason; notifications are removed). Read from the economy service.
import { getTenant } from "@/lib/tenant";
import { getSession, can } from "@/lib/session";
import { economyGet } from "@/lib/economy";
import { townTime, type Outbox } from "@/lib/town";
import { townRetry, townWithdraw } from "@/app/actions/city";
import { AdminPage } from "@/components/admin/AdminPage";
import { AdminForm } from "@/components/admin/AdminForm";
import { ConfirmAction } from "@/components/admin/ConfirmAction";

export const metadata = { title: "Town events" };
export const dynamic = "force-dynamic";
const VIEWS = ["feed", "notifications", "world", "profile", "records", "report"];

export default async function TownEvents() {
  const t = await getTenant();
  const session = await getSession(t);
  const admin = can(session, "economy", "administer");
  const o = await economyGet<Outbox>("/admin/town/outbox?limit=200");
  return (
    <AdminPage title="Town events" narrative={<>Every town event is written once and delivered to each view: the feed (public events only), notifications (the people it is about), live updates, place SubPals, records and reports. A delivery that fails {o?.max_attempts ?? 5} times is <b>held</b> here.</>}>
      {!o ? <p className="text-danger" role="alert">Economy service unavailable.</p> : (<>
        <section aria-labelledby="town-counts" data-testid="town-outbox">
          <h2 id="town-counts" className="text-lg font-bold">Deliveries by view</h2>
          <table className="mt-2 w-full text-sm"><thead><tr className="text-start text-muted-foreground"><th className="text-start">View</th><th className="text-end">Delivered</th><th className="text-end">Pending</th><th className="text-end">Held</th></tr></thead>
            <tbody>{VIEWS.map((v) => <tr key={v}><td>{v}</td><td className="text-end tabular-nums">{o.counts[v]?.delivered ?? 0}</td><td className="text-end tabular-nums">{o.counts[v]?.pending ?? 0}</td>
              <td className="text-end tabular-nums" data-testid={`held-${v}`}>{o.counts[v]?.held ?? 0}</td></tr>)}</tbody></table>
        </section>
        <section className="mt-6" aria-labelledby="town-held">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="town-held" className="text-lg font-bold">Held deliveries</h2>
            {admin && o.held.length > 0 && <ConfirmAction action={townRetry} fields={{}} label="Retry all" title="Retry every held delivery?" body="Each goes back in the relay queue. Events already shown are not shown again." testid="town-retry-all" />}</div>
          {o.held.length === 0 ? <p className="mt-2 text-muted-foreground" data-testid="town-held-empty">Nothing is held.</p> : (
            <ul className="mt-2 flex flex-col gap-2">{o.held.map((h) => (
              <li key={`${h.event_id}:${h.destination}`} className="rounded-lg border border-border p-3 text-sm" data-testid="town-held-row">
                <p><b>{h.event_id}</b> → {h.destination} · {h.kind} ({h.visibility}) · {townTime(h.tick)} · {h.attempts} attempts</p>
                <p className="text-muted-foreground">{h.text}</p><p className="text-danger">{h.last_error}</p>
                {admin && <ConfirmAction action={townRetry} fields={{ event_id: h.event_id, destination: h.destination }} label="Retry" title={`Retry ${h.event_id} → ${h.destination}?`} body="It goes back in the relay queue." />}
              </li>))}</ul>)}
        </section>
        {admin && <section className="mt-6 max-w-lg" aria-labelledby="town-withdraw">
          <h2 id="town-withdraw" className="text-lg font-bold">Withdraw an event</h2>
          <p className="text-sm text-muted-foreground">For an event recorded in error. The event stays in the records, marked withdrawn; its post is retracted with your reason.</p>
          <AdminForm action={townWithdraw} submit="Withdraw" confirm="Withdraw this event? Its post will be retracted.">
            <label className="text-sm font-semibold">Event id<input name="event_id" required pattern="ev-[0-9]{8}" placeholder="ev-00000042" className="input mt-1 w-full" /></label>
            <label className="text-sm font-semibold">Public reason<input name="reason" required minLength={3} maxLength={300} className="input mt-1 w-full" /></label>
          </AdminForm>
        </section>}
      </>)}
    </AdminPage>
  );
}
