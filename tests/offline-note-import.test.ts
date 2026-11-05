import assert from "node:assert/strict";
import {test} from "node:test";
import {planOfflineImport} from "../src/lib/offline-note-import";
import type {BookDocument,ReaderNote,ReaderBookmark} from "../src/lib/types";
import type {DemoBook} from "../src/lib/demo-store";

const bookId="f0c12e37-ff40-4413-9e03-62f9aa90f78a";
const ownerId="123e4567-e89b-42d3-a456-426614174000";
const id1="f0c12e37-ff40-4413-9e03-62f9aa90f781";
const id2="f0c12e37-ff40-4413-9e03-62f9aa90f782";
const id3="f0c12e37-ff40-4413-9e03-62f9aa90f783";
const doc:BookDocument={
  version:1,totalPages:3,wordCount:30,toc:[],
  pages:[{page:1,blocks:[{id:"p1-b0",page:1,kind:"paragraph",text:"A"}]},
    {page:2,blocks:[{id:"p2-ocr0",page:2,kind:"paragraph",text:"OCR"}]},
    {page:3,blocks:[]}]
};
function local():DemoBook{
  return {
    id:"cloud-"+bookId,title:"Book",author:"",createdAt:"2026-11-01",
    pdf:new Blob(["pdf"]),document:doc,format:"pdf",page:2,
    bookmarks:[1,2,3],
    notes:[
      {id:id1,blockId:"p1-b0",page:1,quote:"A",content:"New local",color:"yellow",createdAt:"2026-11-05"},
      {id:id2,blockId:"p2-ocr0",page:2,quote:"OCR",content:"Existing offline edit",color:"green",createdAt:"2026-11-05"},
      {id:id3,blockId:"p3-not-there",page:3,quote:"Orphan",content:"",color:"pink",createdAt:"2026-11-05"}
    ]
  };
}
const cloudNote:ReaderNote={
  id:id2,book_id:bookId,owner_id:ownerId,block_id:"p2-ocr0",
  quote:"OCR",note:"Existing original",color:"green",created_at:"2026-11-04"
};
const bookmark:ReaderBookmark={
  id:"f0c12e37-ff40-4413-9e03-62f9aa90f789",
  book_id:bookId,owner_id:ownerId,block_id:"p1-b0",
  page:1,created_at:"2026-11-04"
};
test("append-only import adds local notes but never overwrites changed cloud note",()=>{
  const plan=planOfflineImport({
    bookId,ownerId,local:local(),cloudNotes:[cloudNote],cloudBookmarks:[bookmark],cloudDocument:doc
  });
  assert.deepEqual(plan.notes.map(n=>n.id),[id1]);
  assert.equal(plan.notes[0].block_id,"p1-b0");
  assert.equal(plan.notes[0].owner_id,ownerId);
  assert.equal(plan.conflicts,1);
  assert.equal(plan.missingAnchors,1);
  assert.deepEqual(plan.bookmarks.map(b=>[b.page,b.block_id]),[[2,"p2-ocr0"],[3,"p3-b0"]]);
  assert.equal(plan.skippedBookmarks,1);
  assert.equal(cloudNote.note,"Existing original");
});

test("repeated imports do not create duplicate notes or bookmarks",()=>{
  const one=local();
  one.notes=[one.notes[0]];
  one.bookmarks=[1,1,2];
  const first=planOfflineImport({bookId,ownerId,local:one,cloudNotes:[],cloudBookmarks:[],cloudDocument:doc});
  assert.equal(first.notes.length,1);
  assert.equal(first.bookmarks.length,2);
  const second=planOfflineImport({bookId,ownerId,local:one,
    cloudNotes:first.notes.map(note=>({...note})),
    cloudBookmarks:first.bookmarks.map((b,i)=>({...b,id:id1,created_at:"2026-11-05"})),
    cloudDocument:doc
  });
  assert.equal(second.notes.length,0);
  assert.equal(second.bookmarks.length,0);
  assert.equal(second.unchanged,1);
});

test("different owners or mismatched offline books are rejected before writes",()=>{
  assert.throws(()=>planOfflineImport({
    bookId,ownerId,local:{...local(),id:"wrong"},cloudNotes:[],cloudBookmarks:[],cloudDocument:doc
  }),/không khớp/);
  assert.throws(()=>planOfflineImport({
    bookId,ownerId,local:local(),cloudNotes:[],cloudBookmarks:[],cloudDocument:null
  }),/bản văn/);
});

test("exact duplicate text with a new local ID is not re-uploaded",()=>{
  const one=local();
  one.notes=[{...one.notes[0],id:id1,content:"Existing original",blockId:"p2-ocr0",quote:"OCR",color:"green"}];
  const plan=planOfflineImport({bookId,ownerId,local:one,cloudNotes:[cloudNote],cloudBookmarks:[],cloudDocument:doc});
  assert.equal(plan.notes.length,0);
  assert.equal(plan.unchanged,1);
});
