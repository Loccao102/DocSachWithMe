import { strFromU8, unzipSync } from "fflate";
import type { BookDocument, BookPage, BookChapter, BookBlock } from "./types";

const MAX_ARCHIVE=35*1024*1024;
const MAX_UNCOMPRESSED=90*1024*1024;
const MAX_ENTRIES=1400;
const MAX_SPINE=350;
export type EpubResult={title:string;author:string;document:BookDocument};

export function checkEpubZip(buffer:Uint8Array):void{
  if(buffer.byteLength>MAX_ARCHIVE)throw new Error("EPUB vượt quá giới hạn 35MB.");
  const v=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);
  let end=-1;
  for(let p=buffer.length-22;p>=Math.max(0,buffer.length-22-65535);p--){
    if(v.getUint32(p,true)===0x06054b50){end=p;break;}
  }
  if(end<0)throw new Error("File EPUB không có cấu trúc ZIP hợp lệ.");
  const count=v.getUint16(end+10,true);
  const offset=v.getUint32(end+16,true);
  if(count===0||count>MAX_ENTRIES||offset===0xffffffff)throw new Error("EPUB có quá nhiều file hoặc cấu trúc không hỗ trợ.");
  let p=offset,total=0;
  for(let i=0;i<count;i++){
    if(p+46>buffer.length||v.getUint32(p,true)!==0x02014b50)throw new Error("Bảng file EPUB bị hỏng.");
    const size=v.getUint32(p+24,true);
    const name=v.getUint16(p+28,true);
    const extra=v.getUint16(p+30,true);
    const comment=v.getUint16(p+32,true);
    if(size===0xffffffff||size>MAX_UNCOMPRESSED)throw new Error("Một phần trong EPUB vượt giới hạn dung lượng.");
    total+=size;
    if(total>MAX_UNCOMPRESSED)throw new Error("EPUB giải nén quá lớn.");
    p+=46+name+extra+comment;
  }
}

