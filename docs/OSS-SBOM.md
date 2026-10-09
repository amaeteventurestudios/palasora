# OSS bill of materials (generated 2026-10-09 from lockfiles / installed packages)

Regenerate: `cd apps/web && pnpm licenses list --prod --json` and the Python snippet in the report. Versions are exact pins from `apps/web/pnpm-lock.yaml` and `services/editorial/requirements.lock`.

## Runtime binaries

| Component | Version | License | Source / verification |
|---|---|---|---|
| PocketBase | 0.40.5 | MIT | GitHub release, SHA-256 verified against upstream checksums.txt |
| Node.js (host) | 24.14.1 | MIT | Homebrew; container base node:22.20.0-alpine3.22 |
| Python (host) | 3.11.15 | PSF-2.0 | Homebrew; container base python:3.11.15-slim-bookworm |
| SQLite (Python) | 3.53.4 | Public domain | bundled |
| Ollama + qwen3.5:4b | remote (Simeon's iMac) | Ollama MIT; Qwen model license per Alibaba (not redistributed; no weights on this Mac) | not installed here |
| Inter, Source Serif 4 fonts | via next/font (self-hosted at build) | SIL OFL 1.1 | Google Fonts |
| Lucide icons | lucide-react 1.47.0 | ISC | npm |

## Web production dependencies (16 packages)

License summary: MIT: 10, ISC: 2, Apache-2.0: 1, CC-BY-4.0: 1, BSD-3-Clause: 1, 0BSD: 1

| Package | Version | License |
|---|---|---|
| @next/env | 15.5.27 | MIT |
| @swc/helpers | 0.5.15 | Apache-2.0 |
| caniuse-lite | 1.0.30001815 | CC-BY-4.0 |
| client-only | 0.0.1 | MIT |
| lucide-react | 1.47.0 | ISC |
| nanoid | 3.3.20 | MIT |
| next | 15.5.27 | MIT |
| picocolors | 1.1.1 | ISC |
| postcss | 8.5.29 | MIT |
| react | 19.2.8 | MIT |
| react-dom | 19.2.8 | MIT |
| scheduler | 0.27.0 | MIT |
| source-map-js | 1.2.2 | BSD-3-Clause |
| styled-jsx | 5.1.6 | MIT |
| tslib | 2.8.1 | 0BSD |
| zod | 4.6.5 | MIT |

## Python dependencies (22 packages)

| Package | Version | License |
|---|---|---|
| annotated-types | 0.8.0 | MIT |
| anyio | 4.15.1 | MIT |
| certifi | 2026.7.22 | MPL-2.0 |
| click | 8.5.0 | BSD-3-Clause |
| defusedxml | 0.7.1 | PSFL |
| duckdb | 1.1.3 | MIT |
| fastapi | 0.115.14 | MIT License |
| h11 | 0.16.0 | MIT |
| httpcore | 1.0.9 | BSD-3-Clause |
| httpx | 0.28.1 | BSD-3-Clause |
| idna | 3.20 | BSD-3-Clause |
| iniconfig | 2.3.1 | MIT |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| pip | 26.2.1 | MIT |
| pluggy | 1.6.0 | MIT |
| pydantic | 2.10.6 | MIT |
| pydantic_core | 2.27.2 | MIT |
| pytest | 8.3.5 | MIT |
| setuptools | 82.0.1 | MIT |
| starlette | 0.46.2 | BSD-3-Clause |
| typing_extensions | 4.16.0 | PSF-2.0 |
| uvicorn | 0.32.1 | BSD-3-Clause |
