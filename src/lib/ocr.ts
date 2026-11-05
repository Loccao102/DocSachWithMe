import type { BookBlock, BookDocument } from "./types";

const MAX_PAGES_PER_RUN = 8;
const MIN_USEFUL_CHARS = 32;

/** Only scan pages with no (or almost no) extractable text. */
export function ocrCandidatePages(document: BookDocument): number[] {
  return document.pages.filter(page =>
    page.blocks.map(block => block.text).join(" ").trim().length < MIN_USEFUL_CHARS
  ).map(page => page.page);
}

/** Keep original page anchors and preserve any manually edited table of contents. */
export function addOcrPage(document: BookDocument, pageNumber: number, rawText: string): BookDocument {
  const page = document.pages.find(item => item.page === pageNumber);
  if (!page) throw new Error("Trang OCR không tồn tại trong sách.");
  const text = rawText.replace(/\r/g, "").trim();
  if (text.length < 6) return document;
  const paragraphs = text.split(/\n\s*\n/).flatMap(value =>
    value.length > 1600 ? value.match(/.{1,1400}(?:\s|$)/g) ?? [value] : [value]
  ).map(value => value.replace(/\s+/g, " ").trim()).filter(Boolean);
  const blocks: BookBlock[] = paragraphs.slice(0, 150).map((value, index) => ({
    id: "p" + pageNumber + "-ocr" + index,
    page: pageNumber, kind: "paragraph", text: value.slice(0, 1600)
  }));
  const oldLength = page.blocks.reduce((sum, block) => sum + block.text.split(/\s+/).filter(Boolean).length, 0);
  const newLength = blocks.reduce((sum, block) => sum + block.text.split(/\s+/).filter(Boolean).length, 0);
  if (newLength <= oldLength) return document;
  const pages = document.pages.map(part =>
    part.page === pageNumber ? { ...part, blocks } : part
  );
  const scannedPages = pages.filter(part =>
    part.blocks.map(block => block.text).join(" ").trim().length < MIN_USEFUL_CHARS
  ).map(part => part.page);
  return {
    ...document, pages,
    wordCount: document.wordCount - oldLength + newLength,
    analysis: {
      scannedPages,
      twoColumnPages: document.analysis?.twoColumnPages ?? [],
      tocSource: document.analysis?.tocSource ?? "detected-headings",
      warnings: scannedPages.length
        ? ["Một số trang vẫn thiếu văn bản. Bạn có thể tiếp tục OCR hoặc xem PDF gốc."]
        : []
    }
  };
}

/**
 * Browser-only, opt-in OCR. pdf.js renders local pages to a canvas and
 * Tesseract recognizes that canvas. No book pages are uploaded to an OCR API.
 * Language model files may be downloaded on first use.
 */
export async function ocrLocalPdf(
  file: Blob, original: BookDocument,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<{ document: BookDocument; recognized: number; attempted: number }> {
  if (typeof document === "undefined") throw new Error("OCR chỉ chạy trong trình duyệt.");
  const candidates = ocrCandidatePages(original).slice(0, MAX_PAGES_PER_RUN);
  if (!candidates.length) return { document: original, recognized: 0, attempted: 0 };
  const [pdfjs, tesseract] = await Promise.all([import("pdfjs-dist"), import("tesseract.js")]);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let worker: Awaited<ReturnType<typeof tesseract.createWorker>> | undefined;
  let result = original;
  let recognized = 0;
  try {
    onProgress?.(0, candidates.length, "Đang tải bộ nhận dạng tiếng Việt và tiếng Anh…");
    worker = await tesseract.createWorker(["vie", "eng"]);
    for (const [index, pageNumber] of candidates.entries()) {
      if (pageNumber > pdf.numPages) continue;
      onProgress?.(index, candidates.length, "Đang nhận dạng trang " + pageNumber + "…");
      const page = await pdf.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(1.8, 2000 / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Trình duyệt không hỗ trợ Canvas để nhận dạng OCR.");
        try {
          await page.render({ canvas, canvasContext: context, viewport }).promise;
          const recognition = await worker.recognize(canvas);
          const updated = addOcrPage(result, pageNumber, recognition.data.text || "");
          if (updated !== result) recognized++;
          result = updated;
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        page.cleanup();
      }
      onProgress?.(index + 1, candidates.length, "Đã xử lý " + (index + 1) + "/" + candidates.length + " trang");
    }
    return { document: result, recognized, attempted: candidates.length };
  } finally {
    await worker?.terminate();
    await pdf.destroy();
  }
}
