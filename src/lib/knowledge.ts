import type { Book, ReaderNote } from "./types";
import type { DemoBook } from "./demo-store";
import type { SavedPublicBook } from "./free-books";

export type KnowledgeSource = "local" | "gutenberg" | "cloud";
export type KnowledgeEntry = {
  id:string; source:KnowledgeSource; bookId:string; bookTitle:string; author:string;
  quote:string; note:string; page:number; color:string; createdAt:string; url:string;
};
export const sourceLabels:Record<KnowledgeSource,string> = {
  local:"Sách tải lên",gutenberg:"Sách miễn phí",cloud:"Thư viện cloud"
};

export function collectKnowledge(
  localBooks:Pick<DemoBook,"id"|"title"|"author"|"notes">[],
  gutenbergBooks:Pick<SavedPublicBook,"id"|"title"|"author"|"notes">[],
  cloudBooks:Pick<Book,"id"|"title"|"author">[],
  cloudNotes:ReaderNote[]
):KnowledgeEntry[] {
  const entries:KnowledgeEntry[]=[];
  for(const book of localBooks)for(const note of book.notes){
    entries.push({
      id:`local:${book.id}:${note.id}`,source:"local",bookId:book.id,
      bookTitle:book.title,author:book.author||"",
      quote:note.quote,note:note.content,page:note.page,color:note.color,
      createdAt:note.createdAt,url:`/demo?book=${encodeURIComponent(book.id)}&page=${note.page}&block=${encodeURIComponent(note.blockId)}`
    });
  }
  for(const book of gutenbergBooks)for(const note of book.notes){
    entries.push({
      id:`gutenberg:${book.id}:${note.id}`,source:"gutenberg",bookId:String(book.id),
      bookTitle:book.title,author:book.author,quote:note.quote,note:note.content,
      page:note.page,color:note.color,createdAt:note.createdAt,
      url:`/discover/read/${book.id}?page=${note.page}&block=${encodeURIComponent(note.blockId)}`
    });
  }
  const cloudById=new Map(cloudBooks.map(book=>[book.id,book]));
  for(const note of cloudNotes){
    const book=cloudById.get(note.book_id);
    if(!book)continue;
    entries.push({
      id:`cloud:${book.id}:${note.id}`,source:"cloud",bookId:book.id,
      bookTitle:book.title,author:book.author||"",quote:note.quote,note:note.note,
      page:Number(note.block_id.match(/^p(\d+)-/)?.[1]||1),color:note.color,
      createdAt:note.created_at,
      url:`/books/${book.id}?block=${encodeURIComponent(note.block_id)}`
    });
  }
  return entries.filter(entry=>Boolean(entry.quote.trim()||entry.note.trim()))
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

export function searchKnowledge(entries:KnowledgeEntry[],query:string,source:"all"|KnowledgeSource="all"):KnowledgeEntry[]{
  const q=query.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").toLowerCase().trim();
  return entries.filter(entry=>{
    if(source!=="all"&&entry.source!==source)return false;
    if(!q)return true;
    const text=`${entry.bookTitle} ${entry.author} ${entry.quote} ${entry.note}`
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").toLowerCase();
    return text.includes(q);
  });
}

export function knowledgeToMarkdown(entries:KnowledgeEntry[]):string{
  const lines=["# Sổ tay đọc sách — DocSachWithMe","",`Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}`,"",`Tổng số ghi chú: ${entries.length}`,""];
  const grouped=new Map<string,KnowledgeEntry[]>();
  for(const item of entries){
    const key=`${item.source}:${item.bookId}`;
    if(!grouped.has(key))grouped.set(key,[]);
    grouped.get(key)!.push(item);
  }
  for(const group of grouped.values()){
    const book=group[0];
    lines.push(`## ${book.bookTitle.replace(/\r?\n/g," ")}`,"",`Tác giả: ${book.author||"Chưa rõ"}`,"");
    for(const entry of group.sort((a,b)=>a.page-b.page)){
      lines.push(`### Trang ${entry.page}`,"");
      if(entry.quote)lines.push(...entry.quote.split(/\r?\n/).map(line=>`> ${line}`),"");
      if(entry.note)lines.push(entry.note,"");
    }
    lines.push("---","");
  }
  return lines.join("\n");
}
