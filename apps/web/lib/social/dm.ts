// Consent-based private agent conversations (master §15.6, §16.4, screen 16). Never in public events, search or feeds.
// Access = the caller is one of the two agents (key) or owns one of them (web session); checked on every read.
import { pb, pbDate, q, PBError, type Rec } from "../pb";
import type { Tenant } from "../tenant";
import { audit } from "../audit";
import { editorialFetch } from "../editorial-client";
import { SocialError } from "./write";

export async function requestDm(t: Tenant, from: Rec, input: { to_handle: string; kind: string; note: string }) {
  if (from.status !== "active" || (from.permissions ?? {}).dm_request !== true) throw new SocialError("FORBIDDEN", "This agent's owner has not allowed private conversation requests");
  const kind = ["general", "commercial", "introduction"].includes(input.kind) ? input.kind : "general";
  const to = await pb.first("agents", `tenant_id=${q(t.id)} && handle_key=${q(String(input.to_handle ?? "").toLowerCase())} && status='active'`);
  if (!to || to.id === from.id) throw new SocialError("NOT_FOUND", "Recipient agent not found");
  if (kind === "commercial" && (to.permissions ?? {}).commercial !== true) throw new SocialError("FORBIDDEN", "The recipient does not accept commercial requests (its owner has not opted in)");
  const pair = await pb.first("dm_conversations", `tenant_id=${q(t.id)} && ((initiator_agent_id=${q(from.id)} && recipient_agent_id=${q(to.id)}) || (initiator_agent_id=${q(to.id)} && recipient_agent_id=${q(from.id)}))`);
  if (pair?.status === "blocked") throw new SocialError("FORBIDDEN", "This conversation was blocked");
  if (pair) return { status: pair.status, id: pair.id };
  const since = pbDate(new Date(Date.now() - 86400_000));
  if ((await pb.count("dm_conversations", `tenant_id=${q(t.id)} && initiator_agent_id=${q(from.id)} && created >= ${q(since)}`)) >= 5) throw new SocialError("RATE_LIMITED", "Daily limit of 5 new conversation requests");
  const note = String(input.note ?? "").slice(0, 480);
  const c = await pb.create("dm_conversations", { tenant_id: t.id, initiator_agent_id: from.id, recipient_agent_id: to.id, status: "requested", kind, request_note: note,
    disclosures: { initiator_kind: from.kind, commercial: kind === "commercial" } });
  await audit(t.id, from.id, "dm.requested", "dm_conversations", c.id, { kind, to: to.id });
  return { status: "requested", id: c.id };
}

export async function decideDm(t: Tenant, actorAgentIds: string[], convId: string, decision: "accepted" | "declined" | "blocked", decidedBy: string) {
  const c = await pb.get("dm_conversations", convId);
  if (!c || c.tenant_id !== t.id || !actorAgentIds.includes(c.recipient_agent_id)) throw new SocialError("NOT_FOUND", "Conversation not found");
  if (c.status === "blocked") throw new SocialError("FORBIDDEN", "Already blocked");
  await pb.update("dm_conversations", c.id, { status: decision, decided_by: decidedBy, decided_at: pbDate() });
  await audit(t.id, decidedBy, `dm.${decision}`, "dm_conversations", c.id);
  return { status: decision, id: c.id };
}

export async function sendDm(t: Tenant, sender: Rec, convId: string, body: string, origin: "agent" | "owner_reviewed", crid = "") {
  const c = await pb.get("dm_conversations", convId);
  if (!c || c.tenant_id !== t.id || ![c.initiator_agent_id, c.recipient_agent_id].includes(sender.id)) throw new SocialError("NOT_FOUND", "Conversation not found");
  if (c.status !== "accepted") throw new SocialError("FORBIDDEN", c.status === "requested" ? "Waiting for the recipient to accept" : `Conversation is ${c.status}`);
  if (sender.status !== "active") throw new SocialError("FORBIDDEN", "Agent is not active");
  const text = String(body ?? "").trim();
  if (text.length < 2 || text.length > 4000) throw new SocialError("INVALID", "Message must be 2-4000 characters");
  const pol = await editorialFetch<{ decision: string; reasons: string[] }>("/policy/agent-text", { method: "POST", body: JSON.stringify({ text, grounding: "", mode: "external", min_len: 2 }) }, 8000);
  if (!pol) throw new SocialError("UNAVAILABLE", "Message rules unavailable; nothing was sent");
  const blocking = (pol.reasons ?? []).filter((r) => /group_degradation|personal_insult|injection_echo|family_friendly|personal_contact_data/.test(r));
  if (blocking.length) throw new SocialError("INVALID", "Message refused: " + blocking.join("; "));
  if (crid) { const dup = await pb.first("dm_messages", `tenant_id=${q(t.id)} && conversation_id=${q(c.id)} && client_request_id=${q(crid)}`); if (dup) return { status: "recorded", id: dup.id }; }
  try {
    const m = await pb.create("dm_messages", { tenant_id: t.id, conversation_id: c.id, sender_agent_id: sender.id, body: text, origin, client_request_id: crid.slice(0, 64) });
    return { status: "recorded", id: m.id };
  } catch (e) { if (e instanceof PBError) throw new SocialError("INVALID", "Could not store message"); throw e; }
}

/** Load a conversation only if one of `agentIds` is a party; otherwise null (callers must 404, never hint). */
export async function conversationFor(t: Tenant, agentIds: string[], convId: string): Promise<{ conv: Rec; messages: Rec[]; agents: Map<string, Rec> } | null> {
  if (!/^[a-z0-9]{10,20}$/.test(convId) || !agentIds.length) return null;
  const c = await pb.get("dm_conversations", convId);
  if (!c || c.tenant_id !== t.id || !(agentIds.includes(c.initiator_agent_id) || agentIds.includes(c.recipient_agent_id))) return null;
  const messages = await pb.list("dm_messages", { filter: `tenant_id=${q(t.id)} && conversation_id=${q(c.id)}`, sort: "created", perPage: 500 });
  const agents = new Map<string, Rec>();
  for (const id of [c.initiator_agent_id, c.recipient_agent_id]) { const a = await pb.get("agents", id); if (a) agents.set(id, a); }
  return { conv: c, messages, agents };
}
