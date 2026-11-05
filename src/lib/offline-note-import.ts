import type {DemoBook} from "./demo-store";
import type {BookDocument,ReaderBookmark,ReaderNote} from "./types";
import {offlineBookId} from "./offline-book";

export type PlannedNote=Pick<ReaderNote,"id"|"book_id"|"owner_id"|"block_id"|"quote"|"note"|"color"|"created_at">;
export type PlannedBookmark=Pick<ReaderBookmark,"book_id"|"owner_id"|"block_id"|"page">;

export type OfflineImportPlan={
  notes:PlannedNote[];
  bookmarks:PlannedBookmark[];
  unchanged:number;
  conflicts:number;
  missingAnchors:number;
  skippedBookmarks:number;
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLORS=new Set(["yellow","green","pink"]);

/** Append-only import: existing cloud notes are never modified or deleted. */
export function planOfflineImport(input:{
  bookId:string;ownerId:string;local:DemoBook;
  cloudNotes:ReaderNote[];cloudBookmarks:ReaderBookmark[];
  cloudDocument:BookDocument|null;
}):OfflineImportPlan {
  const {bookId,ownerId,local,cloudNotes,cloudBookmarks,cloudDocument}=input;
  if(!UUID.test(bookId)||!UUID.test(ownerId)||local.id!==offlineBookId(bookId))
    throw new Error("Bản sách local không khớp với sách cloud đang mở.");
  if(!cloudDocument||cloudDocument.version!==1||!Array.isArray(cloudDocument.pages))
    throw new Error("Sách cloud chưa có bản văn để đối chiếu neo ghi chú.");
  const blocks=new Set(cloudDocument.pages.flatMap(page=>page.blocks.map(block=>block.id)));
  const byId=new Map(cloudNotes.filter(note=>note.book_id===bookId&&note.owner_id===ownerId)
    .map(note=>[note.id,note]));
  const signatures=new Set([...byId.values()].map(note=>
    [note.block_id,note.quote,note.note,note.color].join("\u0000")));
  const notes:PlannedNote[]=[];
  const processed=new Set<string>();
  let unchanged=0,conflicts=0,missingAnchors=0;
  for(const note of local.notes){
    if(!UUID.test(note.id)||processed.has(note.id)||!COLORS.has(note.color)||
      typeof note.blockId!=="string"||!blocks.has(note.blockId)||
      (note.quote.trim()===""&&note.content.trim()==="")){
      missingAnchors++;continue;
    }
    processed.add(note.id);
    const quote=note.quote.slice(0,2000);
    const comment=note.content.slice(0,15000);
    const signature=[note.blockId,quote,comment,note.color].join("\u0000");
    const existing=byId.get(note.id);
    if(existing){
      if([existing.block_id,existing.quote,existing.note,existing.color].join("\u0000")===signature)
        unchanged++;
      else conflicts++;
      continue;
    }
    if(signatures.has(signature)){unchanged++;continue;}
    signatures.add(signature);
    const saved=new Date(note.createdAt);
    notes.push({
      id:note.id,book_id:bookId,owner_id:ownerId,block_id:note.blockId,
      quote,note:comment,color:note.color,
      created_at:Number.isNaN(saved.getTime())?new Date().toISOString():saved.toISOString()
    });
  }
  const existingPages=new Set(cloudBookmarks.filter(item=>item.book_id===bookId&&item.owner_id===ownerId)
    .map(item=>item.page));
  const bookmarks:PlannedBookmark[]=[];
  let skippedBookmarks=0;
  const pages=new Set<number>();
  for(const page of local.bookmarks){
    if(!Number.isInteger(page)||page<1||page>cloudDocument.totalPages||
      pages.has(page)||existingPages.has(page)){
      skippedBookmarks++;continue;
    }
    pages.add(page);
    const anchor=cloudDocument.pages.find(part=>part.page===page)?.blocks[0]?.id||("p"+page+"-b0");
    bookmarks.push({book_id:bookId,owner_id:ownerId,block_id:anchor,page});
  }
  return {notes,bookmarks,unchanged,conflicts,missingAnchors,skippedBookmarks};
}
