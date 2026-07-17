import * as cheerio from "cheerio";
import type { ExtractedKnowledge } from "./types.js";

const BLOCK_SELECTOR = "h1, h2, h3, h4, p, li, th, td";

function clean(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractHtmlKnowledge(html: string): ExtractedKnowledge {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer, form, noscript, svg, iframe").remove();

  const candidates = ["main", "article", ".cms_content", "#content", "body"];
  let rootSelector = "body";
  let longest = 0;
  for (const selector of candidates) {
    $(selector).each((_, element) => {
      const length = clean($(element).text()).length;
      if (length > longest) {
        longest = length;
        rootSelector = selector;
      }
    });
    if (longest > 500) break;
  }
  const root = $(rootSelector).first();

  const blocks: string[] = [];
  root.find(BLOCK_SELECTOR).each((_, element) => {
    const value = clean($(element).text());
    if (!value || blocks.at(-1) === value) return;
    blocks.push(/^h[1-4]$/i.test(element.tagName) ? `## ${value}` : value);
  });

  const title = clean($("h1").first().text()) || clean($("title").first().text()) || "Dokument sklepu";
  return {
    title,
    content: blocks.join("\n\n"),
    metadata: { format: "html" },
  };
}
