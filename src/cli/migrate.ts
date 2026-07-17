import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../db/client.js";

const { db, close } = createDatabase();

try {
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("Database migrations completed successfully.");
} finally {
  await close();
}
