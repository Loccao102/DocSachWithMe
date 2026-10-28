import assert from "node:assert/strict";
import {test} from "node:test";
import {makeStudyCard} from "../src/lib/flashcards";
import {parseStudyBackup,serializeStudyCards} from "../src/lib/study-backup";

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
