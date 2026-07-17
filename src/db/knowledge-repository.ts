import { and, eq } from "drizzle-orm";
import type { KnowledgeChunk, SearchableKnowledgeChunk } from "../knowledge/types.js";
import type { Database } from "./client.js";
import { knowledgeChunks, knowledgeDocuments } from "./schema.js";

export class KnowledgeRepository {
  constructor(private readonly db: Database) {}

  async contentHash(storeId: string, sourceUrl: string): Promise<string | undefined> {
    const [row] = await this.db.select({ contentHash: knowledgeDocuments.contentHash })
      .from(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.storeId, storeId), eq(knowledgeDocuments.sourceUrl, sourceUrl)))
      .limit(1);
    return row?.contentHash;
  }

  async searchableChunks(storeId: string): Promise<SearchableKnowledgeChunk[]> {
    const rows = await this.db.select({
      id: knowledgeChunks.id,
      documentId: knowledgeChunks.documentId,
      topic: knowledgeDocuments.topic,
      title: knowledgeDocuments.title,
      sourceUrl: knowledgeDocuments.sourceUrl,
      heading: knowledgeChunks.heading,
      content: knowledgeChunks.content,
    }).from(knowledgeChunks).innerJoin(knowledgeDocuments, eq(knowledgeChunks.documentId, knowledgeDocuments.id))
      .where(eq(knowledgeDocuments.storeId, storeId));
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      topic: row.topic,
      title: row.title,
      sourceUrl: row.sourceUrl,
      content: row.content,
      ...(row.heading ? { heading: row.heading } : {}),
    }));
  }

  async save(input: {
    storeId: string;
    sourceUrl: string;
    sourceType: "html" | "pdf";
    topic: string;
    title: string;
    content: string;
    contentHash: string;
    metadata: Record<string, unknown>;
    chunks: KnowledgeChunk[];
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [document] = await tx.insert(knowledgeDocuments).values(input).onConflictDoUpdate({
        target: [knowledgeDocuments.storeId, knowledgeDocuments.sourceUrl],
        set: {
          sourceType: input.sourceType,
          topic: input.topic,
          title: input.title,
          content: input.content,
          contentHash: input.contentHash,
          metadata: input.metadata,
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
      }).returning({ id: knowledgeDocuments.id });
      if (!document) throw new Error(`Could not save knowledge document: ${input.sourceUrl}`);

      await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, document.id));
      if (input.chunks.length) {
        await tx.insert(knowledgeChunks).values(input.chunks.map((chunk) => ({
          documentId: document.id,
          ...chunk,
          metadata: {},
        })));
      }
    });
  }
}
