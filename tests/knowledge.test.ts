import assert from "node:assert/strict";
import {test} from "node:test";
import {isCardDue,makeStudyCard,reviewStudyCard} from "../src/lib/flashcards";
import {collectKnowledge,searchKnowledge} from "../src/lib/knowledge";

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
