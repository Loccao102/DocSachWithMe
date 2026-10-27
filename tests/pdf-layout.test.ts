import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzePage, pageToBlocks, removeRunningHeaders, type PdfFragment } from "../src/lib/pdf-layout";

const fragment=(text:string,x:number,y:number,width=145):PdfFragment=>({text,x,y,width,fontSize:12});
const size={width:600,height:800};

test("two-column text stays in left-column then right-column reading order",()=>{
  const lines=[
    fragment("Trái thứ nhất.",44,700),fragment("Phải thứ nhất.",348,700),
    fragment("Trái thứ hai.",44,680),fragment("Phải thứ hai.",348,680),
    fragment("Trái thứ ba.",44,660),fragment("Phải thứ ba.",348,660)
  ];
  const analyzed=analyzePage(1,lines,size);
  assert.equal(analyzed.twoColumns,true);
  assert.deepEqual(analyzed.lines.map(line=>line.text),[
    "Trái thứ nhất.","Trái thứ hai.","Trái thứ ba.",
    "Phải thứ nhất.","Phải thứ hai.","Phải thứ ba."
  ]);
});

test("single-column content remains in top-to-bottom order",()=>{
  const analyzed=analyzePage(2,[
    fragment("Dòng cuối.",40,550,420),fragment("Dòng đầu.",40,700,420),
    fragment("Dòng giữa.",40,620,420)
  ],size);
  assert.equal(analyzed.twoColumns,false);
  assert.deepEqual(analyzed.lines.map(line=>line.text),["Dòng đầu.","Dòng giữa.","Dòng cuối."]);
});

test("repeated running headers and footer page numbers are omitted",()=>{
  const pages=Array.from({length:5},(_,index)=>analyzePage(index+1,[
    fragment("KHO TRI THỨC CỦA TÔI",40,782,200),
    fragment("Văn bản nội dung "+index,40,600,390),
    fragment(String(index+1),300,20,10)
  ],size));
  const cleaned=removeRunningHeaders(pages);
  for(const page of cleaned){
    assert.equal(page.lines.length,1);
    assert.ok(page.lines[0].text.startsWith("Văn bản nội dung"));
  }
});

test("extracts chapter headings and reassembles hyphenated line endings",()=>{
  const page=analyzePage(1,[
    fragment("Chương 2",40,720,160),
    fragment("Chúng ta có thể tạo",40,680,260),
    fragment("những kết-",40,660,170),
    fragment("nối đáng nhớ.",40,640,220)
  ],size);
  const parsed=pageToBlocks(page);
  assert.equal(parsed.blocks[0].kind,"heading");
  assert.equal(parsed.blocks[0].text,"Chương 2");
  const body=parsed.blocks.filter(block=>block.kind==="paragraph").map(block=>block.text).join(" ");
  assert.ok(body.includes("kết-nối"),body);
});
