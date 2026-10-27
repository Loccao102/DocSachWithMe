import type { BookBlock, BookPage } from "./types";

export type PdfFragment = { text: string; x: number; y: number; width: number; fontSize: number };
export type PdfLine = { text: string; x: number; end: number; y: number; fontSize: number; pageHeight: number; pageWidth: number };
export type AnalyzedPage = { page: number; lines: PdfLine[]; twoColumns: boolean };
export type PageLayout = { width: number; height: number };
const squash = (s: string) => s.replace(/\s+/g," ").trim();
const chapterPattern = /^(?:chương|chapter|phần|part|bài|mục)\s+(?:[0-9ivxlcdm]+|[a-z])(?:\b|\s|[:.])/i;

function median(numbers: number[]): number {
  if (!numbers.length) return 14;
  const arr = numbers.slice().sort((a,b) => a-b);
  return arr[Math.floor(arr.length / 2)];
}

export function analyzePage(page: number, fragments: PdfFragment[], dimensions: PageLayout): AnalyzedPage {
  const valid = fragments.filter(f=>f.text.trim() && Number.isFinite(f.x) && Number.isFinite(f.y) && f.fontSize>0);
  valid.sort((a,b)=>b.y-a.y||a.x-b.x);
  const bands: {y:number; parts:PdfFragment[]}[] = [];
  for(const fragment of valid){
    const band=bands.find(line=>Math.abs(line.y-fragment.y) <= Math.max(2.2,fragment.fontSize*.22));
    if(band)band.parts.push(fragment);else bands.push({y:fragment.y,parts:[fragment]});
  }
  const lines: PdfLine[]=[];
  for(const band of bands){
    const parts=band.parts.sort((a,b)=>a.x-b.x);
    let group:PdfFragment[]=[];
    const flush=()=>{
      if(!group.length)return;
      let value="";let previousRight:number|null=null;
      for(const part of group){
        const gap=previousRight===null?0:part.x-previousRight;
        if(value && gap>Math.max(1.8,part.fontSize*.22) && !value.endsWith(" "))value+=" ";
        value+=part.text;
        previousRight=part.x+part.width;
      }
      const text=squash(value);
      if(text)lines.push({
        text,x:group[0].x,end:Math.max(...group.map(p=>p.x+p.width)),
        y:band.y,fontSize:median(group.map(p=>p.fontSize)),
        pageHeight:dimensions.height,pageWidth:dimensions.width
      });
      group=[];
    };
    for(const part of parts){
      const prev=group[group.length-1];
      const distance=prev?part.x-(prev.x+prev.width):0;
      // A large horizontal gutter in the same baseline usually separates columns.
      if(prev && distance>Math.max(42,dimensions.width*.09))flush();
      group.push(part);
    }
    flush();
  }
  const mid=dimensions.width/2;
  const margin=dimensions.width*.055;
  const left=(line:PdfLine)=>line.x < mid-dimensions.width*.15 && line.end < mid+margin;
  const right=(line:PdfLine)=>line.x > mid-margin && line.end > mid+dimensions.width*.15;
  const leftLines=lines.filter(left),rightLines=lines.filter(right);
  const twoColumns=leftLines.length>=3 && rightLines.length>=3 &&
    leftLines.length+rightLines.length>=lines.length*.55;
  if(!twoColumns)return {page,lines:lines.sort((a,b)=>b.y-a.y||a.x-b.x),twoColumns:false};
  const leftBottom=Math.min(...leftLines.map(l=>l.y));
  const rightBottom=Math.min(...rightLines.map(l=>l.y));
  const upper=Math.max(...leftLines.map(l=>l.y),...rightLines.map(l=>l.y));
  const before:PdfLine[]=[],after:PdfLine[]=[],l:PdfLine[]=[],r:PdfLine[]=[];
  for(const line of lines){
    if(!left(line)&&!right(line)&&line.y>upper+5){before.push(line);continue;}
    if(!left(line)&&!right(line)&&line.y<Math.min(leftBottom,rightBottom)-5){after.push(line);continue;}
    if(right(line))r.push(line);else l.push(line);
  }
  const sorted=(arr:PdfLine[])=>arr.sort((a,b)=>b.y-a.y||a.x-b.x);
  return {page,lines:[...sorted(before),...sorted(l),...sorted(r),...sorted(after)],twoColumns:true};
}

function lineFrequencyKey(line:PdfLine):string {
  return squash(line.text).toLocaleLowerCase("vi").replace(/\b\d{1,4}\b/g,"#");
}
export function removeRunningHeaders(pages: AnalyzedPage[]): AnalyzedPage[] {
  if(pages.length<4)return pages;
  const count=new Map<string,Set<number>>();
  for(const page of pages){
    for(const line of page.lines){
      if(line.text.length>95)continue;
      const edge=line.y>line.pageHeight*.91 || line.y<line.pageHeight*.09;
      if(!edge)continue;
      const key=lineFrequencyKey(line);
      if(key.length<4)continue;
      if(!count.has(key))count.set(key,new Set());
      count.get(key)!.add(page.page);
    }
  }
  const repeated=new Set([...count].filter(([,seen])=>seen.size>=Math.max(3,Math.ceil(pages.length*.28))).map(([key])=>key));
  return pages.map(page=>({...page,lines:page.lines.filter(line=>{
    const edge=line.y>line.pageHeight*.91||line.y<line.pageHeight*.09;
    if(!edge)return true;
    if(/^[-–—\s]*(?:\d{1,4}|[ivxlcdm]+)[-–—\s]*$/i.test(line.text))return false;
    return !repeated.has(lineFrequencyKey(line));
  })}));
}

export function pageToBlocks(page: AnalyzedPage): BookPage {
  const blocks:BookBlock[]=[];
  const lines=page.lines;
  const gaps=lines.slice(1).map((l,i)=>lines[i].y-l.y)
    .filter(d=>d>3&&d<45);
  const regularGap=median(gaps);
  let text="",index=0,lastY:number|null=null,lastX:number|null=null,lastSize=12;
  const flush=(kind:"paragraph"|"heading"="paragraph")=>{
    const cleaned=squash(text);
    if(cleaned)blocks.push({id:`p${page.page}-b${index++}`,page:page.page,text:cleaned,kind});
    text="";
  };
  for(const line of lines){
    if(!line.text)continue;
    const gap=lastY===null?0:Math.abs(lastY-line.y);
    const newColumn=lastY!==null && line.y>lastY+regularGap*2;
    const indent=lastX===null?0:line.x-lastX;
    const heading=chapterPattern.test(line.text) ||
      (line.text.length>=6 && line.text.length<95 && /^[A-ZÀ-Ỹ\d\s:–—.,-]+$/.test(line.text) && line.fontSize>lastSize*1.13);
    const boundary=newColumn || gap>regularGap*1.52 ||
      (lastX!==null && indent>line.fontSize*1.75 && /[.!?:;”"]$/.test(text)) ||
      text.length+line.text.length>1200;
    if(heading || boundary)flush();
    if(heading){text=line.text;flush("heading");}
    else if(text.endsWith("-") && /^\p{L}/u.test(line.text))text=text.slice(0,-1)+line.text;
    else text+=(text?" ":"")+line.text;
    lastY=line.y;lastX=line.x;lastSize=line.fontSize;
  }
  flush();
  return {page:page.page,blocks};
}
