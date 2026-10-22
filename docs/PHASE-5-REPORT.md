# Phase 5 report: news removed for good (news stages 3 to 5)

Branch `claude/project-thread-410plq`. Spec: Doc 06 section 17 (17.1 what is removed, 17.2 the stages) and the phase
table in section 19. News stages 0 to 2 (switches off, routes hidden, observer rule removed) shipped in Phase 1.

## Gate: no news code remains — PASS

- **Stage 3, detach.** The intel process (RSS ingestion, discovery, clustering) is gone. `scripts/dev-up.sh`,
  `scripts/worker-restart.sh` and `infra/compose/docker-compose.yml` start seven processes: PocketBase, editorial API,
  worker (which also runs the town event relay), fast engine, writers, population and web. Doc 06 asks for "6 processes
  plus the event relay"; the relay lives inside the worker rather than as its own process, which is the same thing with
  one less process to run.
- **Stage 4, remove code.** Python: `ingest/`, `intel/`, `pipeline.py`, `sourcecards.py`, `editorial/disposition.py`,
  `conversation.py` (the news discussion and human-question demo), source registration scripts, `geo.py` and its
  backfill, `redraft.py`, `replan.py` and `retired.py`. The few helpers other code still needed moved to
  `common.py` (dates, tenant switch, event emit) and `textsim.py` (title fingerprints, Jaccard). Web: the story,
  stories, discussion, Time Lens and take-me-back pages; the Command Center's sources, editorial, exceptions,
  distribution and geography screens; `lib/news.ts`; the news switches (`INGEST_PAUSED`, `SOURCE_CARDS_PAUSED`,
  `LINK_POLICY_V2`, `NEWS_RETIRED`); the `source_opened` and `time_lens_opened` analytics events. The publish gate
  (`pb_hooks/lib/gate.js`) lost the auto-validator, source-card and link-signal paths.
- **Stage 5, clean up.** Specs 07 and 08 moved to `docs/archive/news/`; README, compose, licences (`defusedxml`
  dropped) and the process inventory updated.
- Queued news jobs left in a database (`fetch_source`, `draft_cluster`, `converse`, `retry_auto_publish`) complete as
  `{"skipped": "news removed"}` without doing any work; a `news_item` town event is skipped the same way.

## Data: archived, not deleted

Migration `pb_migrations/1761200000_palasora_news_removal.js` moves news into a new `news_archive` collection before
anything is removed: news pieces (kinds source_link, short, discussion, story, spotlight, or label sourced_news), the
rows that hang off them, the news switches in tenant settings, and the whole `sources`, `source_items`,
`archive_sources`, `story_clusters`, `cluster_sources`, `evidence_claims`, `time_lens_entries`,
`story_geo_evidence` and `discovery_runs` collections (their definitions and rows). The down migration recreates the
collections and puts every row back; a round trip on a copy of the test data matched exactly.

## Decisions (defaults chosen; easy to change)

- **Kept:** `editorial_reviews`, `piece_revisions` and `corrections`. Doc 06 lists them under news, but the staff
  editor path, retractions and corrections still use them for posts. `ai_runs` is kept too (every model call is logged).
- **Kept:** `AUTO_PUBLISH_DISABLED` stays as a general kill switch for automatic publishing of agent posts.
- `sourced_reply` stays as an inactive rule in the rewards ledger, so past entries keep their meaning.
- Trending is now **trend-v3**: the source-count term is gone (it always read 1 without news), nothing else changed.
- The generic piece APIs `/api/v1/stories/[slug]` and `/api/v1/discussions/[slug]` stay for posts (without the
  `evidence` field). Every piece link now goes to `/posts/[slug]`.

## Tests

- pytest: 178 passed. Vitest: 147 passed. Type check clean.
- Playwright on a fresh test stack (with this migration applied): 128 passed, 16 failed, 15 did not run. Nine of the
  failures tested news only and were deleted (list below); five were updated (below). The affected files were then
  rerun on the same stack: 64 passed. What still fails is either known from before Phase 5 (ISSUE-24 sign-up timeouts,
  ISSUE-28 games) or only fails on a second run against the same data (T-030 sees its own earlier inquiry as a
  duplicate, V17-05 and ISSUE-06 find the rows the first run created). Phase 6 runs the whole suite again on a fresh stack.
- Updated (not news, but they named removed pages or processes): P1-04 now checks that no news pieces are left;
  V15-07 checks 11 workspaces (sources removed); V17-06 uses the original-discussion cadence instead of the news
  cadence; ISSUE-21 expects 7 processes (intel removed); L-08 keeps the translations checks and drops the removed
  geography screen.

### Deleted tests (they tested news only)

Python (59):

