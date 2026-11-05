import type { BookDocument } from "./types";

const ignored = new Set(
  "va hoac nhung cac mot duoc trong cua voi cho khi nhu day do theo cung vi roi thi la tu ma de tren duoi this that with from into while what which where about".split(" ")
);
const normalize = (value: string) => value.toLowerCase().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
const words = (value: string) => normalize(value).match(/[a-z0-9]+/g) ?? [];
const termsOf = (value: string) => words(value).filter(word => word.length > 2 && !ignored.has(word));

/**
 * Return short, ordered, page-labelled excerpts for a grounded AI answer.
 * Query matches must be whole words: a search for "art" must not match "earth".
 * Summaries stay inside the requested chapter/window instead of drifting to
 * distant occurrences of the same words.
 */
export function retrieveEvidence(document: BookDocument, query: string, page?: number, mode?: string): string {
  const blocks = document.pages.flatMap(part => part.blocks).filter(block => block.text.trim().length > 0);
  if (!blocks.length) return "";
  const anchor = typeof page === "number" && Number.isFinite(page) && page >= 1
    ? Math.floor(page) : undefined;
  const summarizeHere = mode === "summarize" && anchor !== undefined;
  const window = summarizeHere
    ? blocks.filter(block => block.page >= anchor && block.page <= anchor + 8)
    : blocks;
  // Some imported documents have sparse page numbers. Fall back to the nearest
  // available page rather than accidentally summarizing the entire book.
  const nearestPage = anchor === undefined ? blocks[0].page :
    blocks.reduce((best, block) =>
      Math.abs(block.page - anchor) < Math.abs(best - anchor) ? block.page : best,
    blocks[0].page);
  const candidates = window.length ? window :
    summarizeHere ? blocks.filter(block => block.page === nearestPage) : blocks;
  const queryTerms = [...new Set(termsOf(query))].slice(0, 80);
  const ranked = candidates.map((block, index) => {
    // Stopword-only queries need location-based evidence; avoid tokenizing every paragraph.
    const blockWords = queryTerms.length ? new Set(words(block.text)) : null;
    const matches = blockWords ? queryTerms.reduce((count, term) => count + Number(blockWords.has(term)), 0) : 0;
    const distance = anchor === undefined ? 0 : Math.abs(block.page - anchor);
    let score = matches * 5 + (matches ? matches / Math.max(1, queryTerms.length) : 0);
    if (summarizeHere) {
      // Cover several pages in the current section, including its headings.
      score += 2 + (block.kind === "heading" ? 3 : 0);
    } else if (anchor !== undefined && distance <= 2) {
      score += mode === "explain" ? 5 - distance : 2 - distance * 0.5;
    }
    return { block, index, matches, score, distance };
  });

  const relevant = summarizeHere
    ? ranked
    : ranked.filter(item => item.matches > 0 || (
      mode === "explain" && anchor !== undefined && item.distance <= 1
    ));
  // Only inspect fallback candidates if the query has no relevant matches.
  const pool = relevant.length ? relevant : anchor === undefined ? ranked.slice(0, 10) :
    ranked.filter(item => item.distance <= Math.max(1, Math.abs(nearestPage - anchor))).slice(0, 10);

  const limit = summarizeHere ? 18 : 12;
  const perPage = summarizeHere ? 3 : 4;
  type Candidate = (typeof ranked)[number];
  const compare = (a: Candidate, b: Candidate) =>
    b.score - a.score || a.distance - b.distance || a.index - b.index;

  // Keep only the best per-page candidates, preserving exactly the same
  // final ordering and page cap without sorting every matching OCR paragraph.
  const byPage = new Map<number, Candidate[]>();
  for (const item of pool) {
    let best = byPage.get(item.block.page);
    if (!best) {
      best = [];
      byPage.set(item.block.page, best);
    }
    if (best.length === perPage && compare(item, best[best.length - 1]) >= 0) continue;
    const position = best.findIndex(other => compare(item, other) < 0);
    if (position === -1) best.push(item);
    else best.splice(position, 0, item);
    if (best.length > perPage) best.pop();
  }
  const selected = [...byPage.values()].flat().sort(compare).slice(0, limit)
    .sort((a, b) => a.index - b.index);
  return selected.map(item =>
    "[Trang " + item.block.page + ", mã " + item.block.id + "] " +
    item.block.text.replace(/\s+/g, " ").trim().slice(0, 1000)
  ).join("\n\n").slice(0, 16000);
}
