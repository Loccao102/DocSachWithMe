import assert from "node:assert/strict";
import { test } from "node:test";
import { addOcrPage, ocrCandidatePages } from "../src/lib/ocr";
import type { BookDocument } from "../src/lib/types";

const doc: BookDocument = {
  version: 1, totalPages: 3, wordCount: 3, toc: [
    { title: "Phần mở đầu", page: 1, blockId: "p1-b0" }
  ],
  pages: [
    { page: 1, blocks: [] },
    { page: 2, blocks: [{ id: "p2-b0", page: 2, kind: "paragraph",
      text: "Đây là trang đã có văn bản nguyên gốc, nên không cần OCR thêm." }] },
    { page: 3, blocks: [] }
  ]
};

test("OCR identifies pages with little extractable text", () => {
  assert.deepEqual(ocrCandidatePages(doc), [1, 3]);
});

test("OCR adds usable text and preserves chapter anchors", () => {
  const updated = addOcrPage(doc, 1, "Đây là nội dung OCR.\n\nĐoạn thứ hai");
  assert.equal(updated.pages[0].blocks.length, 2);
  assert.equal(updated.pages[0].blocks[0].id, "p1-ocr0");
  assert.deepEqual(updated.toc, doc.toc);
  assert.equal(updated.analysis?.scannedPages.join(","), "3");
  assert.equal(ocrCandidatePages(updated).length, 2); // Short OCR remains retryable.
  assert.equal(doc.pages[0].blocks.length, 0);
});

test("OCR avoids destroying existing text when no useful text recognized", () => {
  assert.equal(addOcrPage(doc, 2, "x"), doc);
  assert.equal(addOcrPage(doc, 3, " "), doc);
  assert.throws(() => addOcrPage(doc, 99, "unknown"), /không tồn tại/);
});
