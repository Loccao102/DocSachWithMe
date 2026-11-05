import type { BookBlock, BookDocument } from "./types";

const MAX_PAGES_PER_RUN = 8;
const MIN_USEFUL_CHARS = 32;

/** Only scan pages with no (or almost no) extractable text. */
export function ocrCandidatePages(document: BookDocument): number[] {
  return document.pages.filter(page =>
    page.blocks.map(block => block.text).join(" ").trim().length < MIN_USEFUL_CHARS
  ).map(page => page.page);
}

/** Rotate over missing-text pages so blank/illegible scans cannot block later pages. */
export function nextOcrBatch(document:BookDocument,afterPage=0,limit=8):number[]{
  const missing=ocrCandidatePages(document);
  const count=Math.min(8,Math.max(1,Number.isInteger(limit)?limit:8));
  const cursor=Number.isFinite(afterPage)?afterPage:0;
  return [...missing.filter(page=>page>cursor),...missing.filter(page=>page<=cursor)].slice(0,count);
}

/** Keep original page anchors and preserve any manually edited table of contents. */
export function addOcrPage(document: BookDocument, pageNumber: number, rawText: string): BookDocument {
  const page = document.pages.find(item => item.page === pageNumber);
  if (!page) throw new Error("Trang OCR không tồn tại trong sách.");
  const text = rawText.replace(/\r/g, "").trim();
  if (text.length < 6) return document;
  const paragraphs = text.split(/\n\s*\n/).flatMap(value =>
    value.length > 1600 ? value.match(/.{1,1400}(?:\s|$)/g) ?? [value] : [value]
  ).map(value => value.replace(/\s+/g, " ").trim()).filter(Boolean);
  const blocks: BookBlock[] = paragraphs.slice(0, 150).map((value, index) => ({
    id: "p" + pageNumber + "-ocr" + index,
    page: pageNumber, kind: "paragraph", text: value.slice(0, 1600)
  }));
  const oldLength = page.blocks.reduce((sum, block) => sum + block.text.split(/\s+/).filter(Boolean).length, 0);
  const newLength = blocks.reduce((sum, block) => sum + block.text.split(/\s+/).filter(Boolean).length, 0);
  if (newLength <= oldLength) return document;
  const pages = document.pages.map(part =>
    part.page === pageNumber ? { ...part, blocks } : part
  );
  const scannedPages = pages.filter(part =>
    part.blocks.map(block => block.text).join(" ").trim().length < MIN_USEFUL_CHARS
  ).map(part => part.page);
  return {
    ...document, pages,
    wordCount: document.wordCount - oldLength + newLength,
    analysis: {
      scannedPages,
      twoColumnPages: document.analysis?.twoColumnPages ?? [],
      tocSource: document.analysis?.tocSource ?? "detected-headings",
      warnings: scannedPages.length
        ? ["Một số trang vẫn thiếu văn bản. Bạn có thể tiếp tục OCR hoặc xem PDF gốc."]
        : []
    }
  };
}


/** Generate a safe reader skeleton when PDF text extraction failed on upload. */
export function emptyOcrDocument(totalPages:number):BookDocument {
  if(!Number.isInteger(totalPages)||totalPages<1||totalPages>5000)
    throw new Error("Không thể xác định số trang hợp lệ cho OCR.");
  return {
    version:1,totalPages,wordCount:0,toc:[],
    pages:Array.from({length:totalPages},(_,i)=>({page:i+1,blocks:[]})),
    analysis:{
      scannedPages:Array.from({length:totalPages},(_,i)=>i+1),
      twoColumnPages:[],tocSource:"detected-headings",
      warnings:["PDF chưa có văn bản; hãy dùng OCR để nhận dạng từng nhóm trang."]
    }
  };
}

/**
 * Preserve the latest cloud table of contents and paragraphs, copying only
 * newly recognized OCR pages that are still empty in cloud. This reduces
 * accidental data loss when another device saved book metadata meanwhile.
 */
