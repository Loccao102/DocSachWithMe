import assert from "node:assert/strict";
import {test} from "node:test";
import {makeStudyCard} from "../src/lib/flashcards";
import {parseStudyBackup,serializeStudyCards,mergeStudyCards} from "../src/lib/study-backup";

test("study backup contains flashcards and preserves scheduling on restore",()=>{
  const sample=makeStudyCard({question:"Điều gì?",answer:"Một điều đáng nhớ.",bookTitle:"Sách A",sourceUrl:"/demo?book=abc"},new Date("2026-10-28T10:00:00Z"),"a");
  const restored=parseStudyBackup(serializeStudyCards([sample]));
  assert.equal(restored.length,1);
  assert.notEqual(restored[0].id,sample.id);
  assert.equal(restored[0].question,sample.question);
  assert.equal(restored[0].dueAt,sample.dueAt);
});

test("rejects malformed backup, oversized data and hostile URLs",()=>{
  assert.throws(()=>parseStudyBackup("not json"),/JSON/);
  assert.throws(()=>parseStudyBackup(JSON.stringify({format:"other",version:1,cards:[]})),/không phải/i);
  const sample=makeStudyCard({question:"Q",answer:"A",bookTitle:"Book",sourceUrl:"//outside.example"},new Date(),"a");
  const imported=parseStudyBackup(serializeStudyCards([sample]));
  assert.equal(imported[0].sourceUrl,"/knowledge");
  assert.throws(()=>parseStudyBackup("x".repeat(2*1024*1024+1)),/quá 2MB/);
});


test("private cloud restores preserve stable ids and avoid duplicate reviews",()=>{
  const id="a0c49f44-6e49-4b15-8800-bf7bde1546aa";
  const now=new Date("2026-11-05T09:00:00Z");
  const original=makeStudyCard({question:"Why?",answer:"Knowledge",bookTitle:"A",sourceUrl:"/knowledge"},now,id);
  const restored=parseStudyBackup(serializeStudyCards([original]),true);
  assert.equal(restored[0].id,id);
  const newer={...original,lastReviewedAt:"2026-11-06T09:00:00.000Z",intervalDays:4};
  const merged=mergeStudyCards([newer],restored);
  assert.equal(merged.length,1);
  assert.equal(merged[0].intervalDays,4);
  const mergedTwice=mergeStudyCards(merged,restored);
  assert.equal(mergedTwice.length,1);
});

test("cloud merge accepts newer remote reviews but keeps other local cards",()=>{
  const date=new Date("2026-11-05T09:00:00Z");
  const a=makeStudyCard({question:"A",answer:"A1",bookTitle:"X",sourceUrl:"/knowledge"},date,"aaa");
  const b=makeStudyCard({question:"B",answer:"B1",bookTitle:"Y",sourceUrl:"/knowledge"},date,"bbb");
  const updated={...a,lastReviewedAt:"2026-11-06T09:00:00.000Z",answer:"A2"};
  const merged=mergeStudyCards([a,b],[updated]);
  assert.equal(merged.length,2);
  assert.equal(merged.find(c=>c.id==="aaa")?.answer,"A2");
});