export function resolveEpubPath(from:string,relative:string):string{
  const clean=relative.split(/[?#]/,1)[0];
  if(/^(?:[a-z]+:|\/\/)/i.test(clean))throw new Error("EPUB chứa đường dẫn ngoài không được hỗ trợ.");
  let path:string;
  try{path=decodeURIComponent(clean);}catch{path=clean;}
  const parts=path.startsWith("/")?[]:from.split("/").slice(0,-1);
  for(const segment of path.split("/")){
    if(!segment||segment===".")continue;
    if(segment===".."){if(!parts.length)throw new Error("Đường dẫn EPUB nằm ngoài sách.");parts.pop();}
    else parts.push(segment);
  }
  return parts.join("/");
}

function xml(raw:string):Document{
  const parsed=new DOMParser().parseFromString(raw,"application/xml");
  if(parsed.getElementsByTagName("parsererror").length)throw new Error("EPUB có XML không hợp lệ.");
  return parsed;
}
function firstByLocal(parent:Document|Element,name:string):Element|null{
  return Array.from(parent.getElementsByTagName("*")).find(el=>el.localName.toLowerCase()===name)||null;
}
function allByLocal(parent:Document|Element,name:string):Element[]{
  return Array.from(parent.getElementsByTagName("*")).filter(el=>el.localName.toLowerCase()===name);
}
function readable(text:string):string{return text.replace(/\u00ad/g,"").replace(/\s+/g," ").trim();}

export async function extractEpub(file:File|Blob,onProgress?:(index:number,total:number)=>void):Promise<EpubResult>{
  const bytes=new Uint8Array(await file.arrayBuffer());
  checkEpubZip(bytes);
  const archive=unzipSync(bytes);
  const get=(path:string)=>archive[path];
  const read=(path:string)=>{
    const item=get(path);
    if(!item)throw new Error(`Thiếu file EPUB: ${path.slice(0,100)}`);
    return strFromU8(item);
  };
  const container=xml(read("META-INF/container.xml"));
  const rootfile=firstByLocal(container,"rootfile");
  const packagePath=rootfile?.getAttribute("full-path");
  if(!packagePath)throw new Error("EPUB thiếu tệp mô tả nội dung.");
  const opf=xml(read(packagePath));
  const title=readable(firstByLocal(firstByLocal(opf,"metadata")||opf,"title")?.textContent||"")||"Sách EPUB";
  const author=readable(firstByLocal(firstByLocal(opf,"metadata")||opf,"creator")?.textContent||"");
  const manifest=new Map<string,{path:string;media:string}>();
  for(const item of allByLocal(opf,"item")){
    const id=item.getAttribute("id"),href=item.getAttribute("href");
    if(id&&href){
      try{manifest.set(id,{path:resolveEpubPath(packagePath,href),media:item.getAttribute("media-type")||""});}catch{/* Ignore unsafe resources. */}
    }
  }
  const items=allByLocal(opf,"itemref").filter(item=>item.getAttribute("linear")!=="no").map(item=>manifest.get(item.getAttribute("idref")||"")).filter((x):x is {path:string;media:string}=>Boolean(x)).slice(0,MAX_SPINE);
  if(!items.length)throw new Error("EPUB không có chương nào để đọc.");
  const pages:BookPage[]=[{page:1,blocks:[]}];
  const toc:BookChapter[]=[];
  let page=1,wordsOnPage=0,wordCount=0,blockNumber=0;
  const add=(text:string,kind:BookBlock["kind"],startNew=false)=>{
    const normalized=readable(text);
    if(!normalized)return;
    const pieces=normalized.match(/.{1,1600}(?:\s|$)|.{1,1600}/gu)||[normalized];
    for(let i=0;i<pieces.length;i++){
      const piece=pieces[i].trim();
      if(!piece)continue;
      const count=piece.split(/\s+/).length;
      if(wordsOnPage>0&&(wordsOnPage+count>370||(startNew&&i===0&&wordsOnPage>0))){
        page++;blockNumber=0;wordsOnPage=0;pages.push({page,blocks:[]});
      }
      pages[pages.length-1].blocks.push({id:`p${page}-b${blockNumber++}`,page,text:piece,kind:i===0?kind:"paragraph"});
      wordsOnPage+=count;wordCount+=count;
    }
  };
  for(let index=0;index<items.length;index++){
    const item=items[index];
    if(item.media!=="application/xhtml+xml"&&item.media!=="text/html"){onProgress?.(index+1,items.length);continue;}
    const source=get(item.path);
    if(!source||source.byteLength>7*1024*1024){onProgress?.(index+1,items.length);continue;}
    const raw=strFromU8(source);
    let parsed=new DOMParser().parseFromString(raw,"application/xhtml+xml");
    if(parsed.getElementsByTagName("parsererror").length)parsed=new DOMParser().parseFromString(raw,"text/html");
    const body=firstByLocal(parsed,"body");
    if(!body){onProgress?.(index+1,items.length);continue;}
    const before=pages[pages.length-1].blocks.length;
    let chapterTitle="";
    let startBlockId="";
    const candidates=Array.from(body.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,pre"));
    const paragraphs=candidates.length?candidates:[body];
    for(const element of paragraphs){
      if(["script","style","nav","svg"].some(tag=>Boolean(element.closest(tag))))continue;
      if(element.localName==="blockquote" && element.querySelector("p"))continue;
      const content=readable(element.textContent||"");
      if(!content)continue;
      const heading=/^h[1-4]$/.test(element.localName);
      if(!chapterTitle&&heading)chapterTitle=content.slice(0,110);
      const prior=pages[pages.length-1].blocks.length;
      add(content,heading?"heading":"paragraph",index>0 && !startBlockId);
      if(!startBlockId && (pages[pages.length-1].blocks.length>prior||page>1))startBlockId=pages[pages.length-1].blocks.at(-1)?.id||"";
    }
    // Bookmark each spine section, preserving its original reading order.
    if(startBlockId && toc.length<150){
      const match=pages.flatMap(p=>p.blocks).find(block=>block.id===startBlockId);
      toc.push({title:chapterTitle||`Phần ${index+1}`,page:match?.page||1,blockId:startBlockId});
    }
    if(!before&&pages[pages.length-1].blocks.length===0)continue;
    onProgress?.(index+1,items.length);
  }
  if(wordCount<30)throw new Error("EPUB này chưa có nội dung chữ đọc được.");
  return {title,author,document:{version:1,totalPages:pages.length,wordCount,pages,toc,analysis:{scannedPages:[],twoColumnPages:[],tocSource:"detected-headings",warnings:["Chế độ đọc EPUB hiện ưu tiên văn bản. Bảng, hình minh họa và định dạng phức tạp có thể không được bảo toàn."]}}};
}