export function mergeOcrDocuments(latest:BookDocument|null,incoming:BookDocument):BookDocument {
  if(!latest)return incoming;
  if(latest.totalPages!==incoming.totalPages)
    throw new Error("Số trang trên cloud đã thay đổi. Hãy tải lại sách trước khi OCR.");
  const byPage=new Map(incoming.pages.map(part=>[part.page,part]));
  const pages=latest.pages.map(page=>{
    const candidate=byPage.get(page.page);
    if(!candidate||!candidate.blocks.some(block=>/^p\d+-ocr\d+$/.test(block.id)))return page;
    // Existing cloud OCR may already anchor highlights and notes.
    if(page.blocks.some(block=>/^p\d+-ocr\d+$/.test(block.id)))return page;
    const currentLength=page.blocks.map(block=>block.text).join(" ").trim().length;
    const incomingLength=candidate.blocks.map(block=>block.text).join(" ").trim().length;
    if(currentLength>=32||incomingLength<=currentLength)return page;
    return {...page,blocks:candidate.blocks};
  });
  const wordCount=pages.reduce((sum,part)=>sum+part.blocks.reduce(
    (count,block)=>count+block.text.split(/\s+/).filter(Boolean).length,0
  ),0);
  const scannedPages=pages.filter(page=>page.blocks.map(block=>block.text).join(" ").trim().length<32)
    .map(page=>page.page);
  return {...latest,pages,wordCount,analysis:{
    scannedPages,
    twoColumnPages:latest.analysis?.twoColumnPages??[],
    tocSource:latest.analysis?.tocSource??"detected-headings",
    warnings:scannedPages.length?["Một số trang vẫn cần nhận dạng OCR."]:[]
  }};
}

/**
 * Browser-only, opt-in OCR. pdf.js renders local pages to a canvas and
 * Tesseract recognizes that canvas. No book pages are uploaded to an OCR API.
 * Language model files may be downloaded on first use.
 */
export async function ocrLocalPdf(
  file: Blob, original: BookDocument | null,
  onProgress?: (done: number, total: number, label: string) => void,
  afterPage=0
): Promise<{ document: BookDocument; recognized: number; attempted: number; lastAttemptedPage: number }> {
  if (typeof document === "undefined") throw new Error("OCR chỉ chạy trong trình duyệt.");
  const pdfjs=await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/build/pdf.worker.min.mjs",import.meta.url).toString();
  const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
  try{
    const source=original??emptyOcrDocument(pdf.numPages);
    if(source.totalPages!==pdf.numPages)
      throw new Error("Số trang PDF không khớp với nội dung đã lưu; không thể tiếp tục OCR.");
    const candidates=nextOcrBatch(source,afterPage,MAX_PAGES_PER_RUN);
    if(!candidates.length)return {document:source,recognized:0,attempted:0,lastAttemptedPage:afterPage};
    const {createWorker}=await import("tesseract.js");
    let worker:Awaited<ReturnType<typeof createWorker>>|undefined;
    let result=source;
    let recognized=0;
    try{
      onProgress?.(0,candidates.length,"Đang tải bộ nhận dạng tiếng Việt và tiếng Anh…");
      worker=await createWorker(["vie","eng"]);
      for(const [index,pageNumber] of candidates.entries()){
        onProgress?.(index,candidates.length,"Đang nhận dạng trang "+pageNumber+"…");
        const page=await pdf.getPage(pageNumber);
        try{
          const base=page.getViewport({scale:1});
          const scale=Math.min(1.8,2000/Math.max(base.width,base.height));
          const viewport=page.getViewport({scale});
          const canvas=window.document.createElement("canvas");
          canvas.width=Math.ceil(viewport.width);
          canvas.height=Math.ceil(viewport.height);
          const context=canvas.getContext("2d",{willReadFrequently:true});
          if(!context)throw new Error("Trình duyệt không hỗ trợ Canvas để nhận dạng OCR.");
          try{
            await page.render({canvas,canvasContext:context,viewport}).promise;
            const recognition=await worker.recognize(canvas);
            const next=addOcrPage(result,pageNumber,recognition.data.text||"");
            if(next!==result)recognized++;
            result=next;
          }finally{
            canvas.width=0;
            canvas.height=0;
          }
        }finally{page.cleanup();}
        onProgress?.(index+1,candidates.length,"Đã xử lý "+(index+1)+"/"+candidates.length+" trang");
      }
      return {document:result,recognized,attempted:candidates.length,lastAttemptedPage:candidates[candidates.length-1]};
    }finally{await worker?.terminate();}
  }finally{await pdf.destroy();}
}
