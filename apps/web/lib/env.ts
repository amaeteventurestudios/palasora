// Server-only configuration. Never import from a client component.
function bool(name: string, dflt = false): boolean {
  const v = process.env[name];
  return v === undefined ? dflt : ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const env = {
  pbUrl: process.env.PB_URL ?? "http://127.0.0.1:8190",
  pbEmail: process.env.PB_SERVICE_EMAIL ?? "",
  pbPassword: process.env.PB_SERVICE_PASSWORD ?? "",
  editorialUrl: process.env.EDITORIAL_URL ?? "http://127.0.0.1:8100",
  editorialToken: process.env.EDITORIAL_SERVICE_TOKEN ?? "",
  dataDir: process.env.PALAVVA_DATA_DIR ?? "../../data",
  tenantHosts: (() => {
    try { return JSON.parse(process.env.TENANT_HOSTS ?? "{}") as Record<string, string>; } catch { return {}; }
  })(),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 14),
  showDemo: bool("SHOW_DEMO_CONTENT", true),
  requireVerification: bool("REQUIRE_EMAIL_VERIFICATION", true),
  isTest: process.env.PALAVVA_ENV === "test",
  paidFallbacksEnabled: bool("PAID_FALLBACKS_ENABLED"),
  oracleAuthorized: bool("ORACLE_DEPLOYMENT_AUTHORIZED"),
  publicLaunchAuthorized: bool("PUBLIC_LAUNCH_AUTHORIZED"),
  espoConfigured: Boolean(process.env.ESPOCRM_URL && process.env.ESPOCRM_API_KEY),
  reviveConfigured: Boolean(process.env.REVIVE_DELIVERY_URL),
  modelProvider: process.env.MODEL_PROVIDER ?? "ollama",
};
