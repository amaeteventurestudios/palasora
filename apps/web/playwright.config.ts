import { defineConfig } from "@playwright/test";

// Runs against the isolated test stack (scripts/test-stack.sh up) on :3300. Never the dev dataset.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "../../docs/evidence/e2e/results.json" }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3300", screenshot: "only-on-failure", trace: "off" },
  outputDir: "../../docs/evidence/e2e/artifacts",
});
