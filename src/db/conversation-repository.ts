import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { conversationMessages, conversations } from "./schema.js";

export type ConversationFlag = "no_results" | "insufficient_evidence" | "fallback" | "openai" | "comparison" | "similar" | "contact_support" | "unknown";

export class ConversationRepository {
  constructor(private readonly db: Database) {}

  async recordTurn(input: { conversationId: string; storeId: string; userContent: string; assistantContent: string; request: Record<string, unknown>; response: Record<string, unknown>; flags: ConversationFlag[] }) {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.insert(conversations).values({ id: input.conversationId, storeId: input.storeId, messageCount: 2, flags: input.flags, startedAt: now, lastMessageAt: now })
        .onConflictDoUpdate({ target: conversations.id, set: {
          messageCount: sql`${conversations.messageCount} + 2`,
          flags: sql`COALESCE((SELECT jsonb_agg(DISTINCT value) FROM jsonb_array_elements_text(${conversations.flags} || ${JSON.stringify(input.flags)}::jsonb) AS value), '[]'::jsonb)`,
          lastMessageAt: now,
        } });
      await tx.insert(conversationMessages).values([
        { conversationId: input.conversationId, role: "user", content: input.userContent, details: input.request },
        { conversationId: input.conversationId, role: "assistant", content: input.assistantContent, details: input.response },
      ]);
    });
  }

  async list(storeId: string, options: { flag?: string; limit?: number } = {}) {
    const where = options.flag ? and(eq(conversations.storeId, storeId), sql`${conversations.flags} @> ${JSON.stringify([options.flag])}::jsonb`) : eq(conversations.storeId, storeId);
    return this.db.select().from(conversations).where(where).orderBy(desc(conversations.lastMessageAt)).limit(options.limit ?? 50);
  }

  async detail(storeId: string, conversationId: string) {
    const [conversation] = await this.db.select().from(conversations).where(and(eq(conversations.storeId, storeId), eq(conversations.id, conversationId))).limit(1);
    if (!conversation) return null;
    const messages = await this.db.select().from(conversationMessages).where(eq(conversationMessages.conversationId, conversationId)).orderBy(conversationMessages.createdAt);
    return { ...conversation, messages };
  }

  async latest(storeId: string) {
    const [conversation] = await this.list(storeId, { limit: 1 });
    return conversation ? this.detail(storeId, conversation.id) : null;
  }

  async exportAll(storeId:string){const items=await this.db.select().from(conversations).where(eq(conversations.storeId,storeId)).orderBy(conversations.startedAt);return Promise.all(items.map(item=>this.detail(storeId,item.id)));}
}
