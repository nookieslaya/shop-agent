import { createDatabase } from "../db/client.js";
import { ConversationRepository } from "../db/conversation-repository.js";

const args = new Map(process.argv.slice(2).map((arg) => { const [key, ...value] = arg.replace(/^--/, "").split("="); return [key, value.join("=") || "true"]; }));
const storeId = args.get("store") || "nortberg";
const id = args.get("id");
const includeDetails = args.get("details") === "true";
if (!id && args.get("latest") !== "true") throw new Error("Use --latest or --id=CONVERSATION_ID");

const { db, close } = createDatabase();
try {
  const repository = new ConversationRepository(db);
  const conversation = id ? await repository.detail(storeId, id) : await repository.latest(storeId);
  if (!conversation) throw new Error("Conversation not found");
  const report = {
    id: conversation.id, storeId: conversation.storeId, flags: conversation.flags,
    startedAt: conversation.startedAt, lastMessageAt: conversation.lastMessageAt,
    messages: conversation.messages.map((message) => ({ role: message.role, content: message.content, ...(includeDetails ? { details: message.details } : {}) })),
  };
  console.log(JSON.stringify(report, null, 2));
} finally { await close(); }
