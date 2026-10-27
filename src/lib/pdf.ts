import type { BookChapter, BookDocument } from "./types";
import { analyzePage, pageToBlocks, removeRunningHeaders, type PdfFragment } from "./pdf-layout";

export async function extractPdf(
  file: File | Blob,
  onProgress?: (current:number,total:number)=>void
):Promise<BookDocument>{
  const pdfjs=await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/build/pdf.worker.min.mjs",import.meta.url).toString();
  const data=new Uint8Array(await file.arrayBuffer());
  const pdf=await pdfjs.getDocument({data}).promise;
  try{
    const analyzed=[];
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
      const page=await pdf.getPage(pageNumber);
      const content=await page.getTextContent();
      const viewport=page.getViewport({scale:1});
      const positioned:PdfFragment[]=content.items.filter(item=>"str" in item && item.str.trim().length>0).map(item=>({
        text:item.str,x:item.transform[4],y:item.transform[5],width:item.width,
        fontSize:Math.max(1,Math.hypot(item.transform[2],item.transform[3]))
      }));
      analyzed.push(analyzePage(pageNumber,positioned,{width:viewport.width,height:viewport.height}));
      onProgress?.(pageNumber,pdf.numPages);
    }
    const cleaned=removeRunningHeaders(analyzed);
    const pages=cleaned.map(pageToBlocks);
    const wordCount=pages.reduce((sum,p)=>sum+p.blocks.reduce((acc,b)=>acc+b.text.split(/\s+/).length,0),0);
    const autoToc:BookChapter[]=pages.flatMap(p=>p.blocks.filter(b=>b.kind==="heading").map(b=>({
      title:b.text.slice(0,110),page:p.page,blockId:b.id
    }))).slice(0,120);
    const toc:BookChapter[]=[];
    const resolvedPages=new Set<number>();
    try{
      const outline=await pdf.getOutline();
      if(outline?.length){
        const pending=[...outline.map(item=>({item,depth:0}))];
        while(pending.length && toc.length<150){
          const {item,depth}=pending.shift()!;
          if(depth<=2 && item.title && item.dest){
            try{
              const target=typeof item.dest==="string"?await pdf.getDestination(item.dest):item.dest;
              if(Array.isArray(target) && target.length>0){
                const first=target[0] as unknown;
                const index=typeof first==="number"?first:(first && typeof first==="object" && "num" in first
                  ?await pdf.getPageIndex(first as {num:number;gen:number}): -1);
                const pageNumber=index+1;
                if(pageNumber>=1&&pageNumber<=pages.length&&!resolvedPages.has(pageNumber)){
                  resolvedPages.add(pageNumber);
                  toc.push({title:item.title.trim().slice(0,110),page:pageNumber,
                    blockId:pages[pageNumber-1].blocks[0]?.id||`p${pageNumber}-b0`});
                }
              }
            }catch{/* Some outline destinations cannot be resolved. */}
          }
          if(depth<2 && item.items?.length)pending.push(...item.items.map(child=>({item:child,depth:depth+1})));
        }
      }
    }catch{/* No usable PDF outline: keep headings from text. */}
    const index=toc.length>=2 ? toc.sort((a,b)=>a.page-b.page) : autoToc;
    const scanPages=pages.filter(p=>p.blocks.length===0).map(p=>p.page);
    const twoColumnPages=cleaned.filter(p=>p.twoColumns).map(p=>p.page);
    return {
      version:1,totalPages:pages.length,wordCount,pages,toc:index,
      analysis:{
        scannedPages:scanPages,twoColumnPages,
        tocSource:toc.length>=2?"pdf-outline":"detected-headings",
        warnings:scanPages.length?["Một số trang không có văn bản trích xuất được. Dùng PDF gốc để kiểm tra hoặc xử lý OCR."]:[]
      }
    };
  }finally{await pdf.destroy();}
}
