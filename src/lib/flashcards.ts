export type ReviewRating="again"|"hard"|"good"|"easy";
export type StudyCard={
  id:string; sourceNoteId:string|null; question:string; answer:string;
  bookTitle:string; sourceUrl:string; createdAt:string; dueAt:string;
  intervalDays:number; ease:number; repetitions:number; lastReviewedAt:string|null;
};

const DAY=86400000;
export function isCardDue(card:StudyCard,now=new Date()):boolean{
  return new Date(card.dueAt).getTime()<=now.getTime();
}
export function makeStudyCard(input:{
  question:string;answer:string;bookTitle:string;sourceUrl:string;sourceNoteId?:string|null;
},now=new Date(),id:string):StudyCard{
  const question=input.question.trim(),answer=input.answer.trim();
  if(!question||!answer)throw new Error("Hãy nhập cả câu hỏi lẫn câu trả lời.");
  if(question.length>500||answer.length>4000)throw new Error("Câu hỏi hoặc câu trả lời quá dài.");
  return {
    id,sourceNoteId:input.sourceNoteId||null,question,answer,
    bookTitle:input.bookTitle.slice(0,300),sourceUrl:input.sourceUrl.slice(0,600),
    createdAt:now.toISOString(),dueAt:now.toISOString(),intervalDays:0,ease:2.5,
    repetitions:0,lastReviewedAt:null
  };
}
export function reviewStudyCard(card:StudyCard,rating:ReviewRating,now=new Date()):StudyCard{
  const repeats=rating==="again"?0:card.repetitions+1;
  const ease= Math.min(3.2,Math.max(1.3,card.ease+
    (rating==="again" ? -.2:rating==="hard"?-.12:rating==="easy"?.12:0)));
  const days= rating==="again"?0:
    rating==="hard"? Math.max(1,Math.round(card.intervalDays*1.2)):
    rating==="easy"? (card.repetitions===0?4:Math.max(2,Math.round(card.intervalDays*ease*1.3))):
    card.repetitions===0?1:card.repetitions===1?3:Math.max(3,Math.round(card.intervalDays*ease));
  return {...card,ease,repetitions:repeats,intervalDays:days,
    lastReviewedAt:now.toISOString(),
    dueAt:new Date(now.getTime()+(rating==="again"?10*60000:days*DAY)).toISOString()};
}
