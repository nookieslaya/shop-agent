import { createHash } from "node:crypto";
import { chunkKnowledge } from "./chunker.js";
import { extractHtmlKnowledge } from "./html-extractor.js";
import { extractPdfKnowledge } from "./pdf-extractor.js";
import { fetchPublicResource } from "../security/public-url.js";

export interface KnowledgeSource {
  type: "html" | "pdf";
  topic: string;
  url: string;
}

export async function loadKnowledgeSource(source: KnowledgeSource) {
  const response = await fetchPublicResource(source.url, { headers: { "user-agent": "ShopAgentBot/0.1 (+knowledge sync)" }, timeoutMs:30_000, maximumBytes:25_000_000 });

  const extracted = source.type === "pdf"
    ? await extractPdfKnowledge(Buffer.from(await response.arrayBuffer()))
    : extractHtmlKnowledge(await response.text());
  if (extracted.content.length < 100) throw new Error(`Too little useful content extracted from ${source.url}`);

  const contentHash = createHash("sha256").update(extracted.content).digest("hex");
  return { ...extracted, contentHash, chunks: chunkKnowledge(extracted.content) };
}
