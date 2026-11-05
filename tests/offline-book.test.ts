import assert from "node:assert/strict";
import {test} from "node:test";
import {createOfflineBook,offlineBookId} from "../src/lib/offline-book";
import type {
  Book,BookDocument,ReaderNote,ReaderBookmark,ReadingProgress
} from "../src/lib/types";

const owner="123e4567-e89b-42d3-a456-426614174000";
const id="f0c12e37-ff40-4413-9e03-62f9aa90f78a";
const book:Book={
  id,owner_id:owner,title:"Tư duy đột phá",author:"A Writer",
  file_path:owner+"/"+id+".pdf",text_path:owner+"/"+id+".json",
  total_pages:4,word_count:50,cover_color:"#777",
  created_at:"2026-11-01T00:00:00Z",last_opened_at:null
};
const document:BookDocument={
  version:1,totalPages:4,wordCount:22,toc:[],
  pages:[
    {page:1,blocks:[{id:"p1-b0",page:1,kind:"paragraph",text:"Mở đầu"}]},
    {page:2,blocks:[{id:"p2-ocr0",page:2,kind:"paragraph",text:"Văn bản OCR"}]},
    {page:3,blocks:[]},{page:4,blocks:[]}
  ]
};
const notes:ReaderNote[]=[
  {id:"n1",book_id:id,owner_id:owner,block_id:"p2-ocr0",
   quote:"Văn bản OCR",note:"Một điều quan trọng",color:"green",
   created_at:"2026-11-01T00:00:00Z"},
  {id:"n2",book_id:id,owner_id:owner,block_id:"p4-b1",
   quote:"Nhớ",note:"",color:"pink",created_at:"2026-11-01T00:00:00Z"},
  {id:"foreign",book_id:id,owner_id:"someone-else",block_id:"p1-b0",
   quote:"secret",note:"",color:"yellow",created_at:"2026-11-01T00:00:00Z"}
];
const bookmarks:ReaderBookmark[]=[
  {id:"m1",book_id:id,owner_id:owner,block_id:"p2-ocr0",page:2,created_at:"2026-11-01T00:00:00Z"},
  {id:"m2",book_id:id,owner_id:owner,block_id:"p2-ocr0",page:2,created_at:"2026-11-01T00:00:00Z"},
  {id:"m3",book_id:id,owner_id:owner,block_id:"p6-b0",page:6,created_at:"2026-11-01T00:00:00Z"}
];
test("cloud snapshot preserves note anchors, bookmarks and reader position",()=>{
  const offline=createOfflineBook({
    book,ownerId:owner,document,notes,bookmarks,
    progress:{page:3} as ReadingProgress,
    original:new Blob(["test PDF"],{type:"application/pdf"}),createdAt:"2026-11-05T00:00:00Z"
  });
  assert.equal(offline.id,"cloud-"+id);
  assert.equal(offline.title,book.title);
  assert.deepEqual(offline.bookmarks,[2]);
  assert.equal(offline.notes.length,2);
  assert.equal(offline.notes[0].blockId,"p2-ocr0");
  assert.equal(offline.notes[0].page,2);
  assert.equal(offline.notes[1].page,4);
  assert.equal(offline.page,3);
  assert.equal(offline.pdf.size,8);
  assert.equal(offline.createdAt,"2026-11-05T00:00:00Z");
  assert.equal(document.pages[1].blocks[0].text,"Văn bản OCR");
});

test("cloud snapshot refuses cross-account imports and empty originals",()=>{
  const base={book,ownerId:owner,document,notes,bookmarks,progress:null};
  assert.throws(()=>createOfflineBook({...base,ownerId:"another",original:new Blob(["pdf"])}),/tài khoản/);
  assert.throws(()=>createOfflineBook({...base,original:new Blob()}),/giới hạn/);
  assert.throws(()=>offlineBookId("invalid"),/không hợp lệ/);
});

test("EPUB must include ebook text; PDF without text keeps original view available",()=>{
  const base={book,ownerId:owner,notes:[],bookmarks:[],progress:null};
  const pdf=createOfflineBook({...base,document:null,original:new Blob(["PDF"])});
  assert.equal(pdf.format,"pdf");
  assert.equal(pdf.document,null);
  const epubBook={...book,file_path:owner+"/"+id+".epub"};
  assert.throws(()=>createOfflineBook({...base,book:epubBook,document:null,original:new Blob(["epub"])}),/EPUB/);
  const epub=createOfflineBook({...base,book:epubBook,document,original:new Blob(["epub"])});
  assert.equal(epub.format,"epub");
});

test("invalid progress and unknown color are constrained for local reader",()=>{
  const snapshot=createOfflineBook({
    book,ownerId:owner,document,progress:{page:999} as ReadingProgress,
    notes:[{...notes[0],color:"not-allowed"}],bookmarks:[],
    original:new Blob(["PDF"])
  });
  assert.equal(snapshot.page,4);
  assert.equal(snapshot.notes[0].color,"yellow");
});
