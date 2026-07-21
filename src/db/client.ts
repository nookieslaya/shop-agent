import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseConfiguration } from "../config/runtime-env.js";
import * as schema from "./schema.js";

export function createDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  databaseConfiguration(databaseUrl).log();
  const client = postgres(databaseUrl, { max: 5, prepare: false });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type Database = ReturnType<typeof createDatabase>["db"];
