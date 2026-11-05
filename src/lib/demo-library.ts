import type {DemoBook} from "./demo-store";

export type LibrarySort="recent"|"title"|"progress";

export function normalizeLibrarySearch(text:string):string{
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[đĐ]/g,"d").toLocaleLowerCase("vi").trim().replace(/\s+/g," ");
}
export function readingPercent(book:Pick<DemoBook,"page"|"document">):number|null{
  const total=book.document?.totalPages;
  if(!Number.isSafeInteger(total)||!total||total<=0)return null;
  const current=Number.isFinite(book.page)?book.page:1;
  return Math.round(Math.min(1,Math.max(0,current/total))*100);
}
function recentStamp(book:DemoBook):number{
  const date=Date.parse(book.lastOpenedAt||book.createdAt);
  return Number.isFinite(date)?date:0;
}
export function orderLibraryBooks(books:readonly DemoBook[],query:string,sort:LibrarySort):DemoBook[]{
  const terms=normalizeLibrarySearch(query).split(" ").filter(Boolean);
  const filtered=books.filter(book=>{
    if(!terms.length)return true;
    const text=normalizeLibrarySearch(book.title+" "+book.author);
    return terms.every(term=>text.includes(term));
  });
  return filtered.sort((a,b)=>{
    if(sort==="title"){
      const byTitle=a.title.localeCompare(b.title,"vi",{sensitivity:"base"});
      if(byTitle)return byTitle;
    }else if(sort==="progress"){
      const byProgress=(readingPercent(b)??-1)-(readingPercent(a)??-1);
      if(byProgress)return byProgress;
    }
    return recentStamp(b)-recentStamp(a) || a.id.localeCompare(b.id);
  });
}
export function selectContinueBook(books:readonly DemoBook[]):DemoBook|null{
  if(!books.length)return null;
  return orderLibraryBooks(books,"","recent")[0]??null;
}
