import type { KnowledgeChunk } from "./types.js";

export function chunkKnowledge(content: string, maxCharacters = 1400): KnowledgeChunk[] {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const chunks: KnowledgeChunk[] = [];
  let heading: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    const value = buffer.join("\n\n").trim();
    if (!value) return;
    chunks.push({
      chunkIndex: chunks.length,
      ...(heading ? { heading } : {}),
      content: value,
      characterCount: value.length,
      tokenEstimate: Math.ceil(value.length / 4),
    });
    buffer = [];
  };

  for (const block of blocks) {
    if (block.startsWith("## ")) {
      flush();
      heading = block.slice(3).trim();
      continue;
    }
    if (block.length > maxCharacters) {
      flush();
      for (let offset = 0; offset < block.length; offset += maxCharacters) {
        buffer = [block.slice(offset, offset + maxCharacters)];
        flush();
      }
      continue;
    }
    const candidateLength = [...buffer, block].join("\n\n").length;
    if (candidateLength > maxCharacters) flush();
    buffer.push(block);
  }
  flush();
  return chunks;
}
