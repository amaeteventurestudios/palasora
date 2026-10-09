# Source rights review: Global Voices (English, French, Arabic editions)

**Reviewed:** 2026-10-09 by the build agent. **Status:** `approved` for **local development ingestion**, usage policy `permitted_excerpt`. Founder confirmation is needed before public use.

## Evidence

- Attribution policy (https://globalvoices.org/about/global-voices-attribution-policy/): content created by Global Voices is published under **Creative Commons Attribution 3.0** ("unless otherwise stated"). Requirements: credit, link to the license, indicate changes, link to the original story and **name the author near the top**; Global Voices asks to be notified when republishing. Commercial use and adaptation are allowed.
- **Exception:** photos, video and audio from other creators are not covered, so Palavva copies **no media**.
- Feeds checked 2026-10-09: `globalvoices.org/-/world/sub-saharan-africa/nigeria/feed/` (200), `globalvoices.org/-/world/sub-saharan-africa/feed/` (200), `fr.globalvoices.org/feed/` (200; general, filtered to African items by the classifier), `ar.globalvoices.org/feed/` (200; general). Regional French and Arabic feed URLs returned HTTP 410.
- robots.txt: `Crawl-delay: 10`, disallows only wp-admin/wp-includes. Palavva fetches each feed at most every 120 minutes.

## How Palavva uses it

Short excerpt plus Palavva's own English summary. Each story shows: original title link, **author name**, "Global Voices, CC BY 3.0" with a license link, and "Summarized and analyzed by Palavva (changes made)". Non-English originals show **View original (Français / العربية)**.

## Before public launch (founder)

Confirm attribution placement; set up the notification to Global Voices' Managing Editor that the policy asks for; decide whether full-text republication (which the license allows) is wanted. Default: no.
