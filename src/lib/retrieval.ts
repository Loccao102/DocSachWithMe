import type { BookBlock, BookDocument } from "./types";

const ignored = new Set("và hoặc những các một được trong của với cho khi như đây đó theo cũng vì rồi thì là từ mà để trên dưới this that with from into while what which where about".split(" "));
const normalized = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
function tokens(value: string) {
  return normalized(value).split(/[^a-z0-9]+/).filter(word => word.length > 2 && !ignored.has(word));
}
export function retrieveEvidence(document: BookDocument, query: string, page?: number, mode?: string) {
  const blocks = document.pages.flatMap(p => p.blocks);
  const terms = [...new Set(tokens(query))];
  const scores = blocks.map((block, index) => {
    const haystack = normalized(block.text);
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score += term.length > 6 ? 3 : 1;
    }
    if (page && Math.abs(page - block.page) <= 2) score += 2;
    if (mode === "summarize" && page && block.page >= page && block.page <= page + 8) score += 10;
    if (mode === "explain" && page && Math.abs(page - block.page) <= 1) score += 4;
    return { block, index, score };
  }).sort((a, b) => b.score - a.score);
  const selected = scores.filter(item => item.score > 0).slice(0, mode === "summarize" ? 18 : 12);
  if (!selected.length) {
    const from = page ? Math.max(0, blocks.findIndex(b => b.page >= page)) : 0;
    selected.push(...blocks.slice(from, from + 10).map((block, index) => ({ block, index: from + index, score: 0 })));
  }
  return selected.sort((a,b) => a.index - b.index)
    .map(item => `[Trang ${item.block.page}, mã ${item.block.id}] ${item.block.text.slice(0, 1000)}`)
    .join("\n\n").slice(0, 16000);
}
