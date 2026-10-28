import type { StudyCard } from "./flashcards";

const MAX_BYTES=2*1024*1024;
const MAX_CARDS=5000;

export function serializeStudyCards(cards:StudyCard[]):string{
  if(cards.length>MAX_CARDS)throw new Error("Có quá nhiều flashcard để xuất một lần.");
  return JSON.stringify({format:"docsachwithme-study",version:1,exportedAt:new Date().toISOString(),cards},null,2);
}
function date(value:unknown,fallback:string):string{
  if(typeof value!=="string")return fallback;
  const valueTime=Date.parse(value);
  return Number.isFinite(valueTime)?new Date(valueTime).toISOString():fallback;
}
export function parseStudyBackup(raw:string):StudyCard[]{
  if(new TextEncoder().encode(raw).byteLength>MAX_BYTES)throw new Error("Bản sao lưu quá 2MB.");
  let parsed:unknown;
  try{parsed=JSON.parse(raw);}catch{throw new Error("File JSON không hợp lệ.");}
  if(!parsed||typeof parsed!=="object")throw new Error("Không phải bản sao lưu flashcard.");
  const data=parsed as {format?:unknown;version?:unknown;cards?:unknown};
  if(data.format!=="docsachwithme-study"||data.version!==1||!Array.isArray(data.cards))
    throw new Error("Đây không phải file sao lưu flashcard của DocSachWithMe.");
  if(data.cards.length>MAX_CARDS)throw new Error("File có quá nhiều flashcard.");
  const now=new Date().toISOString();
  return data.cards.map((value:unknown,i:number)=>{
    if(!value||typeof value!=="object")throw new Error(`Flashcard thứ ${i+1} không hợp lệ.`);
    const card=value as Partial<StudyCard>;
    if(typeof card.question!=="string"||!card.question.trim()||card.question.length>500||
      typeof card.answer!=="string"||!card.answer.trim()||card.answer.length>4000)
      throw new Error(`Flashcard thứ ${i+1} có nội dung không hợp lệ.`);
    const route=typeof card.sourceUrl==="string"&&card.sourceUrl.startsWith("/")&&!card.sourceUrl.startsWith("//")
      ?card.sourceUrl.slice(0,600):"/knowledge";
    return {
      id:crypto.randomUUID(),sourceNoteId:typeof card.sourceNoteId==="string"?card.sourceNoteId.slice(0,400):null,
      question:card.question.trim(),answer:card.answer.trim(),
      bookTitle:typeof card.bookTitle==="string"?card.bookTitle.slice(0,300):"Sổ tay",
      sourceUrl:route,
      createdAt:date(card.createdAt,now),dueAt:date(card.dueAt,now),
      intervalDays:typeof card.intervalDays==="number"&&card.intervalDays>=0&&card.intervalDays<=36500?card.intervalDays:0,
      ease:typeof card.ease==="number"&&card.ease>=1.3&&card.ease<=3.2?card.ease:2.5,
      repetitions:typeof card.repetitions==="number"&&Number.isInteger(card.repetitions)&&card.repetitions>=0&&card.repetitions<=1000?card.repetitions:0,
      lastReviewedAt:card.lastReviewedAt?date(card.lastReviewedAt,now):null
    } satisfies StudyCard;
  });
}
