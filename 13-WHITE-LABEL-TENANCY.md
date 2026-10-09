# 13. White-label architecture and one tenant proof

**Project context:** Palavva MVP implementation specification.

## Scope

A future customer should run a separately branded African discussion and intelligence community with its own domain, audience, content, staff, sponsorship configuration and analytics. MVP creates **one real isolated sample tenant** and all required authorization boundaries, **not** customer self-serve billing/provisioning or dozens of tenants. Vencore is only a possible reference, not a chosen dependency.

## Tenant ownership rules

- Primary platform tenant and demonstration tenant are distinct records. Every application row carrying business/editorial/user/customer data has explicit immutable `tenant_id`. Shared country/topic dictionaries are read-only reference data, with tenant-specific enablement stored separately.
- Request host maps to tenant through trusted, server-owned config. Wildcard hostnames or user-sent tenant IDs are not accepted as proof of entitlement. Unknown host returns generic not-found.
- Session auth and role memberships are tenant-scoped. Platform admins have explicit **audited cross-tenant** access with visible selected context; tenant admins may see only their own.
- Published content, search FTS, cached pages, media attachments, comments, sources, logs, analytics, sponsor maps, brand and AI quota counters are tenant-scoped.
- On host/tenant change, invalidate tenant-specific cache/session assumptions. Server checks data ownership even for guessed opaque IDs and nested foreign-key references.

## Configuration contract

```json
{
  "tenant_id": "opaque",
  "slug": "sample-community",
  "display_name": "Sample Africa Community",
  "hostnames": ["example.invalid"],
  "brand": {
    "wordmark_text": "Sample Africa Community",
    "logo_asset_id": null,
    "primary_color": "#173C32",
    "accent_color": "#F8DC9C",
    "favicon_asset_id": null,
    "theme": "system"
  },
  "content": {"countries": ["NG", "GH"], "topics": ["fintech", "food"]},
  "features": {"ai_editorial": true, "public_comments": true, "ads": false},
  "quota": {"daily_ai_requests": 10, "max_agent_replies_per_story": 2},
  "billing": {"cycle": "monthly", "status": "not_enabled"}
}
```

This uses **example.invalid**, not a proposed real domain or live account. Enforce visual theme token validation (contrast and CSS injection), no arbitrary HTML from tenant config, image rights, safe CSP for custom logo assets.

## Feature flags/entitlements

`tenant_features`: categories for `public_feed`, `discussions`, `human_comments`, `editorial_ai`, `history`, `business_directory`, `revive_ads`, `crm_bridge`, `newsletter_future`, `external_agents_future`. Default disabled for incomplete integrations. Entitlements store `plan_key`, `billing_cycle` (monthly, quarterly, six-month, annual), `effective_at`, `expires_at`, `source_of_truth`, `state=not_enabled`; no invented bill or provider selection.

## Brand admin

Tenant manager can select valid approved logo, wordmark text, favicon, colors, language default, topic/country menus, homepage introduction, allowed ad slots (if platform enables) and own editors/moderators. The admin cannot edit another tenant's approved sources or platform model endpoints. Brand changes go through preview, validation, audit and activate action; custom-domain DNS activation requires owner approval and cert provisioning safeguards.

## Tenant budgets and AI

Each AI job receives tenant ID at source cluster; model usage charged to that tenant's **measured** quota counters, never reading another tenant's documents. Provider defaults chosen by platform policy; tenant admins may choose among allowed routed models if enabled, but cannot see global API keys. Per-tenant concurrency and daily caps avoid one customer's content exhausting shared local Qwen.

## Isolation validation

Build two users with identical role names across tenants, same slugs, similar content and separate image uploads. Negative tests must assert:

1. Tenant A member can't GET, list, search, edit, save, vote, report or download tenant B private or public-under-other-host content through tenant A host.
2. Tenant A editor can't publish tenant B drafts, forge `tenant_id` in JSON, retrieve tenant B audit source or manipulate second-tenant relations.
3. Tenant A API token has no access through list filters, URL traversal, nested relations, file URLs, analytics aggregation or cache poisoning.
4. SSR under host A cannot display B's menu/story thumbnail or sponsor zone, even after cache warm-up on B.
5. Tenant B session doesn't silently work as tenant A membership. Platform admin switches are deliberate, stamped and reversible.
6. Both tenants can restart, seed and restore without overwriting each other; backup access policy covers whole shared DB but tenant admin export is scoped.

If any negative access test fails: **do not stage as ready for customer use**. Optional hard isolation using separate databases/instances can be revisited for enterprise later, but MVP shared-app isolation must be demonstrably sound.

## Vencore status

https://github.com/vencorehq/Vencore was a reference considered in planning, **not a deployment decision**. Auditing its license, maintenance, resource footprint and any patterns is optional; do not add it as a second CRM/white-label enterprise stack unless a later ADR proves need.
