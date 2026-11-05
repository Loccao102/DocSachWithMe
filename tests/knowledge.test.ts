import assert from "node:assert/strict";
import {test} from "node:test";
import {isCardDue,makeStudyCard,reviewStudyCard} from "../src/lib/flashcards";
import {collectKnowledge,knowledgeToCsv,searchKnowledge,type KnowledgeEntry} from "../src/lib/knowledge";

const now=new Date("2026-10-28T09:00:00Z");

test("flashcards start due and schedule good/easy reviews",()=>{
  const card=makeStudyCard({question:"Why?",answer:"Because",bookTitle:"A Book",sourceUrl:"/demo"} ,now,"card-1");
  assert.equal(isCardDue(card,now),true);
  const good=reviewStudyCard(card,"good",now);
  assert.equal(good.intervalDays,1);
  assert.equal(isCardDue(good,now),false);
  const later=reviewStudyCard(good,"good",new Date("2026-10-29T09:00:00Z"));
  assert.equal(later.intervalDays,3);
  const easy=reviewStudyCard(card,"easy",now);
  assert.equal(easy.intervalDays,4);
  assert.equal(reviewStudyCard(easy,"again",now).dueAt,new Date(now.getTime()+10*60000).toISOString());
});

test("collects notes from local, Gutenberg and cloud books and searches accents",()=>{
  const result=collectKnowledge(
    [{id:"a",title:"Tư duy",author:"Anh",notes:[{id:"n1",blockId:"p3-b2",quote:"Đọc sách rất hay",page:3,color:"yellow",content:"Suy ngẫm",createdAt:"2026-10-27T12:00:00Z"}]}],
    [{id:19,title:"Wonderland",author:"Lewis",notes:[{id:"n2",blockId:"p1-b1",quote:"A rabbit",page:1,color:"pink",content:"",createdAt:"2026-10-27T11:00:00Z"}]}],
    [{id:"c",title:"Cloud",author:null}],
    [{id:"n3",book_id:"c",owner_id:"x",block_id:"p12-b0",quote:"A cloud quote",note:"Insight",color:"green",created_at:"2026-10-27T13:00:00Z"}]
  );
  assert.equal(result.length,3);
  assert.equal(result[0].page,12);
  assert.equal(searchKnowledge(result,"suy ngam").length,1);
  assert.equal(searchKnowledge(result,"", "gutenberg").length,1);
  assert.match(result.find(e=>e.source==="local")!.url,/book=a/);
});


test("Vietnamese uppercase Đ and scattered search terms match notes",()=>{
  const item:KnowledgeEntry={
    id:"n",source:"local",bookId:"b",bookTitle:"ĐẠO ĐỨC",
    author:"Tác giả",quote:"Tư duy và đọc sách sâu hơn",note:"Đọc để suy ngẫm.",
    page:2,color:"yellow",createdAt:"2026-11-05T09:00:00Z",url:"/demo"
  };
  assert.equal(searchKnowledge([item],"dao duc").length,1);
  assert.equal(searchKnowledge([item],"tu duy sach").length,1);
  assert.equal(searchKnowledge([item],'"tu duy" "doc sach"').length,1);
  assert.equal(searchKnowledge([item],"tu duy khong co").length,0);
  assert.equal(searchKnowledge([item],"dao","gutenberg").length,0);
});

test("CSV exports Vietnamese, escapes quotations and blocks formula execution",()=>{
  const dangerous:KnowledgeEntry={
    id:"x",source:"cloud",bookId:"b",bookTitle:"=SUM(1,1)",
    author:"+cmd",quote:'Ghi chú "trích dẫn"',note:" \t=HYPERLINK(\"evil\")",
    page:4,color:"yellow",createdAt:"2026-11-05T09:00:00Z",
    url:"/books/b"
  };
  const csv=knowledgeToCsv([dangerous]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=SUM(1,1)"'));
  assert.ok(csv.includes('"\'+cmd"'));
  assert.ok(csv.includes('Ghi chú ""trích dẫn""'));
  assert.ok(csv.includes('"\x27 \t=HYPERLINK(""evil"")"'));
  assert.match(csv,/Thư viện cloud/);
  assert.ok(csv.endsWith("\r\n"));
});
