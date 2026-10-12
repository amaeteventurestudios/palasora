import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EspoClient, EspoError, pushStage, upsertLead } from "../../lib/crm/espo";
import { startEspoFixture, type Espo } from "../fixtures/espo-fixture";

let fx: Espo, c: EspoClient;
beforeAll(async () => { fx = await startEspoFixture(); c = new EspoClient(fx.url, "fixture-key", fetch, 2000); });
afterAll(() => fx.close());
const inq = { reference: "PV-20261012-ABC123", contact_name: "Ada Obi Eze", email: "ada@example.test", business: "Kano Solar Ltd", industry: "energy", region: "West Africa", country: "NG", promote: "solar kits" };

describe("ISSUE-18 EspoCRM adapter (against the local API fixture, not the live CRM)", () => {
  it("authenticates and pings", async () => { expect((await c.ping()).user).toBe("palavva-api"); });
  it("creates a lead once; a second inquiry from the same e-mail links the existing lead (no duplicate)", async () => {
    const a = await upsertLead(c, inq);
    expect(a.linked).toBe("created");
    expect(fx.store.Lead[a.leadId]).toMatchObject({ firstName: "Ada", lastName: "Obi Eze", emailAddress: "ada@example.test", accountName: "Kano Solar Ltd", status: "New" });
    expect(String(fx.store.Lead[a.leadId].description)).toContain("[Palavva PV-20261012-ABC123]");
    const b = await upsertLead(c, { ...inq, reference: "PV-20261012-DEF456" });
    expect(b).toEqual({ leadId: a.leadId, linked: "existing_lead" });
    expect(Object.keys(fx.store.Lead)).toHaveLength(1);
  });
  it("from 'qualified' the deal gets one Account, Contact and Opportunity; later stages update the same records", async () => {
    const q1 = await pushStage(c, inq, "qualified");
    expect(fx.store.Opportunity[q1.crm_opportunity_id!]).toMatchObject({ stage: "Qualification", accountId: q1.crm_account_id });
    expect(fx.store.Lead[q1.crm_lead_id!].status).toBe("Converted");
    const w = await pushStage(c, { ...inq, ...q1 }, "won");
    expect(w).toEqual(q1);
    expect(fx.store.Opportunity[q1.crm_opportunity_id!].stage).toBe("Closed Won");
    expect(Object.keys(fx.store.Account)).toHaveLength(1); expect(Object.keys(fx.store.Opportunity)).toHaveLength(1); expect(Object.keys(fx.store.Contact)).toHaveLength(1);
  });
  it("classifies failures: refused key is not retried; outages and dropped connections are", async () => {
    for (const [m, kind, retriable] of [["401", "auth", false], ["500", "server", true], ["drop", "network", true]] as const) {
      fx.mode.value = m;
      const e = await c.ping().catch((x) => x);
      expect(e).toBeInstanceOf(EspoError); expect(e.kind).toBe(kind); expect(e.retriable).toBe(retriable);
    }
    fx.mode.value = "ok";
    const bad = await new EspoClient(fx.url, "wrong-key").ping().catch((x) => x);
    expect(bad.kind).toBe("auth");
    expect(fx.calls.some((x) => x.startsWith("DELETE"))).toBe(false); // the adapter never deletes CRM records
  });
});