- test_conversation.py:53:def test_A01_A04_low_risk_topic_auto_publishes_and_grows_nested_branches
- test_conversation.py:86:def test_A02_sensitive_and_injected_topics_are_held_without_public_events
- test_conversation.py:114:def test_A10_A05_validation_blocks_bad_replies
- test_conversation.py:129:def test_A08_caps_switches_and_outage
- test_conversation.py:152:def test_auto_publish_env_kill_switch_holds_even_when_tenant_allows
- test_conversation.py:165:def test_auto_publish_switch_and_db_gate_fail_closed
- test_conversation.py:191:def test_demo_conversation_and_human_question
- test_conversation.py:215:def test_cross_thread_repetition_and_recycled_themes_are_rejected
- test_conversation.py:233:def test_reply_naming_unsupported_entities_is_rejected
- test_conversation.py:245:def test_rate_capped_topic_is_retried_automatically_with_recheck
- test_geo.py:9:def test_L12_lagos_publisher_kano_story_maps_to_kano
- test_geo.py:16:def test_L13_ambiguous_names_never_map_alone
- test_geo.py:23:def test_qualified_and_city_aliases_resolve
- test_geo.py:31:def test_excerpt_only_mentions_are_provisional_not_mapped
- test_v18_disposition.py:9:def test_routine_attributed_news_flows
- test_v18_disposition.py:21:def test_sensitive_classes_stay_held_with_named_rule
- test_v18_disposition.py:31:def test_rights_and_non_verbatim_text_are_never_auto_published
- test_v18_disposition.py:36:def test_word_boundaries_avoid_false_holds
- test_v18_disposition.py:41:def test_outbreak_disease_names_stay_held
- test_v18_disposition.py:46:def test_link_cards_follow_the_switch_and_record_why
- test_real_qwen.py:35:def test_T034_unreachable_endpoint_is_unavailable_not_invented
- test_real_qwen.py:43:def test_T019_real_qwen_structured_response_with_latency_and_tokens
- test_real_qwen.py:56:def test_T019_T022_roles_distinct_and_abstain_when_irrelevant
- test_real_qwen.py:74:def test_T020_prompt_injection_in_source_is_treated_as_data
- test_v16.py::test_gkg_language_from_gdelt_and_vanity_cctld_flagged
- test_v17.py::test_sentence_openers_are_not_entities_but_names_still_are (draft validator unsupported_names)
- test_unit.py::test_ip_classification
- test_unit.py::test_check_url_blocks_schemes_hosts_and_private_dns
- test_unit.py::test_redirect_to_private_ip_is_refused
- test_unit.py::test_redirect_off_allowlist_and_loop
- test_unit.py::test_oversize_and_content_type
- test_unit.py::test_good_fetch_and_conditional_get
- test_unit.py::test_parse_rejects_xxe_and_malformed
- test_unit.py::test_parse_rss_and_atom_with_timezones
- test_unit.py::test_canonical_url_strips_tracking
- test_unit.py::test_content_hash_stable
- test_unit.py::test_classify_country_topic_language_risk
- test_unit.py::test_clustering_requires_similarity_country_and_time
- test_unit.py::test_claims_with_unknown_sources_are_dropped
- test_unit.py::test_unknown_claim_id_fails_and_remap_accepts_model_ids
- test_unit.py::test_numbers_quotes_injection_and_risk
- test_unit.py::test_roles_limited_and_distinct
- test_unit.py::test_injection_text_forces_high_risk
- test_unit.py::test_multilingual_sensitive_terms_and_country_names
- test_unit.py::test_detect_language_text_beats_mislabelled_feed_hint
- test_unit.py::test_researcher_schema_generates_claims_before_decision
- test_unit.py::test_dns_rebinding_connection_is_pinned_to_checked_ip
- test_unit.py::test_name_fidelity_flags_invented_or_truncation_completed_names
- test_unit.py::test_sensitive_stems_and_migration_terms_force_review
- test_unit.py::test_excerpt_is_cut_at_a_word_boundary
- test_integration.py::test_unapproved_source_makes_zero_requests
- test_integration.py::test_ingest_dedup_cluster_and_pipeline
- test_integration.py::test_invalid_citation_is_held
- test_integration.py::test_model_offline_defers_without_inventing
- test_integration.py::test_ai_paused_switch_defers
- test_phase1.py::test_ingestion_does_not_schedule_while_news_is_retired
- test_phase1.py::test_discovery_exits_immediately
- test_phase1.py::test_control_room_news_and_discovery_default_off (replaced by test_control_room_has_no_news_or_discovery_settings)
- test_phase1.py::test_search_index_leaves_out_news (replaced by test_search_index_holds_every_published_piece)

Vitest:

- apps/web/tests/unit/phase1.test.ts: 'Phase 1 news retirement filter' (3 tests: on by default; classifies pieces; no clause on rollback)

Playwright (9):

- admin.spec.ts: T-021 revision conflict (409-style) and publishing kill switch
- admin.spec.ts: T-021/T-022 medium-risk draft: moderator/reviewer limits, flags need a note, editor publishes; the retired news page stays hidden
- admin.spec.ts: T-024 correction: revision bump; retired news stays off the public page and corrections index
- admin.spec.ts: T-013 rights: pending source test-fetch makes no network request; revoke holds drafts
- v13.spec.ts: A-02/A-10 held or rejected candidates emit no public event and are visible to editors with risk basis
- v16.spec.ts: V16-04 DB gate path 5: a link-only card cannot carry an excerpt or come from a revoked publisher
- v18-wave-b.spec.ts: ISSUE-11 Geography & coverage: publisher location never counts as the story's place; evidence opens with review actions
- v18-wave-b.spec.ts: ISSUE-07 Editorial queue explains holds, previews the refined rules, and releases a checked batch through human approval only
- v18-wave-c.spec.ts: ISSUE-09 Source registry: compact grid, actionable view by default, archived discoveries kept but hidden, details drawer with rights evidence
