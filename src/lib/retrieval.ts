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
  const candidates = window.length ? window : blocks;
  const queryTerms = [...new Set(termsOf(query))].slice(0, 80);
  const ranked = candidates.map((block, index) => {
    const blockWords = new Set(words(block.text));
    const matches = queryTerms.reduce((count, term) => count + Number(blockWords.has(term)), 0);
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
  const pool = relevant.length ? relevant : ranked
    .slice()
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, 10);

  pool.sort((a, b) => b.score - a.score || a.distance - b.distance || a.index - b.index);
  const selected: typeof pool = [];
  const pageCounts = new Map<number, number>();
  const limit = summarizeHere ? 18 : 12;
  const perPage = summarizeHere ? 3 : 4;
  for (const item of pool) {
    if (selected.length >= limit) break;
    const count = pageCounts.get(item.block.page) ?? 0;
    if (count >= perPage) continue;
    selected.push(item);
    pageCounts.set(item.block.page, count + 1);
  }
  selected.sort((a, b) => a.index - b.index);
  return selected.map(item =>
    "[Trang " + item.block.page + ", mã " + item.block.id + "] " +
    item.block.text.replace(/\s+/g, " ").trim().slice(0, 1000)
  ).join("\n\n").slice(0, 16000);
}
