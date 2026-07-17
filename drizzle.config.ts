import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://shop_agent:shop_agent_dev@localhost:5432/shop_agent",
  },
  strict: true,
  verbose: true,
});
