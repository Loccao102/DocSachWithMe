import type { Book, BookDocument, ReaderBookmark, ReaderNote } from "./types";

function escapeMarkdown(value:string):string {
  return value.replace(/\\/g,"\\\\").replace(/([*_\[\]`])/g,"\\$1").replace(/\r?\n/g," ");
}

export function notesToMarkdown(book:Pick<Book,"title"|"author">,notes:ReaderNote[],bookmarks:ReaderBookmark[]=[],documentData:BookDocument|null=null):string {
  const lines:string[]=[
    `# ${escapeMarkdown(book.title)}`,
    "",
    `**Tác giả:** ${escapeMarkdown(book.author || "Chưa xác định")}`,
    `**Ngày xuất:** ${new Date().toLocaleDateString("vi-VN")}`,
    `**Số ghi chú:** ${notes.length}`,
    "",
    "---",
    ""
  ];
  const pageMap=new Map((documentData?.pages||[]).flatMap(p=>p.blocks.map(block=>[block.id,p.page] as const)));
  for(const note of [...notes].sort((a,b)=>(pageMap.get(a.block_id)||0)-(pageMap.get(b.block_id)||0)||a.created_at.localeCompare(b.created_at))){
    const page=pageMap.get(note.block_id);
    lines.push(`## ${page ? `Trang ${page}` : "Ghi chú"}`,"");
    if(note.quote)lines.push(`> ${note.quote.replace(/\r?\n/g,"\n> ")}`,"");
    if(note.note)lines.push(note.note,"");
    lines.push("---","");
  }
  if(bookmarks.length) {
    lines.push("## Đánh dấu trang","","Các trang đã lưu: "+[...new Set(bookmarks.map(item=>item.page))].sort((a,b)=>a-b).join(", "),"");
  }
  return lines.join("\n");
}

export function downloadNotesMarkdown(book:Book,notes:ReaderNote[],bookmarks:ReaderBookmark[],documentData:BookDocument|null){
  const content=notesToMarkdown(book,notes,bookmarks,documentData);
  const blob=new Blob([content],{type:"text/markdown;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=(book.title.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9\-_ ]/g,"").trim().replace(/\s+/g,"-").slice(0,80)||"ghi-chu")+".md";
  document.body.appendChild(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),2000);
}
