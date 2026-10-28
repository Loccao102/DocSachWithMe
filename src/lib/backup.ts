import { strFromU8, strToU8, unzip, zip } from "fflate";
import type { DemoBook } from "./demo-store";
import type { BookDocument } from "./types";

type BackupPayload = {
  format: "docsachwithme";
  version: 1;
  book: Omit<DemoBook,"pdf">;
};
const maxArchiveBytes=100*1024*1024;
const maxOriginalBytes=50*1024*1024;
const makeFileName=(name:string)=>name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w -]/g,"").trim().replace(/\s+/g,"-").slice(0,70)||"cuon-sach";

/** Export one PDF with reading progress, highlights and notes into a portable ZIP. */
export async function exportDemoBackup(book:DemoBook):Promise<void>{
  const { pdf, ...metadata }=book;
  const manifest:BackupPayload={format:"docsachwithme",version:1,book:metadata};
  const sourceName=book.format==="epub"?"book.epub":"book.pdf";
  const files:{[name:string]:Uint8Array}={[sourceName]:new Uint8Array(await pdf.arrayBuffer()),"manifest.json":strToU8(JSON.stringify(manifest))};
  const bytes=await new Promise<Uint8Array>((resolve,reject)=>{
    zip(files,{level:0},(error,data)=>error?reject(error):resolve(data));
  });
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/zip"}));
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=makeFileName(book.title)+".dswm.zip";
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),10000);
}

function isDocument(input:unknown):input is BookDocument{
  if(typeof input!=="object"||!input)return false;
  const doc=input as Partial<BookDocument>;
  return doc.version===1 && Array.isArray(doc.pages) && Array.isArray(doc.toc) &&
    typeof doc.totalPages==="number" && typeof doc.wordCount==="number";
}

export async function importDemoBackup(file:File):Promise<DemoBook>{
  if(file.size>maxArchiveBytes)throw new Error("Bản sao lưu vượt quá 100MB.");
  const raw=new Uint8Array(await file.arrayBuffer());
  const archive=await new Promise<Record<string,Uint8Array>>((resolve,reject)=>{
    unzip(raw,(error,result)=>error?reject(error):resolve(result));
  });
  const manifestFile=archive["manifest.json"];
  const original=archive["book.epub"]||archive["book.pdf"];
  const format=archive["book.epub"]?"epub":"pdf";
  if(!manifestFile||manifestFile.byteLength>65*1024*1024||!original||original.byteLength===0||original.byteLength>maxOriginalBytes)
    throw new Error("Bản sao lưu không hợp lệ hoặc PDF vượt quá 50MB.");
  let data:BackupPayload;
  try{data=JSON.parse(strFromU8(manifestFile)) as BackupPayload;}
  catch{throw new Error("Không đọc được thông tin bản sao lưu.");}
  if(data?.format!=="docsachwithme" || data.version!==1 || !data.book ||
    typeof data.book.title!=="string" || data.book.title.length>300 ||
    !Number.isFinite(data.book.page) || !Array.isArray(data.book.notes) ||
    !Array.isArray(data.book.bookmarks) ||
    (data.book.document!==null && !isDocument(data.book.document)))
    throw new Error("Tệp không phải bản sao lưu DocSachWithMe hợp lệ.");
  const notes=data.book.notes.filter(n=>typeof n?.id==="string" && typeof n?.quote==="string" &&
    typeof n?.blockId==="string" && typeof n?.content==="string" && Number.isInteger(n?.page))
    .slice(0,20000).map(n=>({...n,quote:n.quote.slice(0,2500),content:n.content.slice(0,15000)}));
  const bookmarks=data.book.bookmarks.filter(n=>Number.isInteger(n)&&n>=1).slice(0,3000);
  const bookFile=new Blob([new Uint8Array(original)],{type:format==="epub"?"application/epub+zip":"application/pdf"});
  return {
    id:crypto.randomUUID(),title:data.book.title||"Sách được khôi phục",
    author:typeof data.book.author==="string"?data.book.author.slice(0,200):"",
    createdAt:new Date().toISOString(),pdf:bookFile,format,
    document:data.book.document||null,
    page:Math.max(1,Math.floor(data.book.page)),
    notes,bookmarks
  };
}
