import type { DemoBook, DemoNote } from "./demo-store";
import type {
  Book, BookDocument, ReaderBookmark, ReaderNote, ReadingProgress
} from "./types";

/**
 * Copies a privately owned cloud book into the local /demo reader.
 * This is a snapshot, NOT live sync. Its stable ID makes duplicate imports
 * detectable, so existing offline edits cannot be silently overwritten.
 */
export function offlineBookId(bookId: string): string {
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(bookId))
    throw new Error("Mã sách cloud không hợp lệ.");
  return "cloud-" + bookId;
}

function notePage(note:ReaderNote,document:BookDocument|null):number {
  const fromBlock=document?.pages.find(page=>page.blocks.some(block=>block.id===note.block_id))?.page;
  if(fromBlock)return fromBlock;
  const fromId=Number(note.block_id.match(/^p(\d+)-(?:b|ocr)\d+$/)?.[1]);
  const total=document?.totalPages||5000;
  return Number.isInteger(fromId)&&fromId>=1 ? Math.min(fromId,total):1;
}

export function createOfflineBook(input:{
  book: Book;
  ownerId: string;
  original: Blob;
  document: BookDocument|null;
  notes: ReaderNote[];
  bookmarks: ReaderBookmark[];
  progress: Pick<ReadingProgress,"page">|null;
  createdAt?: string;
}):DemoBook {
  const {book,ownerId,original,document,notes,bookmarks,progress}=input;
  if(book.owner_id!==ownerId)throw new Error("Không thể lưu sách của tài khoản khác.");
  const format=book.file_path.toLowerCase().endsWith(".epub")?"epub":"pdf";
  if(!book.file_path.toLowerCase().endsWith(format==="epub"?".epub":".pdf"))
    throw new Error("Định dạng sách không được hỗ trợ.");
  const limit=(format==="epub"?35:50)*1024*1024;
  if(!original.size||original.size>limit)throw new Error("Sách gốc vượt quá giới hạn lưu offline.");
  if(document && (document.version!==1||!Number.isInteger(document.totalPages)||
    !Array.isArray(document.pages)||!Array.isArray(document.toc)))
    throw new Error("Tài liệu ebook cloud không hợp lệ.");
  if(format==="epub"&&!document)throw new Error("EPUB cần bản văn để đọc offline.");

  const maxPage=document?.totalPages||Math.max(1,book.total_pages);
  const storedNotes:DemoNote[]=notes.filter(note=>note.book_id===book.id&&note.owner_id===ownerId)
    .slice(0,20000).map(note=>({
      id:note.id,blockId:note.block_id,
      page:notePage(note,document),
      quote:note.quote.slice(0,2000),content:note.note.slice(0,15000),
      color:note.color==="green"||note.color==="pink"?note.color:"yellow",
      createdAt:note.created_at
    }));
  const savedPages=[...new Set(bookmarks.filter(entry=>entry.book_id===book.id&&entry.owner_id===ownerId)
    .map(entry=>entry.page).filter(page=>Number.isInteger(page)&&page>=1&&page<=maxPage))]
    .sort((a,b)=>a-b);
  const rawPage=progress?.page??1;
  const page=Number.isInteger(rawPage)?Math.min(maxPage,Math.max(1,rawPage)):1;

  return {
    id:offlineBookId(book.id),title:book.title,author:book.author||"",
    createdAt:input.createdAt||new Date().toISOString(),
    pdf:original,document,format,page,bookmarks:savedPages,notes:storedNotes
  };
}
