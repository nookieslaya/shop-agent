import { eq } from "drizzle-orm";
import { getBootstrapStoreConfig, storeConfigSchema, type StoreConfig } from "../config/store.js";
import type { Database } from "./client.js";
import { stores } from "./schema.js";

export class StoreConfigurationRepository {
  constructor(private readonly db: Database) {}

  async find(storeId: string): Promise<StoreConfig | undefined> {
    const [row] = await this.db.select({ configuration: stores.configuration }).from(stores)
      .where(eq(stores.id, storeId)).limit(1);
    if (!row) return undefined;
    const parsed = storeConfigSchema.safeParse(row.configuration);
    if (!parsed.success) throw new Error(`Invalid stored configuration for ${storeId}: ${parsed.error.message}`);
    return parsed.data;
  }

  async resolve(storeId: string): Promise<StoreConfig | undefined> {
    return await this.find(storeId) ?? getBootstrapStoreConfig(storeId);
  }

  async update(config: StoreConfig): Promise<void> {
    const validated = storeConfigSchema.parse(config);
    const rows = await this.db.update(stores).set({ configuration: validated, updatedAt: new Date() })
      .where(eq(stores.id, validated.id)).returning({ id: stores.id });
    if (!rows.length) throw new Error(`Store does not exist: ${validated.id}`);
  }
}
