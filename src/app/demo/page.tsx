"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookHeart, BookOpen, Bookmark, Check, ChevronLeft, ChevronRight,
  Cloud, Download, FileText, Focus, Highlighter, LibraryBig, List, LoaderCircle,
  Menu, Minus, Moon, Plus, Search, Globe2, Settings2, StickyNote, Sun, Trash2, UploadCloud, Volume2, Pause, Play, Square, Pencil, X
} from "lucide-react";
import { extractPdf } from "@/lib/pdf";
import { useReadAloud } from "@/hooks/useReadAloud";
import TocEditor from "@/components/TocEditor";
import { exportDemoBackup, importDemoBackup } from "@/lib/backup";
import { deleteDemoBook, getDemoBook, listDemoBooks, saveDemoBook, type DemoBook, type DemoNote } from "@/lib/demo-store";
import type { BookBlock } from "@/lib/types";

type ReaderTheme="cream"|"white"|"dark";
const colors=["#9c766e","#718578","#9c8d6d","#6c8292","#b57e61","#716f8a"];
const blobMax=50*1024*1024;
const slug=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9 _-]/g,"").replace(/\s+/g,"-").slice(0,75)||"ghi-chu";
function exportMarkdown(book:DemoBook){
  const content=[
    `# ${book.title}`,book.author?`Tác giả: ${book.author}`:"","",
    ...[...book.notes].sort((a,b)=>a.page-b.page).flatMap(note=>[
      `## Trang ${note.page}`,"",`> ${note.quote.replace(/\n/g,"\n> ")}`,"",note.content,"","---",""
    ]),
    "## Trang đã đánh dấu",book.bookmarks.slice().sort((a,b)=>a-b).join(", "),""
  ].join("\n");
  const url=URL.createObjectURL(new Blob([content],{type:"text/markdown;charset=utf-8"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=slug(book.title)+".md";anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function DemoApp(){
  const [books,setBooks]=useState<DemoBook[]>([]);
  const [current,setCurrent]=useState<DemoBook|null>(null);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [uploadLabel,setUploadLabel]=useState("");
  const [message,setMessage]=useState("");
  const [page,setPage]=useState(1);
  const [jumpInput,setJumpInput]=useState("1");
  const tts=useReadAloud();
  const [theme,setTheme]=useState<ReaderTheme>("cream");
  const [fontSize,setFontSize]=useState(19);
  const [lineHeight,setLineHeight]=useState(1.85);
  const [view,setView]=useState<"reflow"|"original">("reflow");
  const [leftOpen,setLeftOpen]=useState(true);
  const [rightOpen,setRightOpen]=useState(false);
  const [focus,setFocus]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [search,setSearch]=useState("");
  const [selection,setSelection]=useState<{blockId:string;quote:string;page:number}|null>(null);
  const [draft,setDraft]=useState("");
  const [editingId,setEditingId]=useState<string|null>(null);
  const [tocEditing,setTocEditing]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const restoreRef=useRef<HTMLInputElement>(null);
  const [restoring,setRestoring]=useState(false);
  const [exportingId,setExportingId]=useState<string|null>(null);
  const readerRef=useRef<HTMLElement>(null);
  const activeRef=useRef<DemoBook|null>(null);
  const pdfUrl=useMemo(()=>current?.pdf?URL.createObjectURL(current.pdf):"",[current?.id,current?.pdf]);
  useEffect(()=>()=>{if(pdfUrl)URL.revokeObjectURL(pdfUrl)},[pdfUrl]);
  useEffect(()=>{
    listDemoBooks().then(data=>setBooks(data.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))).catch(()=>setMessage("Không thể truy cập bộ nhớ trình duyệt. Hãy bật IndexedDB để dùng thử.")).finally(()=>setLoading(false));
    try{
      const saved=JSON.parse(localStorage.getItem("docsach-reader-settings")||"{}");
      if(["cream","white","dark"].includes(saved.theme))setTheme(saved.theme);
      if(Number.isInteger(saved.fontSize)&&saved.fontSize>=15&&saved.fontSize<=28)setFontSize(saved.fontSize);
      if(typeof saved.lineHeight==="number"&&saved.lineHeight>=1.4&&saved.lineHeight<=2.4)setLineHeight(saved.lineHeight);
    }catch{}
  },[]);
  useEffect(()=>{localStorage.setItem("docsach-reader-settings",JSON.stringify({theme,fontSize,lineHeight}));},[theme,fontSize,lineHeight]);
  useEffect(()=>{
    if(!current||current===activeRef.current)return;
    const timer=window.setTimeout(()=>saveDemoBook(current).catch(()=>setMessage("Không lưu được thay đổi. Kiểm tra dung lượng bộ nhớ trình duyệt.")),500);
    return ()=>window.clearTimeout(timer);
  },[current]);
  useEffect(()=>{
    const listener=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(event.key==="Escape"){setSearchOpen(false);setFocus(false);setSelection(null);return;}
      if(target.matches("input, textarea") || !current || event.ctrlKey || event.metaKey)return;
      if(event.key.toLowerCase()==="f"&&!event.altKey)setFocus(prev=>!prev);
      if(event.key==="/"){event.preventDefault();setSearchOpen(true);}
      if(event.key==="ArrowRight"&&event.altKey)turnTo(page+1);
      if(event.key==="ArrowLeft"&&event.altKey)turnTo(page-1);
    };
    window.addEventListener("keydown",listener);return()=>window.removeEventListener("keydown",listener);
  });
  const blocks=useMemo(()=>current?.document?.pages.find(p=>p.page===page)?.blocks||[],[current,page]);
  useEffect(()=>setJumpInput(String(page)),[page]);
  useEffect(()=>{
    if(tts.activeId && view==="reflow")document.getElementById("demo-"+tts.activeId)?.scrollIntoView({behavior:"smooth",block:"center"});
  },[tts.activeId,view]);
  const searchMatches=useMemo(()=>{
    if(!current?.document||search.trim().length<2)return [];
    const q=search.toLocaleLowerCase("vi");const matches:{page:number;blockId:string;preview:string}[]=[];
    for(const chapter of current.document.pages)for(const block of chapter.blocks){
      const index=block.text.toLocaleLowerCase("vi").indexOf(q);if(index<0)continue;
      matches.push({page:chapter.page,blockId:block.id,preview:block.text.slice(Math.max(index-55,0),index+q.length+110)});
      if(matches.length>=120)return matches;
    }
    return matches;
  },[search,current?.document]);
  function turnTo(value:number,blockId?:string){
    if(!current)return;
    tts.stop();
    const max=current.document?.totalPages||Math.max(page,1);
    const target=Math.min(Math.max(1,value),max);
    setPage(target);setJumpInput(String(target));setCurrent({...current,page:target});
    readerRef.current?.scrollTo({top:0,behavior:"smooth"});
    if(blockId)setTimeout(()=>document.getElementById("demo-"+blockId)?.scrollIntoView({behavior:"smooth",block:"center"}),80);
  }
  function openBook(book:DemoBook){
    tts.stop();
    setCurrent(book);activeRef.current=book;setPage(book.page||1);setRightOpen(false);setSearch("");setSearchOpen(false);setFocus(false);setLeftOpen(window.innerWidth>=800);
    setView(book.document?.wordCount?"reflow":"original");
  }
  async function onFile(file:File|undefined){
    if(!file)return;
    if(!file.name.toLowerCase().endsWith(".pdf")||file.size>blobMax){setMessage("Chỉ hỗ trợ PDF tối đa 50MB.");return;}
    setUploading(true);setMessage("");
    setUploadLabel("Đang đọc nội dung sách…");
    try{
      let parsed=null;
      try{parsed=await extractPdf(file,(index,total)=>setUploadLabel(`Đang xử lý trang ${index}/${total}…`));}
      catch(error){console.warn("Could not extract PDF text, using original view",error);}
      const book:DemoBook={id:crypto.randomUUID(),title:file.name.replace(/\.pdf$/i,"").replace(/[_-]/g," "),author:"",createdAt:new Date().toISOString(),pdf:file,document:parsed,page:1,bookmarks:[],notes:[]};
      setUploadLabel("Đang lưu vào bộ nhớ thiết bị…");
      await saveDemoBook(book);
      setBooks(previous=>[book,...previous]);openBook(book);
    }catch(error){setMessage(error instanceof Error?error.message:"Không đọc được PDF. Vui lòng thử lại.");}
    finally{setUploading(false);setUploadLabel("");if(fileRef.current)fileRef.current.value="";}
  }
  async function saveBackup(book:DemoBook){
    setMessage("");setExportingId(book.id);
    try{await exportDemoBackup(book);}catch(error){setMessage(error instanceof Error?error.message:"Không thể tạo bản sao lưu.");}
    finally{setExportingId(null);}
  }
  async function restoreBackup(file:File|undefined){
    if(!file)return;
    setRestoring(true);setMessage("");
    try{
      const book=await importDemoBackup(file);
      await saveDemoBook(book);
      setBooks(previous=>[book,...previous]);
      setMessage("Đã khôi phục sách, highlight, ghi chú và tiến độ đọc từ bản sao lưu.");
    }catch(error){setMessage(error instanceof Error?error.message:"Không thể khôi phục bản sao lưu.");}
    finally{setRestoring(false);if(restoreRef.current)restoreRef.current.value="";}
  }
  async function removeBook(book:DemoBook){
    if(!confirm(`Xóa “${book.title}” khỏi bộ nhớ trình duyệt này?`))return;
    try{await deleteDemoBook(book.id);setBooks(previous=>previous.filter(item=>item.id!==book.id));}
    catch{setMessage("Không thể xóa sách lúc này.");}
  }
  function goBack(){
    tts.stop();
    if(current){saveDemoBook(current).catch(()=>{});setBooks(previous=>previous.map(book=>book.id===current.id?current:book));}
    setCurrent(null);setSelection(null);setFocus(false);
  }
  async function updateTableOfContents(updated:NonNullable<DemoBook["document"]>){
    if(!current)throw new Error("Chưa mở cuốn sách nào.");
    const changed={...current,document:updated};
    await saveDemoBook(changed);
    setCurrent(changed);
    setBooks(previous=>previous.map(item=>item.id===changed.id?changed:item));
  }
  function capture(){
    const s=window.getSelection();const quote=s?.toString().replace(/\s+/g," ").trim()||"";
    if(!s||quote.length<2||quote.length>1500)return;
    const first=s.anchorNode?.parentElement?.closest<HTMLElement>("[data-demo-block]");
    const last=s.focusNode?.parentElement?.closest<HTMLElement>("[data-demo-block]");
    if(first&&first===last)setSelection({blockId:first.dataset.demoBlock||"",quote,page});
  }
  function highlight(color:DemoNote["color"]){
    if(!current||!selection)return;
    const note:DemoNote={id:crypto.randomUUID(),blockId:selection.blockId,page,quote:selection.quote,content:"",color,createdAt:new Date().toISOString()};
    setCurrent({...current,notes:[...current.notes,note]});
    setEditingId(note.id);setDraft("");setRightOpen(true);setSelection(null);window.getSelection()?.removeAllRanges();
  }
  function saveNote(id:string,text:string){
    if(!current)return;
    setCurrent({...current,notes:current.notes.map(n=>n.id===id?{...n,content:text}:n)});
  }
  function renderText(block:BookBlock){
    if(!current)return block.text;
    const sorted=current.notes.filter(n=>n.blockId===block.id&&n.quote)
      .map(note=>({note,index:block.text.indexOf(note.quote)})).filter(item=>item.index>=0).sort((a,b)=>a.index-b.index);
    let cursor=0;const nodes:React.ReactNode[]=[];
    for(const {note,index} of sorted){
      if(index<cursor)continue;
      if(index>cursor)nodes.push(block.text.slice(cursor,index));
      nodes.push(<mark key={note.id} className={`highlight-${note.color}`} title={note.content||"Xem ghi chú"} onClick={()=>{
        setRightOpen(true);setEditingId(note.id);setDraft(note.content);
      }}>{note.quote}</mark>);
      cursor=index+note.quote.length;
    }
    if(cursor<block.text.length)nodes.push(block.text.slice(cursor));
    return nodes.length?nodes:block.text;
  }
  const toc=current?.document?.toc||[];
  if(loading)return <div className="loading-screen"><div className="loader"/><p>Đang mở thư viện thử nghiệm…</p></div>;
  if(!current)return <div className="demo-home">
    <header className="demo-home-nav"><div className="brand"><span className="brand-symbol"><BookHeart size={22}/></span>DocSach<span className="brand-light">WithMe</span></div><div className="demo-nav-actions"><a className="demo-discover-link" href="/discover"><Globe2 size={16}/> Khám phá sách miễn phí</a><span className="demo-badge">LOCAL PREVIEW</span></div></header>
    <main className="demo-home-main"><div className="demo-home-hero"><span className="eyebrow">YOUR READING STUDIO</span><h1>Đọc sâu hơn. <em>Ghi nhớ lâu hơn.</em></h1><p>Thử ngay trình đọc ebook, highlight và ghi chú mà không cần tài khoản. Sách của bạn chỉ nằm trên thiết bị này.</p>
      <div className="demo-hero-buttons">
        <button className="primary-button" disabled={uploading||restoring} onClick={()=>fileRef.current?.click()}><UploadCloud size={18}/>{uploading?uploadLabel:"Thêm sách PDF"}</button>
        <button className="outline-button" disabled={restoring||uploading} onClick={()=>restoreRef.current?.click()}><Download size={17}/>{restoring?"Đang khôi phục…":"Khôi phục sao lưu"}</button>
      </div>
      <input type="file" accept=".zip,.dswm.zip,application/zip" hidden ref={restoreRef} onChange={e=>restoreBackup(e.target.files?.[0])}/>
      <input type="file" accept=".pdf,application/pdf" hidden ref={fileRef} onChange={e=>onFile(e.target.files?.[0])}/></div>
      {message&&<p className="error-banner">{message}</p>}
      <div className="demo-library-title"><h2>Kệ sách trên thiết bị</h2><span>{books.length} cuốn</span></div>
      {books.length?<div className="demo-books">{books.map((book,index)=><div className="demo-book" key={book.id}>
        <button className="demo-book-action" onClick={()=>openBook(book)}><div className="demo-book-cover" style={{background:colors[index%colors.length]}}><BookOpen size={30}/><span>{book.title}</span><small>DOCSACHWITHME</small></div><strong>{book.title}</strong><small>{book.document?.totalPages||"PDF"} trang · đang ở trang {book.page||1}</small></button>
        <div className="demo-book-actions">
          <button title="Sao lưu cả PDF, tiến độ, highlight và ghi chú" disabled={exportingId===book.id} onClick={()=>saveBackup(book)}><Download size={16}/></button>
          <button title="Xóa sách khỏi thiết bị" onClick={()=>removeBook(book)}><Trash2 size={16}/></button>
        </div>
      </div>)}</div>:<div className="demo-empty"><BookOpen size={32}/><h3>Kệ sách đang trống</h3><p>Hãy thêm một cuốn PDF để bắt đầu đọc.</p></div>}
      <p className="demo-privacy"><Cloud size={15}/> Bản thử lưu trên trình duyệt và không đồng bộ cloud. Hãy tải bản sao lưu ZIP để chuyển sách và ghi chú sang thiết bị khác hoặc phòng khi xóa dữ liệu trình duyệt.</p>
    </main>
  </div>;

  return <div className={`reader-shell reader-theme-${theme} demo-reader ${focus?"reader-focus":""}`}>
    <header className="reader-topbar">
      <div className="reader-top-left"><button className="icon-button" title="Về thư viện" onClick={goBack}><ArrowLeft size={19}/></button><button className="icon-button" title="Mục lục" onClick={()=>setLeftOpen(!leftOpen)}><Menu size={19}/></button><div className="reader-book-identity"><strong>{current.title}</strong><span>Thư viện thử trên thiết bị</span></div></div>
      <div className="reader-top-mid"><div className="reader-view-switch"><button className={view==="reflow"?"selected":""} onClick={()=>setView("reflow")} disabled={!current.document?.wordCount}><BookOpen size={15}/> Ebook</button><button className={view==="original"?"selected":""} onClick={()=>setView("original")}><FileText size={15}/> PDF</button></div></div>
      <div className="reader-top-right">
        <button className="icon-button" title="Tìm từ trong sách (/)" onClick={()=>{setSearchOpen(true);setFocus(false)}} disabled={!current.document?.wordCount}><Search size={18}/></button>
        <button className="icon-button" title="Tập trung (F)" onClick={()=>setFocus(!focus)}><Focus size={18}/></button>
        <button className="icon-button" title="Nghe đọc trang hiện tại" disabled={!current.document?.wordCount || !tts.available} onClick={()=>tts.state==="idle"?tts.play(blocks.map(block=>({id:block.id,text:block.text}))):tts.pauseOrResume()}>{tts.state==="playing"?<Pause size={18}/>:<Volume2 size={18}/>}</button>
        <button className={`icon-button ${current.bookmarks.includes(page)?"is-bookmarked":""}`} title="Đánh dấu trang" onClick={()=>setCurrent({...current,bookmarks:current.bookmarks.includes(page)?current.bookmarks.filter(n=>n!==page):[...current.bookmarks,page]})}><Bookmark size={18} fill={current.bookmarks.includes(page)?"currentColor":"none"}/></button>
        <button className="icon-button" title="Ghi chú" onClick={()=>setRightOpen(!rightOpen)}><StickyNote size={18}/></button>
      </div>
    </header>
    {focus&&<button className="focus-exit" onClick={()=>setFocus(false)}>Thoát tập trung (Esc)</button>}
    <div className="reader-body">
      {leftOpen&&<aside className="reader-left demo-nav-side">
        <div className="pane-top"><span className="eyebrow">BOOK NAVIGATOR</span><button className="icon-button small mobile-close" onClick={()=>setLeftOpen(false)}><X size={15}/></button></div>
        <div className="toc-heading"><List size={17}/><strong>Mục lục</strong><button className="toc-editor-trigger" title="Chỉnh sửa tên và trang bắt đầu của chương" disabled={!current.document?.wordCount} onClick={()=>setTocEditing(true)}><Pencil size={15}/></button></div>
        <div className="toc-list">{toc.length?toc.map((section,index)=><button key={index} className={page===section.page?"selected":""} onClick={()=>{turnTo(section.page,section.blockId);if(window.innerWidth<800)setLeftOpen(false)}}><span>{String(index+1).padStart(2,"0")}</span><span>{section.title}</span></button>):<p className="empty-side-text">Chưa nhận dạng được tên chương. Bạn vẫn có thể chuyển từng trang.</p>}</div>
        <div className="bookmarks-area"><div className="toc-heading"><Bookmark size={17}/><strong>Trang lưu</strong></div>
          {current.bookmarks.slice().sort((a,b)=>a-b).map(value=><button className="bookmark-entry" key={value} onClick={()=>turnTo(value)}>Trang {value}<ChevronRight size={14}/></button>)}</div>
        {Boolean(current.document?.analysis?.scannedPages.length) && <p className="pdf-quality-tip">Có {current.document?.analysis?.scannedPages.length} trang không có văn bản. Chế độ PDF gốc giữ nguyên hình ảnh và bố cục.</p>}
        <div className="reading-stat"><span>TIẾN ĐỘ</span><div className="stat-percent"><strong>{Math.round((page-1)/Math.max(current.document?.totalPages||page,1)*100)}%</strong><small>{page}/{current.document?.totalPages||"?"} trang</small></div><div className="progress-track"><span style={{width:`${Math.round((page-1)/Math.max(current.document?.totalPages||page,1)*100)}%`}}/></div></div>
      </aside>}
      <main className="reader-content" ref={readerRef}>
        {searchOpen&&<div className="book-search"><div className="book-search-head"><Search size={17}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm nội dung trong sách…"/><button className="icon-button small" onClick={()=>setSearchOpen(false)}><X size={16}/></button></div><div className="book-search-results">{search.length<2?<p>Nhập tối thiểu 2 ký tự.</p>:searchMatches.length?searchMatches.map(hit=><button key={hit.blockId} onClick={()=>{setView("reflow");turnTo(hit.page,hit.blockId);setSearchOpen(false)}}><span>Trang {hit.page}</span><p>{hit.preview}</p></button>):<p>Không tìm thấy nội dung phù hợp.</p>}</div></div>}
        {view==="original"?<div className="original-reader"><div className="original-notice"><FileText size={16}/> Bản PDF gốc · Mở ebook để highlight và đổi typography.</div><iframe className="pdf-iframe" src={pdfUrl+`#page=${page}`} title={current.title}/></div>:
        <div className="reflow-container" onMouseUp={capture}>
          <div className="reflow-overline">DOCSACHWITHME <span>✳</span> YOUR PRIVATE READING EDITION</div>
          <div className="chapter-top"><span className="eyebrow">TRANG {String(page).padStart(2,"0")} / {current.document?.totalPages||"?"}</span><h1>{toc.find(item=>item.page<=page)?.title||current.title}</h1><div className="chapter-deco"><span/>✦<span/></div></div>
          <article className="reader-article" style={{fontSize:`${fontSize}px`,lineHeight}}>
            {blocks.length?blocks.map(block=>block.kind==="heading"?<h2 className={`reading-heading ${tts.activeId===block.id?"reading-audio-active":""}`} id={"demo-"+block.id} key={block.id} data-demo-block={block.id}>{renderText(block)}</h2>:<p className={`reading-paragraph ${tts.activeId===block.id?"reading-audio-active":""}`} id={"demo-"+block.id} key={block.id} data-demo-block={block.id}>{renderText(block)}</p>):<div className="demo-empty-page"><FileText size={26}/><p>Trang này không có văn bản được trích xuất. Hãy chuyển sang PDF gốc để xem đầy đủ.</p></div>}
          </article>
          <div className="chapter-end"><div>✳</div><span>Trang {page}</span><div className="chapter-navigation"><button className="outline-button" disabled={page<=1} onClick={()=>turnTo(page-1)}><ChevronLeft size={16}/> Trang trước</button><button className="primary-button" disabled={page>=(current.document?.totalPages||1)} onClick={()=>turnTo(page+1)}>Trang tiếp <ChevronRight size={16}/></button></div></div>
        </div>}
      </main>
      {rightOpen&&<aside className="reader-right demo-notes-side"><div className="right-panel-tabs"><button className="active"><StickyNote size={16}/> Ghi chú ({current.notes.length})</button><button className="icon-button small" onClick={()=>setRightOpen(false)}><X size={16}/></button></div>
        <div className="notes-pane"><div className="right-pane-intro"><h3>Những điều muốn nhớ.</h3><p>Bôi đen một đoạn để thêm highlight và ghi chú, lưu ngay trên thiết bị.</p>
          <button className="export-notes" disabled={!current.notes.length&&!current.bookmarks.length} onClick={()=>exportMarkdown(current)}><Download size={15}/> Xuất Markdown</button>
        </div>
          {current.notes.length?<div className="note-list">{[...current.notes].reverse().map(note=><div key={note.id} className="note-item">
            <button className="note-quote" onClick={()=>{turnTo(note.page,note.blockId);setEditingId(note.id);setDraft(note.content)}}><span className={`note-dot ${note.color}`}/>“{note.quote.slice(0,180)}{note.quote.length>180?"…":""}”</button>
            {editingId===note.id?<div className="note-editor"><textarea rows={4} placeholder="Viết suy nghĩ của bạn…" value={draft} onChange={e=>setDraft(e.target.value)}/><div><button onClick={()=>{saveNote(note.id,draft);setEditingId(null)}}><Check size={14}/> Lưu</button><button title="Xóa" onClick={()=>setCurrent({...current,notes:current.notes.filter(item=>item.id!==note.id)})}><Trash2 size={15}/></button></div></div>:<button className="demo-note-edit" onClick={()=>{setEditingId(note.id);setDraft(note.content)}}>{note.content||"Thêm suy nghĩ…"}</button>}
          </div>)}</div>:<div className="notes-empty"><Highlighter size={27}/><strong>Chưa có ghi chú</strong><p>Chọn một câu hoặc đoạn văn để lưu lại.</p></div>}
        </div>
      </aside>}
    </div>
    <div className="demo-bottom-bar"><div className="demo-bottom-counter"><button disabled={page<=1} onClick={()=>turnTo(page-1)}><ChevronLeft size={18}/></button><span>Trang</span><input type="number" min={1} max={current.document?.totalPages||undefined} aria-label="Nhập số trang" value={jumpInput} onChange={event=>setJumpInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter")turnTo(Number(jumpInput)||1)}} onBlur={()=>setJumpInput(String(page))}/><span>/ {current.document?.totalPages||"?"}</span><button disabled={page>=(current.document?.totalPages||1)} onClick={()=>turnTo(page+1)}><ChevronRight size={18}/></button></div>
      <div className="demo-settings"><button title="Giảm cỡ chữ" onClick={()=>setFontSize(Math.max(15,fontSize-1))}><Minus size={14}/></button><span>{fontSize}px</span><button title="Tăng cỡ chữ" onClick={()=>setFontSize(Math.min(28,fontSize+1))}><Plus size={14}/></button><button title="Đổi màu nền" onClick={()=>setTheme(theme==="cream"?"white":theme==="white"?"dark":"cream")}>{theme==="dark"?<Moon size={17}/>:<Sun size={17}/>}</button><button title="Giãn dòng" onClick={()=>setLineHeight(lineHeight>2.1?1.5:lineHeight+.2)}><Settings2 size={17}/></button></div>
    </div>
    {tts.state!=="idle"&&<div className="read-aloud-controls demo-audio-controls"><Volume2 size={17}/><span>Nghe trang {page}</span><select aria-label="Tốc độ đọc" value={tts.speed} onChange={e=>tts.updateSpeed(Number(e.target.value))}><option value={0.8}>0.8×</option><option value={1}>1×</option><option value={1.2}>1.2×</option><option value={1.5}>1.5×</option></select><button onClick={tts.pauseOrResume} title="Tạm dừng hoặc tiếp tục">{tts.state==="playing"?<Pause size={17}/>:<Play size={17}/>}</button><button onClick={tts.stop} title="Dừng đọc"><Square size={16}/></button></div>}
    {tocEditing&&current.document&&<TocEditor document={current.document} onSave={updateTableOfContents} onClose={()=>setTocEditing(false)}/>}
    {selection&&<div className="selection-toolbar"><span><Highlighter size={15}/> Highlight</span>{(["yellow","green","pink"] as const).map(color=><button key={color} title={color} className={`color-dot ${color}`} onClick={()=>highlight(color)}/>)}<button onClick={()=>setSelection(null)}><X size={15}/></button></div>}
  </div>;
}
export default function DemoPage(){return <DemoApp/>;}
