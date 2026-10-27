import assert from "node:assert/strict";
import { test } from "node:test";
import { approvedGutenbergTextUrl, coverUrl, epubUrl, gutenbergPage, plaintextUrl, type GutenbergBook } from "../src/lib/free-books";
import { textToBookDocument } from "../src/lib/gutenberg-text";

const sample:GutenbergBook={
  id:11,title:"Alice's Adventures in Wonderland",authors:[{name:"Carroll, Lewis"}],
  languages:["en"],copyright:false,subjects:["Fiction"],download_count:10,
  formats:{
    "image/jpeg":"https://www.gutenberg.org/cache/epub/11/pg11.cover.medium.jpg",
    "text/plain; charset=us-ascii":"https://www.gutenberg.org/ebooks/11.txt.utf-8",
    "text/plain; charset=utf-8":"https://www.gutenberg.org/cache/epub/11/pg11.txt",
    "application/epub+zip":"https://www.gutenberg.org/ebooks/11.epub.images"
  }
};

test("book formats select UTF-8 plaintext and EPUB",()=>{
  assert.equal(plaintextUrl(sample),"https://www.gutenberg.org/cache/epub/11/pg11.txt");
  assert.equal(epubUrl(sample),"https://www.gutenberg.org/ebooks/11.epub.images");
  assert.ok(coverUrl(sample)?.includes("cover"));
  assert.equal(gutenbergPage(sample.id),"https://www.gutenberg.org/ebooks/11");
});

test("Gutenberg plain text strips boilerplate, retains chapters and book text",()=>{
  const words="This is a passage in a delightful novel about questions and discoveries. ".repeat(9);
  const doc=textToBookDocument(`
Project Gutenberg book notice

*** START OF THE PROJECT GUTENBERG EBOOK TEST ***
CHAPTER I

${words}

CHAPTER II

${words}

*** END OF THE PROJECT GUTENBERG EBOOK TEST ***
This part must not appear.
`);
  assert.ok(doc.wordCount>100);
  assert.equal(doc.toc.length,2);
  assert.ok(doc.pages.length>=1);
  assert.ok(doc.pages[0].blocks.some(b=>b.text==="CHAPTER I" && b.kind==="heading"));
  assert.equal(doc.pages.some(p=>p.blocks.some(b=>b.text.includes("This part must not appear."))),false);
});

test("empty Gutenberg document is rejected",()=>{
  assert.throws(()=>textToBookDocument("*** START OF THE PROJECT GUTENBERG EBOOK TEST ***\nHello\n*** END OF THE PROJECT GUTENBERG EBOOK TEST ***"),/chưa có nội dung/);
});

test("Gutenberg source URL validates path and rejects arbitrary proxy targets",()=>{
  assert.ok(approvedGutenbergTextUrl("https://www.gutenberg.org/ebooks/11.txt.utf-8",11));
  assert.ok(approvedGutenbergTextUrl("https://www.gutenberg.org/cache/epub/11/pg11.txt",11));
  assert.equal(approvedGutenbergTextUrl("https://evil.example/cache/epub/11/pg11.txt",11),null);
  assert.equal(approvedGutenbergTextUrl("https://www.gutenberg.org/ebooks/12.txt.utf-8",11),null);
  assert.equal(approvedGutenbergTextUrl("http://www.gutenberg.org/cache/epub/11/pg11.txt",11),null);
  assert.equal(approvedGutenbergTextUrl("https://www.gutenberg.org/cache/epub/11/pg11.txt?unsafe=1",11),null);
});
