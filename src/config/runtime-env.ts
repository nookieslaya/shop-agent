import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotEnv } from "dotenv";

const localEnvPath = resolve(process.cwd(), ".env.local");
let configurationSource = process.env.CONFIG_SOURCE?.trim() || "process environment";

if (existsSync(localEnvPath)) {
  const result = loadDotEnv({ path: localEnvPath, override: true, quiet: true });
  if (result.error) throw result.error;
  configurationSource = ".env.local";
}

let configurationLogged = false;

export function databaseConfiguration(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const parsed = new URL(databaseUrl);
  const safe = {
    source: configurationSource,
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  };

  return {
    ...safe,
    log() {
      if (configurationLogged) return;
      configurationLogged = true;
      console.info(`[database] ${JSON.stringify(safe)}`);
    },
  };
}
