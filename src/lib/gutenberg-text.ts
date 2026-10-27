import type { BookDocument, BookChapter, BookPage } from "./types";

/** Parse a user-requested plain-text Gutenberg ebook. No external HTML is injected. */
export function textToBookDocument(raw:string):BookDocument {
  // Keep the Gutenberg notice in the downloadable source, but avoid filling the reading screen with its boilerplate.
  const start=raw.search(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const end=raw.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i);
  const first=start<0?0:raw.indexOf("\n",start)+1;
  const cleaned=raw.slice(first,end>first?end:undefined)
    .replace(/\r\n?/g,"\n").replace(/\t/g,"    ").replace(/[ \u00a0]+$/gm,"").trim();
  if(cleaned.length<250)throw new Error("Sách chưa có nội dung văn bản đủ để đọc trực tiếp.");
  const paragraphs=cleaned.split(/\n\s*\n+/g).map(block=>block.split("\n")
    .map(s=>s.trim()).filter(Boolean).join(" ").replace(/\s+/g," ").trim()).filter(Boolean);
  const pages:BookPage[]=[];
  const toc:BookChapter[]=[];
  let page=1,wordCount=0,wordsOnPage=0,blockNumber=0;
  pages.push({page,blocks:[]});
  for(const paragraph of paragraphs){
    if(paragraph.length>20000)continue;
    const words=paragraph.split(/\s+/g).length;
    if(wordsOnPage>0 && wordsOnPage+words>360){
      page+=1;blockNumber=0;wordsOnPage=0;pages.push({page,blocks:[]});
    }
    const heading=/^(?:chapter|book|part|section|volume)\s+(?:[0-9ivxlcdm]+|[A-Z])\b/i.test(paragraph) && paragraph.length<115
      || (/^[A-Z0-9][A-Z0-9\s:.,'’!—\-]{5,90}$/.test(paragraph) && words<12);
    const kind=heading?"heading":"paragraph";
    const id=`p${page}-b${blockNumber++}`;
    pages[pages.length-1].blocks.push({id,page,text:paragraph,kind});
    if(heading && toc.length<150)toc.push({title:paragraph.slice(0,110),page,blockId:id});
    wordsOnPage+=words;wordCount+=words;
  }
  if(!wordCount)throw new Error("Không có nội dung hợp lệ để hiển thị.");
  return {version:1,totalPages:pages.length,wordCount,pages,toc,analysis:{
    scannedPages:[],twoColumnPages:[],tocSource:"detected-headings",warnings:[]
  }};
}
