import assert from "node:assert/strict";
import { test } from "node:test";
import { addOcrPage, emptyOcrDocument, mergeOcrDocuments, ocrCandidatePages } from "../src/lib/ocr";
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
  assert.equal(ocrCandidatePages(updated).length, 1); // Only the remaining blank page.
  assert.equal(doc.pages[0].blocks.length, 0);
});

test("OCR avoids destroying existing text when no useful text recognized", () => {
  assert.equal(addOcrPage(doc, 2, "x"), doc);
  assert.equal(addOcrPage(doc, 3, " "), doc);
  assert.throws(() => addOcrPage(doc, 99, "unknown"), /không tồn tại/);
});


test("empty cloud PDF creates OCR-ready page skeleton without changing original",()=>{
  const blank=emptyOcrDocument(3);
  assert.equal(blank.totalPages,3);
  assert.equal(blank.wordCount,0);
  assert.deepEqual(ocrCandidatePages(blank),[1,2,3]);
  assert.throws(()=>emptyOcrDocument(0),/trang/);
  assert.throws(()=>emptyOcrDocument(10000),/trang/);
});

test("cloud merge preserves a newer manual TOC and already recognized pages",()=>{
  const current=emptyOcrDocument(3);
  const incoming=addOcrPage(current,1,"Một trang đã được nhận dạng và chứa nhiều thông tin cần ghi nhớ.");
  const newest={
    ...current,
    toc:[{title:"Mục lục mới",page:1,blockId:"p1-b0"}],
    analysis:{...current.analysis!,tocSource:"manual" as const},
    pages:current.pages.map(p=>p.page===2?{...p,blocks:[{
      id:"p2-ocr0",page:2,kind:"paragraph" as const,
      text:"Nội dung được nhận dạng từ một thiết bị khác."
    }]}:p)
  };
  const merged=mergeOcrDocuments(newest,incoming);
  assert.deepEqual(merged.toc,newest.toc);
  assert.equal(merged.analysis?.tocSource,"manual");
  assert.equal(merged.pages[0].blocks[0].id,"p1-ocr0");
  assert.equal(merged.pages[1].blocks[0].id,"p2-ocr0");
  assert.equal(merged.analysis?.scannedPages.join(","),"3");
});

test("cloud merge never destroys existing OCR anchors or typed content",()=>{
  const cloud=addOcrPage(emptyOcrDocument(1),1,"Nội dung đã có trong sổ tay, giữ nguyên neo ghi chú.");
  const another=addOcrPage(emptyOcrDocument(1),1,"Một bản OCR mới dài hơn nhưng không được ghi đè neo đã lưu.");
  assert.deepEqual(mergeOcrDocuments(cloud,another).pages[0],cloud.pages[0]);
  const manual={...emptyOcrDocument(1),pages:[{page:1,blocks:[{
    id:"p1-b0",page:1,kind:"paragraph" as const,
    text:"Trang này đã có nội dung đủ dài do công cụ trích xuất cũ cung cấp."
  }]}]};
  assert.deepEqual(mergeOcrDocuments(manual,another).pages[0],manual.pages[0]);
  assert.throws(()=>mergeOcrDocuments(emptyOcrDocument(2),another),/Số trang/);
});
