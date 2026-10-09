import { randomUUID } from "node:crypto";
import { pb } from "./pb";

export async function audit(tenantId: string, actorId: string, action: string, objectType: string, objectId: string,
  meta: Record<string, unknown> = {}, revision = 0, actorType: "user" | "service" | "system" = "user"): Promise<void> {
  await pb.create("audit_events", {
    tenant_id: tenantId, actor_type: actorType, actor_id: actorId, action, object_type: objectType, object_id: objectId,
    revision, metadata_safe: meta, request_id: randomUUID(),
  });
}
