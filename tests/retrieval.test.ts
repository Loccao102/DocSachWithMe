import assert from "node:assert/strict";
import { test } from "node:test";
import { retrieveEvidence } from "../src/lib/retrieval";
import type { BookBlock, BookDocument } from "../src/lib/types";

const documentOf = (...pages: { page: number; texts: string[] }[]): BookDocument => ({
  version: 1, totalPages: pages.length, wordCount: 100,
  toc: [], pages: pages.map(part => ({
    page: part.page,
    blocks: part.texts.map((text, i): BookBlock => ({
      id: "p" + part.page + "-b" + i,
      page: part.page, kind: i === 0 ? "heading" : "paragraph", text
    }))
  }))
});

test("retrieval matches whole words, not substrings", () => {
  const doc = documentOf(
    { page: 1, texts: ["Earth revolves around the sun."] },
    { page: 2, texts: ["Art tells stories."] }
  );
  const result = retrieveEvidence(doc, "art");
  assert.match(result, /Trang 2/);
  assert.doesNotMatch(result, /Earth/);
});

test("retrieval understands Vietnamese without accents", () => {
  const doc = documentOf(
    { page: 1, texts: ["Giới thiệu"] },
    { page: 2, texts: ["Kỹ năng tư duy phản biện giúp đánh giá thông tin."] }
  );
  assert.match(retrieveEvidence(doc, "ky nang phan bien"), /Trang 2/);
});

test("summarizing the current section excludes distant matches", () => {
  const doc = documentOf(
    { page: 2, texts: ["Giới thiệu nội dung sách."] },
    { page: 6, texts: ["Phần này nói về phản biện và lập luận."] },
    { page: 30, texts: ["Phản biện được nhắc lại trong phụ lục."] }
  );
  const result = retrieveEvidence(doc, "phản biện", 5, "summarize");
  assert.match(result, /Trang 6/);
  assert.doesNotMatch(result, /Trang 30/);
  assert.doesNotMatch(result, /Trang 2/);
});

test("fallback chooses nearby evidence for questions without a term match", () => {
  const doc = documentOf(
    { page: 1, texts: ["Một nội dung rất khác."] },
    { page: 11, texts: ["Đây là nội dung tại trang đang đọc."] },
    { page: 19, texts: ["Nội dung khác của chương sau."] }
  );
  const result = retrieveEvidence(doc, "nonexistentword", 11);
  assert.match(result, /Trang 11/);
  assert.doesNotMatch(result, /\[Trang 1,/);
});

test("retrieval limits repeated snippets from a single page", () => {
  const doc = documentOf(
    { page: 1, texts: Array.from({ length: 15 }, (_, i) => "learning concept " + i) },
    { page: 2, texts: ["learning concept continues."] }
  );
  const result = retrieveEvidence(doc, "learning concept");
  assert.match(result, /Trang 2/);
  assert.equal((result.match(/\[Trang 1,/g) ?? []).length, 4);
});

test("empty documents return no evidence", () => {
  assert.equal(retrieveEvidence(documentOf({ page: 1, texts: [] }), "test"), "");
});

test("large repeated query results preserve the four-excerpts-per-page cap", () => {
  const pages=Array.from({length:160},(_,i)=>({
    page:i+1,texts:Array.from({length:42},(_,j)=>"insight evidence block "+j)
  }));
  const text=retrieveEvidence(documentOf(...pages),"insight evidence");
  assert.equal((text.match(/\[Trang /g)||[]).length,12);
  for(let page=1;page<=3;page++){
    assert.equal((text.match(new RegExp("\\[Trang "+page+",","g"))||[]).length,4);
  }
  assert.doesNotMatch(text,/\[Trang 4,/);
});

test("ranked excerpts from later pages take priority over weak earlier matches",()=>{
  const doc=documentOf(
    {page:1,texts:Array.from({length:25},(_,i)=>"compass just "+i)},
    {page:2,texts:Array.from({length:25},(_,i)=>"compass navigation expedition "+i)},
    {page:3,texts:Array.from({length:25},(_,i)=>"compass navigation expedition "+i)}
  );
  const text=retrieveEvidence(doc,"compass navigation expedition");
  assert.equal((text.match(/\[Trang 1,/g)||[]).length,4);
  assert.equal((text.match(/\[Trang 2,/g)||[]).length,4);
  assert.equal((text.match(/\[Trang 3,/g)||[]).length,4);
});

test("stopword-only questions use nearby fallback without scanning all block tokens",()=>{
  const doc=documentOf(
    {page:1,texts:["A distant starting point"]},
    {page:70,texts:["Relevant location text"]},
    {page:120,texts:["Distant ending"]}
  );
  const text=retrieveEvidence(doc,"what the this",70,"ask");
  assert.match(text,/\[Trang 70,/);
  assert.doesNotMatch(text,/\[Trang 1,/);
});
