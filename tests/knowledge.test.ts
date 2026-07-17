import { describe, expect, it } from "vitest";
import { chunkKnowledge } from "../src/knowledge/chunker.js";
import { extractHtmlKnowledge } from "../src/knowledge/html-extractor.js";

describe("knowledge extraction", () => {
  it("removes navigation and preserves headings and useful content", () => {
    const extracted = extractHtmlKnowledge(`
      <html><head><title>Gwarancja</title></head><body>
        <nav>Menu sklepu</nav><main><h1>Gwarancja okapu</h1>
        <p>Standardowa gwarancja trwa 24 miesiące.</p>
        <h2>Przedłużenie</h2><p>Rejestracja przedłuża ochronę o 6 miesięcy.</p></main>
      </body></html>`);
    expect(extracted.title).toBe("Gwarancja okapu");
    expect(extracted.content).toContain("## Przedłużenie");
    expect(extracted.content).not.toContain("Menu sklepu");
  });

  it("creates ordered chunks below the configured size", () => {
    const chunks = chunkKnowledge(`## Montaż\n\n${"Ala ma kota. ".repeat(30)}\n\n## Filtry\n\nFiltr można myć.`, 180);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index));
    expect(chunks.every((chunk) => chunk.characterCount <= 180)).toBe(true);
    expect(chunks.at(-1)?.heading).toBe("Filtry");
  });
});
