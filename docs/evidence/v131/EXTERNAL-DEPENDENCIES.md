# External dependencies (not locally solvable)

These items stay **PARTIAL** or **BLOCKED** because they need something outside this Mac: approvals, people, credentials or data that doesn't exist yet. Nothing here has been marked complete.

| Scenario | What is done locally | What is missing | Who or what can unblock it |
| --- | --- | --- | --- |
| **L-06** Senegalese French story read in English | Mechanism proven with the Arabic-source Global Voices Mozambique topic: English reader, original-language link, attribution, preferences unchanged. French↔English translation path verified on real items. | A *fresh* rights-approved Senegalese French item. Global Voices French items were all older than the 7-day freshness window. | Approve a Senegalese/Francophone source (e.g. APS, Le Soleil, after a rights review), or wait for fresh Global Voices French coverage. |
| **L-07** Nigeria feed mix | Edition boost, de-duplication, no fabricated translations, Pidgin honestly unavailable. | Rights-approved Nigerian sources with current items. The Global Voices Nigeria feed is approved but its items were stale; Pidgin, Yoruba, Igbo and Hausa content doesn't exist. | Founder rights decisions on Nigerian publishers; native-language sources. |
| **L-18** Script rendering for supported locales | Arabic (Noto Sans Arabic, bidi plaintext, RTL menus), French and Pidgin verified at 320/390 px by automated tests. | Native-speaker QA of the UI strings and translations. Ge'ez/Amharic and other scripts are not enabled. | Native reviewers (fr, ar, pcm); a decision to enable more locales. |
| Translation quality (L-08 residue) | Automatic gate, repair pass, re-validation. Every output labelled unreviewed. See `TRANSLATION-REVIEW.md`. | Human review of meaning, register and terminology; Arabic transliterations of names. | Native French and Arabic reviewers using `/admin/translations`. |
| **T-009** email delivery | Sign-up verification works end to end against the local mail sink. Session expiry is now time-travel tested (PASS). | Real outbound email (SMTP or provider). | SMTP credentials; a sending-domain decision. |
| **T-023** Time Lens positive path | Honest empty states; the pipeline refuses unverifiable comparisons. | Verified archival records for any topic. | An approved archive source (newspaper archive or licensed dataset). |
| **T-030** EspoCRM forward | Inquiries stored durably as `NOT_CONFIGURED`. | EspoCRM credentials and URL (Hetzner, not to be touched). | Founder approval to connect Hetzner EspoCRM. |
| **T-031** Revive ad server | Sponsored slots collapse cleanly without Revive. | Revive zone IDs and delivery URL (Hetzner). | Founder approval. |
| **T-032** sponsored spotlights with real data | Malicious URLs blocked (22-case test); labels verified. | Real sponsors and spotlights. | Commercial onboarding. |
| **T-037** off-host backup | Local backup, restore drill and rollback drill all pass. | An approved off-host destination. | Founder decision (e.g. encrypted object storage). |
| **T-038 / T-001** Oracle staging, ARM64 | Containers built and smoke-tested locally (linux/amd64, Colima): 18/18 checks. | ARM64 build/run, Oracle network scan, deployment. | `ORACLE_DEPLOYMENT_AUTHORIZED=true` from the founder. Not requested in this task. |
| **T-040** manual screen-reader pass | axe WCAG 2.2 AA: 0 violations in both themes; keyboard, focus and reduced-motion automated. | A human using VoiceOver/NVDA/TalkBack. | An accessibility tester. |
| Public launch | Everything stays loopback-only; robots `Disallow: /`. | `PUBLIC_LAUNCH_AUTHORIZED=true`. | Founder. |
