import assert from "node:assert/strict";
import {test} from "node:test";
import {normalizeLibrarySearch,orderLibraryBooks,readingPercent,selectContinueBook} from "../src/lib/demo-library";
import type {DemoBook} from "../src/lib/demo-store";

function book(id:string,title:string,author:string,createdAt:string,page:number,total=100,lastOpenedAt?:string):DemoBook{
  return {
    id,title,author,createdAt,page,format:"pdf",pdf:new Blob(["pdf"]),
    bookmarks:[],notes:[],lastOpenedAt,
    document:{version:1,totalPages:total,wordCount:100,toc:[],
      pages:[]}
  };
}
const books=[
  book("a","Đắc Nhân Tâm","Dale Carnegie","2026-11-01T00:00:00Z",65,100,"2026-11-02T09:00:00Z"),
  book("b","Nghệ thuật tư duy rõ ràng","Rolf Dobelli","2026-11-02T00:00:00Z",20,100,"2026-11-05T08:00:00Z"),
  book("c","Deep Work","Cal Newport","2026-11-04T00:00:00Z",8,80)
];

test("search handles Vietnamese diacritics, Đ, author and multiple words",()=>{
  assert.equal(normalizeLibrarySearch("  ĐẮC  NHÂN TÂM  "),"dac nhan tam");
  assert.deepEqual(orderLibraryBooks(books,"dac nhan","recent").map(x=>x.id),["a"]);
  assert.deepEqual(orderLibraryBooks(books,"dobelli nghE","recent").map(x=>x.id),["b"]);
  assert.deepEqual(orderLibraryBooks(books,"Cal  Work","recent").map(x=>x.id),["c"]);
  assert.deepEqual(orderLibraryBooks(books,"nonsense","recent"),[]);
});

test("resume selects most recently opened book, not most recently imported",()=>{
  assert.equal(selectContinueBook(books)?.id,"b");
  assert.equal(selectContinueBook([]),null);
  assert.deepEqual(orderLibraryBooks(books,"","recent").map(x=>x.id),["b","c","a"]);
});

test("sort by title and progress without mutating existing book list",()=>{
  const frozen=[...books];
  assert.deepEqual(orderLibraryBooks(books,"","title").map(x=>x.id),["c","a","b"]);
  assert.deepEqual(orderLibraryBooks(books,"","progress").map(x=>x.id),["a","b","c"]);
  assert.deepEqual(books,frozen);
});

test("progress percentage clamps damaged old page values and handles absent text",()=>{
  assert.equal(readingPercent(books[0]),65);
  assert.equal(readingPercent({...books[0],page:999}),100);
  assert.equal(readingPercent({...books[0],page:-12}),0);
  assert.equal(readingPercent({...books[0],document:null}),null);
});
