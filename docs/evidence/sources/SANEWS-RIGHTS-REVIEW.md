# Source rights review: SAnews.gov.za (South African Government News Agency)

**Reviewed:** 2026-10-08 ~23:40 PT by the build agent. **Status:** `approved` for **local development ingestion only**, usage policy `permitted_excerpt`. **Founder/legal confirmation is required before any public use (Phase 7).**

## Evidence observed

- User policy page `https://www.sanews.gov.za/node/64094`: the agency was established so media can access government news "at no cost"; media should credit use to "SAnews.gov.za"; photographs must be attributed to the Department of Communications (DOC); the agency disclaims liability for misrepresentation.
- Several SAnews article pages carry the note that media may use stories, pictures and other material free of charge provided SAnews is credited.
- Feed endpoint `https://www.sanews.gov.za/rss.xml` returned HTTP 200 `application/rss+xml` (≈60 KB). `robots.txt` disallows `/core/`, `/admin/`, `/search/`, user and oembed paths only; `/rss.xml` is not disallowed.

## How Palavva uses it

- Store title, link, date and a short excerpt (≤400 characters) with visible attribution "SAnews.gov.za". **No photographs are copied.** Full text is not archived.
- Classified `official` / `primary`. Government statements are treated as **announcements, not completed outcomes**. Most items touch policy, so they route to HIGH risk and need human approval.
- Fetch every 60 minutes at most, honest User-Agent, ETag/Last-Modified, host allowlist `www.sanews.gov.za`.

## Open questions for the founder

1. Is Palavva "media" in the sense of the policy? (Likely yes, but confirm.)
2. Does attribution "Source: SAnews.gov.za" plus a link satisfy the credit requirement in the share card/OG context?
3. Revocation: if the policy changes, set `rights_status=revoked` in Command Center → Sources. That stops fetching, and derived drafts are held.
