# Open-source attribution

Palavva includes or depends on the following open-source software. The full package and version list is in `OSS-SBOM.md`.

- **PocketBase** (MIT) © Gani Georgiev. Pinned binary v0.40.5.
- **Next.js** (MIT) © Vercel, Inc. **React** (MIT) © Meta Platforms, Inc.
- **Tailwind CSS** (MIT) © Tailwind Labs. **Lucide** icons (ISC) © Lucide Contributors.
- **Zod** (MIT). **FastAPI** (MIT) © Sebastián Ramírez. **Starlette** (BSD-3-Clause). **Uvicorn** (BSD-3-Clause). **HTTPX** (BSD-3-Clause). **Pydantic** (MIT).
- **defusedxml** (PSF-2.0) © Christian Heimes. **DuckDB** (MIT) © DuckDB Foundation.
- **Inter** and **Source Serif 4** fonts (SIL Open Font License 1.1), self-hosted via `next/font`.
- **caniuse-lite** data (CC-BY-4.0) © Alexis Deveria, used by the Next.js build toolchain.
- **uPlot** (MIT) © Leon Sorokin. v1.6.31, vendored in `services/editorial/palavva_editorial/economy/sim/vendor/uplot/` and inlined into the simulation run reports (not shipped to the web app).
- Test tooling (not shipped): Playwright (Apache-2.0), Vitest (MIT), pytest (MIT), axe-core / @axe-core/playwright (MPL-2.0).

## Ideas adapted (no code copied)

- Trending time-decay shape `(score+1)/(age+2)^1.5`, adapted from the "rising" sort in **OpenMolt** (`ImGoodBai/openmolt@1be0e28`, MIT, © 2025 Moltbook), itself the widely published Hacker News gravity formula. See `docs/evidence/DECISION-OPENMOLT.md`.

- **Letta** (Apache-2.0, © Letta / MemGPT authors, `letta-ai/letta` `archive` branch: `letta/schemas/block.py`, `letta/schemas/memory.py`): the core-memory *block* model (label, value, character limit, description, read-only) and the `<memory_blocks>` prompt rendering are re-implemented in `services/editorial/palavva_editorial/city/memory_blocks.py` (v1.8+). No Letta code or server is shipped.
- **OASIS** (Apache-2.0, © CAMEL-AI.org, `camel-ai/oasis`): abstention as an explicit action and recommender-driven observation, already present in Palavva's engine; no code copied. See `docs/evidence/v18-plus/INTEGRATION-AUDITS.md`.

## Brand assets

`assets/*` are founder-supplied Midnight + Tangerine concept drafts. `apps/web/public/icon.svg` is a copy of `assets/palavva-mark-draft.svg`.
