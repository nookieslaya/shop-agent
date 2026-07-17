import Fastify from "fastify";
import { z } from "zod";
import { buildConversationResponse } from "../conversation/orchestrator.js";
import type { ConversationState } from "../conversation/types.js";
import { createDatabase } from "../db/client.js";
import { SearchRepository } from "../db/search-repository.js";

const requestSchema = z.object({
  storeId: z.string().min(1).default("nortberg"), message: z.string().default(""),
  state: z.object({ criteria: z.record(z.string(), z.unknown()) }).optional(),
  selection: z.object({ key: z.string(), value: z.union([z.string(), z.number()]) }).optional(),
});

export async function createServer() {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ status: "ok" }));
  app.post("/v1/chat", async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.issues });
    const { db, close } = createDatabase();
    try {
      const products = await new SearchRepository(db).activeProducts(parsed.data.storeId);
      return buildConversationResponse({
        message: parsed.data.message,
        products,
        ...(parsed.data.state ? { state: parsed.data.state as ConversationState } : {}),
        ...(parsed.data.selection ? { selection: parsed.data.selection } : {}),
      });
    } finally { await close(); }
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await createServer();
  await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3000) });
}
