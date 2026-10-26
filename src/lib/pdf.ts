import type { BookBlock, BookChapter, BookDocument, BookPage } from "./types";

export async function extractPdf(file: File | Blob, onProgress?: (current: number, total: number) => void): Promise<BookDocument> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: BookPage[] = [];
  const toc: BookChapter[] = [];
  let wordCount = 0;

  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    const positioned = content.items
      .filter((item): item is typeof item & { str: string; transform: number[]; width: number } =>
        "str" in item && typeof item.str === "string" && "transform" in item && item.str.trim().length > 0)
      .map(item => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        fontSize: Math.hypot(item.transform[2], item.transform[3])
      }));

    // Group PDF fragments by baseline so text becomes actual readable lines.
    positioned.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; parts: typeof positioned; fontSize: number }[] = [];
    for (const part of positioned) {
      let line = lines.find(candidate => Math.abs(candidate.y - part.y) < Math.max(2.5, part.fontSize * .27));
      if (!line) {
        line = { y: part.y, parts: [], fontSize: part.fontSize };
        lines.push(line);
      }
      line.parts.push(part);
    }
    lines.sort((a, b) => b.y - a.y);

    const blocks: BookBlock[] = [];
    let current = "";
    let lastY: number | null = null;
    let blockIndex = 0;
    const flush = (heading = false) => {
      const text = current.replace(/\s+/g, " ").trim();
      if (text) {
        const id = `p${number}-b${blockIndex++}`;
        blocks.push({ id, page: number, text, kind: heading ? "heading" : "paragraph" });
        wordCount += text.split(/\s+/).length;
        if (heading && toc.length < 100) toc.push({ title: text.slice(0, 100), page: number, blockId: id });
      }
      current = "";
    };

    const normalLineHeight = lines.length > 2
      ? lines.slice(1).map((line, i) => Math.abs(lines[i].y - line.y)).filter(d => d > 2 && d < 45).sort((a,b) => a-b)
      : [];
    const medianGap = normalLineHeight[Math.floor(normalLineHeight.length / 2)] || 14;

    for (const line of lines) {
      line.parts.sort((a, b) => a.x - b.x);
      let sentence = "";
      let lastRight: number | null = null;
      for (const part of line.parts) {
        const gap = lastRight === null ? 0 : part.x - lastRight;
        const spacer = lastRight !== null && gap > Math.max(2, part.fontSize * .19) && !sentence.endsWith(" ") ? " " : "";
        sentence += spacer + part.text;
        lastRight = part.x + part.width;
      }
      sentence = sentence.replace(/\s+/g, " ").trim();
      if (!sentence) continue;
      const heading = /^(chương|chapter|phần|part|mục)\s+([0-9ivxlcdm]+|[a-z])\b/i.test(sentence)
        || (/^[A-ZÀ-Ỹ0-9\s:–—.-]{6,85}$/.test(sentence) && sentence.length < 75 && line.parts.some(p => p.fontSize > 13));
      const gap = lastY === null ? 0 : lastY - line.y;
      if (heading || gap > medianGap * 1.6 || current.length > 850 || (current.endsWith(/[.!?]["”]?$/) && sentence.length < 75)) {
        flush();
      }
      if (heading) {
        current = sentence;
        flush(true);
      } else {
        if (current.endsWith("-") && /^[\p{L}]/u.test(sentence)) current = current.slice(0, -1) + sentence;
        else current += (current ? " " : "") + sentence;
      }
      lastY = line.y;
    }
    flush();
    pages.push({ page: number, blocks });
    onProgress?.(number, pdf.numPages);
  }
  await pdf.destroy();
  // Some books have no recognized chapter headings. Page navigation still works.
  return { version: 1, totalPages: pages.length, wordCount, pages, toc };
}
