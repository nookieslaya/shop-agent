import { createRequire } from "node:module";
import type pdfParseType from "pdf-parse";
import type { ExtractedKnowledge } from "./types.js";

// pdf-parse 1.x executes its demo fixture when loaded as an ESM entry point.
// Loading its CommonJS export through createRequire avoids that upstream quirk.
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as typeof pdfParseType;

export async function extractPdfKnowledge(buffer: Buffer): Promise<ExtractedKnowledge> {
  const parsed = await pdfParse(buffer);
  const content = parsed.text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title: parsed.info?.Title || "Dokument PDF",
    content,
    metadata: {
      format: "pdf",
      pages: parsed.numpages,
      author: parsed.info?.Author ?? null,
      subject: parsed.info?.Subject ?? null,
    },
  };
}
