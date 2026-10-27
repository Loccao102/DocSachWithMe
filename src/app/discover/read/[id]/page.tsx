"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Bookmark, Check, ChevronLeft, ChevronRight, Download, ExternalLink, Focus, Highlighter, LibraryBig, List, LoaderCircle, Menu, Minus, Moon, Plus, Search, Settings2, Square, StickyNote, Sun, Trash2, Volume2, Pause, Play, X } from "lucide-react";
import type { BookBlock, BookDocument } from "@/lib/types";
import type { GutenbergBook, PublicNote, SavedPublicBook } from "@/lib/free-books";
import { coverUrl, gutenbergPage } from "@/lib/free-books";
import { getPublicBook, putPublicBook } from "@/lib/public-library";
import { useReadAloud } from "@/hooks/useReadAloud";

type ReadingTheme="cream"|"white"|"dark";
type Selection={blockId:string;quote:string;page:number};

export default function PublicBookReader(){
  const params=useParams();
  const bookId=Number(params.id);
  const [book,setBook]=useState<SavedPublicBook|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [page,setPage]=useState(1);
  const [theme,setTheme]=useState<ReadingTheme>("cream");
  const [fontSize,setFontSize]=useState(19);
  const [lineHeight,setLineHeight]=useState(1.9);
  const [leftOpen,setLeftOpen]=useState(true);
  const [rightOpen,setRightOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [search,setSearch]=useState("");
  const [focus,setFocus]=useState(false);
  const [selection,setSelection]=useState<Selection|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [draft,setDraft]=useState("");
  const [saveError,setSaveError]=useState("");
  const [ready,setReady]=useState(false);
  const pageRoot=useRef<HTMLDivElement>(null);
  const tts=useReadAloud();
  const savedRef=useRef<number|null>(null);

  useEffect(()=>{
    try{
      const settings=JSON.parse(localStorage.getItem("docsach-reader-settings")||"{}");
      if(["cream","white","dark"].includes(settings.theme))setTheme(settings.theme);
      if(Number.isInteger(settings.fontSize)&&settings.fontSize>=15&&settings.fontSize<=28)setFontSize(settings.fontSize);
      if(typeof settings.lineHeight==="number"&&settings.lineHeight>=1.4&&settings.lineHeight<=2.4)setLineHeight(settings.lineHeight);
    }catch{}
  },[]);
  useEffect(()=>{localStorage.setItem("docsach-reader-settings",JSON.stringify({theme,fontSize,lineHeight}));},[theme,fontSize,lineHeight]);

  useEffect(()=>{
    let live=true;
    async function load(){
      try{
        if(!Number.isInteger(bookId)||bookId<=0)throw new Error("Mã sách không hợp lệ.");
        const local=await getPublicBook(bookId);
        if(!live)return;
        if(local){setBook(local);setPage(local.page);savedRef.current=local.id;return;}
        // Fetch text only when the reader was opened explicitly. No bulk downloads.
        const response=await fetch(`/api/free-books/${bookId}?mode=read`,{cache:"no-store"});
        const payload=await response.json() as {error?:string;book:GutenbergBook;document:BookDocument};
        if(!response.ok)throw new Error(payload.error||"Không đọc được sách.");
        if(!payload.document?.pages?.length)throw new Error("Sách chưa có văn bản để đọc.");
        const metadata=payload.book;
        const item:SavedPublicBook={
          id:metadata.id,title:metadata.title,
          author:metadata.authors.map(a=>a.name).join(", ")||"Không rõ tác giả",
          cover:coverUrl(metadata),
          language:metadata.languages[0]||"en",
          updatedAt:new Date().toISOString(),page:1,notes:[],bookmarks:[],
          document:payload.document
        };
        await putPublicBook(item);
        if(live){setBook(item);setPage(1);savedRef.current=item.id;}
      }catch(ex){if(live)setError(ex instanceof Error?ex.message:"Không thể mở sách.");}
      finally{if(live){setLoading(false);setReady(true);}}
    }
    load();
    return()=>{live=false;};
  },[bookId]);

  useEffect(()=>{
    if(!book||!ready)return;
    const timer=window.setTimeout(()=>{
      putPublicBook(book).catch(()=>setSaveError("Không lưu được dữ liệu đọc. Kiểm tra dung lượng bộ nhớ trình duyệt."));
    },400);
    return()=>window.clearTimeout(timer);
  },[book,ready]);

  const blocks=useMemo(()=>book?.document.pages.find(entry=>entry.page===page)?.blocks||[],[book?.document,page]);
  const toc=book?.document.toc||[];
  const totalPages=book?.document.totalPages||1;
  const progress=Math.max(0,Math.round((page-1)/Math.max(1,totalPages)*100));
  const pageTitle=useMemo(()=>{
    const headings=toc.filter(entry=>entry.page<=page);
    return headings.length?headings[headings.length-1].title:book?.title||"";
  },[toc,page,book?.title]);
  const searchMatches=useMemo(()=>{
    if(!book||search.trim().length<2)return [];
    const needle=search.toLocaleLowerCase(book.language==="vi"?"vi":"en");
    const matches:{page:number;blockId:string;preview:string}[]=[];
    for(const p of book.document.pages)for(const block of p.blocks){
      const index=block.text.toLocaleLowerCase().indexOf(needle);
      if(index<0)continue;
      matches.push({page:p.page,blockId:block.id,preview:block.text.slice(Math.max(0,index-55),index+needle.length+110)});
      if(matches.length>=100)return matches;
    }
    return matches;
  },[book?.document,book?.language,search]);

  function updateBook(change:Partial<SavedPublicBook>){
    setBook(old=>old?{...old,...change,updatedAt:new Date().toISOString()}:old);
  }
  function goTo(next:number,blockId?:string){
    tts.stop();
    const safe=Math.max(1,Math.min(totalPages,next));
    setPage(safe);updateBook({page:safe});
    pageRoot.current?.scrollTo({top:0,behavior:"smooth"});
    if(blockId)window.setTimeout(()=>document.getElementById("free-"+blockId)?.scrollIntoView({block:"center",behavior:"smooth"}),70);
  }
  function capture(){
    const selected=window.getSelection(),quote=selected?.toString().replace(/\s+/g," ").trim()||"";
    if(!selected||quote.length<2||quote.length>1700)return;
    const first=selected.anchorNode?.parentElement?.closest<HTMLElement>("[data-reading-block]");
    const last=selected.focusNode?.parentElement?.closest<HTMLElement>("[data-reading-block]");
    if(first&&first===last)setSelection({blockId:first.dataset.readingBlock||"",quote,page});
  }
  function highlight(color:PublicNote["color"]){
    if(!book||!selection)return;
    const note:PublicNote={id:crypto.randomUUID(),blockId:selection.blockId,quote:selection.quote,page:selection.page,color,content:"",createdAt:new Date().toISOString()};
    updateBook({notes:[...book.notes,note]});
    setRightOpen(true);setEditingId(note.id);setDraft("");setSelection(null);
    window.getSelection()?.removeAllRanges();
  }
  function writeNote(note:PublicNote,content:string){
    if(!book)return;
    updateBook({notes:book.notes.map(existing=>existing.id===note.id?{...existing,content}:existing)});
  }
  function renderText(block:BookBlock){
    if(!book)return block.text;
    const highlights=book.notes.filter(item=>item.blockId===block.id&&item.quote)
      .map(item=>({item,index:block.text.indexOf(item.quote)})).filter(x=>x.index>=0).sort((a,b)=>a.index-b.index);
    let cursor=0;const output:React.ReactNode[]=[];
    for(const {item,index} of highlights){
      if(index<cursor)continue;
      if(index>cursor)output.push(block.text.slice(cursor,index));
      output.push(<mark key={item.id} className={`highlight-${item.color}`} title={item.content||"Xem ghi chú"}
        onClick={()=>{setRightOpen(true);setEditingId(item.id);setDraft(item.content);}}>{item.quote}</mark>);
      cursor=index+item.quote.length;
    }
    if(cursor<block.text.length)output.push(block.text.slice(cursor));
    return output.length?output:block.text;
  }
  function exportNotes(){
    if(!book)return;
    const lines=[`# ${book.title}`,"",`**Tác giả:** ${book.author}`,"",...book.notes.slice().sort((a,b)=>a.page-b.page)
      .flatMap(note=>[`## Trang ${note.page}`,"",`> ${note.quote}`,"",note.content,"","---",""]),"## Bookmark",book.bookmarks.join(", ")];
    const url=URL.createObjectURL(new Blob([lines.join("\n")],{type:"text/markdown;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download=`gutenberg-${book.id}-ghi-chu.md`;a.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),2000);
  }

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){setSearchOpen(false);setFocus(false);setSelection(null);}
      if(!book||(event.target as HTMLElement)?.matches("input, textarea, select")||event.ctrlKey||event.metaKey)return;
      if(event.key==="/" ){event.preventDefault();setSearchOpen(true);}
      if(event.key.toLowerCase()==="f"&&!event.altKey){event.preventDefault();setFocus(prev=>!prev);}
      if(event.altKey&&event.key==="ArrowRight"){event.preventDefault();goTo(page+1);}
      if(event.altKey&&event.key==="ArrowLeft"){event.preventDefault();goTo(page-1);}
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  });
  useEffect(()=>{if(tts.activeId)document.getElementById("free-"+tts.activeId)?.scrollIntoView({block:"center",behavior:"smooth"});},[tts.activeId]);
  const source=gutenbergPage(bookId);

  if(loading)return <div className="free-read-loading"><LoaderCircle className="spin" size={28}/><h2>Đang mở những trang sách…</h2><p>Lần đầu mở sách, hệ thống cần lấy bản văn từ nguồn và lưu để đọc lại trên thiết bị.</p></div>;
  if(error||!book)return <div className="free-read-loading"><BookOpen size={35}/><h2>Chưa thể mở cuốn sách này</h2><p>{error||"Không tìm thấy sách."}</p><div className="free-reader-error-actions"><Link className="outline-button" href="/discover"><ArrowLeft size={16}/> Quay lại</Link><a className="primary-button" href={source} target="_blank" rel="noreferrer">Mở tại Project Gutenberg <ExternalLink size={16}/></a></div></div>;

  return <div className={`reader-shell reader-theme-${theme} free-reading-shell ${focus?"reader-focus":""}`}>
    <header className="reader-topbar free-reader-topbar">
      <div className="reader-top-left"><Link className="icon-button" href="/discover" title="Quay lại khám phá"><ArrowLeft size={19}/></Link>
        <button className="icon-button" title="Mục lục" onClick={()=>setLeftOpen(!leftOpen)}><Menu size={19}/></button>
        <div className="reader-book-identity"><strong>{book.title}</strong><span>{book.author}</span></div></div>
      <div className="reader-top-right">
        <span className="free-reader-source">GUTENBERG #{book.id}</span>
        <button className="icon-button" title="Tìm trong sách" onClick={()=>{setSearchOpen(true);setFocus(false)}}><Search size={18}/></button>
        <button className="icon-button" title="Chế độ tập trung" onClick={()=>setFocus(!focus)}><Focus size={18}/></button>
        <button className="icon-button" title="Nghe trang này" disabled={!tts.available} onClick={()=>tts.state==="idle"?tts.play(blocks.map(b=>({id:b.id,text:b.text})),book.language==="vi"?"vi-VN":"en-US"):tts.pauseOrResume()}>{tts.state==="playing"?<Pause size={17}/>:<Volume2 size={19}/>}</button>
        <button className={`icon-button ${book.bookmarks.includes(page)?"is-bookmarked":""}`} title="Lưu trang" onClick={()=>updateBook({bookmarks:book.bookmarks.includes(page)?book.bookmarks.filter(n=>n!==page):[...book.bookmarks,page]})}><Bookmark size={18} fill={book.bookmarks.includes(page)?"currentColor":"none"}/></button>
        <button className="icon-button" title="Ghi chú" onClick={()=>setRightOpen(!rightOpen)}><StickyNote size={19}/></button>
      </div>
    </header>
    {focus&&<button className="focus-exit" onClick={()=>setFocus(false)}>Thoát tập trung (Esc)</button>}
    <div className="reader-body free-reading-body">
      {leftOpen&&<aside className="reader-left free-reading-toc"><div className="pane-top"><span className="eyebrow">READING MAP</span><button className="icon-button small mobile-close" onClick={()=>setLeftOpen(false)}><X size={16}/></button></div>
        <div className="toc-heading"><List size={17}/><strong>Chương trong sách</strong></div>
        <div className="toc-list">{toc.length?toc.map((entry,index)=><button key={index} className={page===entry.page?"selected":""} onClick={()=>{goTo(entry.page,entry.blockId);if(window.innerWidth<800)setLeftOpen(false)}}><span>{String(index+1).padStart(2,"0")}</span><span>{entry.title}</span></button>):<p className="empty-side-text">Sách không có mục lục rõ ràng. Hãy chuyển từng trang để tiếp tục.</p>}</div>
        <div className="bookmarks-area"><div className="toc-heading"><Bookmark size={16}/><strong>Trang đánh dấu</strong></div>
          {book.bookmarks.length?book.bookmarks.slice().sort((a,b)=>a-b).map(index=><button key={index} className="bookmark-entry" onClick={()=>goTo(index)}>Trang {index}<ChevronRight size={14}/></button>):<p className="empty-side-text">Nhấn biểu tượng bookmark khi muốn lưu một trang.</p>}</div>
        <div className="reading-stat"><span>TIẾN ĐỘ ĐỌC</span><div className="stat-percent"><strong>{progress}%</strong><small>{page}/{totalPages} trang</small></div><div className="progress-track"><span style={{width:`${progress}%`}}/></div></div>
      </aside>}
      <main className="reader-content free-reader-main" ref={pageRoot}>
        {searchOpen&&<div className="book-search"><div className="book-search-head"><Search size={17}/><input autoFocus placeholder="Tìm câu hoặc từ trong sách…" value={search} onChange={event=>setSearch(event.target.value)}/><button className="icon-button small" onClick={()=>setSearchOpen(false)}><X size={17}/></button></div>
          <div className="book-search-results">{search.trim().length<2?<p>Nhập ít nhất hai ký tự.</p>:searchMatches.length?searchMatches.map(hit=><button key={hit.blockId} onClick={()=>{goTo(hit.page,hit.blockId);setSearchOpen(false)}}><span>Trang {hit.page}</span><p>{hit.preview}</p></button>):<p>Không có kết quả phù hợp.</p>}</div></div>}
        <div className="reflow-container free-reflow" onMouseUp={capture}>
          <div className="reflow-overline">DOCSACHWITHME <span>✳</span> THE READING EDITION</div>
          <div className="chapter-top"><span className="eyebrow">TRANG {page} · {totalPages} TRANG</span><h1>{pageTitle}</h1><div className="chapter-deco"><span/>✦<span/></div></div>
          <article className="reader-article free-reader-article" style={{fontSize:`${fontSize}px`,lineHeight}} lang={book.language}>
            {blocks.map(block=>block.kind==="heading"?<h2 key={block.id} id={"free-"+block.id} data-reading-block={block.id} className={`reading-heading ${tts.activeId==="free-"+block.id?"reading-audio-active":""}`}>{renderText(block)}</h2>:
              <p key={block.id} id={"free-"+block.id} data-reading-block={block.id} className={`reading-paragraph ${tts.activeId==="free-"+block.id?"reading-audio-active":""}`}>{renderText(block)}</p>)}
          </article>
          <div className="chapter-end"><div>✳</div><span>Trang {page} / {totalPages}</span><div className="chapter-navigation"><button disabled={page<=1} className="outline-button" onClick={()=>goTo(page-1)}><ChevronLeft size={17}/> Trang trước</button><button disabled={page>=totalPages} className="primary-button" onClick={()=>goTo(page+1)}>Trang tiếp <ChevronRight size={17}/></button></div></div>
        </div>
      </main>
      {rightOpen&&<aside className="reader-right free-notes-pane"><div className="right-panel-tabs"><button className="active"><StickyNote size={16}/> Ghi chú ({book.notes.length})</button><button className="icon-button small" title="Đóng" onClick={()=>setRightOpen(false)}><X size={16}/></button></div>
        <div className="notes-pane"><div className="right-pane-intro"><h3>Đánh dấu điều đáng nhớ.</h3><p>Chọn một đoạn văn trong trang để highlight và viết suy nghĩ của bạn.</p>
          <button className="export-notes" disabled={!book.notes.length&&!book.bookmarks.length} onClick={exportNotes}><Download size={15}/> Xuất ghi chú Markdown</button></div>
          <div className="note-list">{book.notes.slice().reverse().map(note=><div key={note.id} className="note-item"><button className="note-quote" onClick={()=>{goTo(note.page,note.blockId);setEditingId(note.id);setDraft(note.content)}}><span className={`note-dot ${note.color}`}/>“{note.quote.slice(0,240)}{note.quote.length>240?"…":""}”</button>
            {editingId===note.id?<div className="note-editor"><textarea rows={4} placeholder="Viết suy nghĩ của bạn…" value={draft} onChange={e=>setDraft(e.target.value)}/><div><button onClick={()=>{writeNote(note,draft);setEditingId(null)}}><Check size={14}/> Lưu</button><button title="Xóa" onClick={()=>{updateBook({notes:book.notes.filter(item=>item.id!==note.id)});setEditingId(null)}}><Trash2 size={16}/></button></div></div>:<button className="demo-note-edit" onClick={()=>{setEditingId(note.id);setDraft(note.content)}}>{note.content||"Thêm suy nghĩ…"}</button>}
          </div>)}</div>
          {!book.notes.length&&<div className="notes-empty"><Highlighter size={24}/><strong>Chưa có ghi chú</strong><p>Bôi đen một câu để bắt đầu.</p></div>}
          {saveError&&<p className="error-banner">{saveError}</p>}
        </div>
      </aside>}
    </div>
    <div className="demo-bottom-bar free-reader-bottom"><div className="demo-bottom-counter"><button aria-label="Trước" disabled={page<=1} onClick={()=>goTo(page-1)}><ChevronLeft size={17}/></button><span>Trang {page} / {totalPages}</span><button aria-label="Tiếp" disabled={page>=totalPages} onClick={()=>goTo(page+1)}><ChevronRight size={17}/></button></div>
      <div className="demo-settings"><button title="Chữ nhỏ" onClick={()=>setFontSize(Math.max(15,fontSize-1))}><Minus size={14}/></button><span>{fontSize}px</span><button title="Chữ lớn" onClick={()=>setFontSize(Math.min(28,fontSize+1))}><Plus size={14}/></button><button title="Đổi nền" onClick={()=>setTheme(theme==="cream"?"white":theme==="white"?"dark":"cream")}>{theme==="dark"?<Moon size={17}/>:<Sun size={17}/>}</button><button title="Giãn dòng" onClick={()=>setLineHeight(lineHeight>=2.3?1.5:Number((lineHeight+.2).toFixed(1)))}><Settings2 size={17}/></button><a href={source} target="_blank" rel="noreferrer" title="Nguồn sách"><ExternalLink size={15}/></a></div>
    </div>
    {tts.state!=="idle"&&<div className="read-aloud-controls free-reading-audio"><Volume2 size={17}/><span>Đang nghe trang {page}</span><select aria-label="Tốc độ đọc" value={tts.speed} onChange={e=>tts.updateSpeed(Number(e.target.value))}><option value={0.8}>0.8×</option><option value={1}>1×</option><option value={1.2}>1.2×</option><option value={1.5}>1.5×</option></select><button onClick={tts.pauseOrResume}>{tts.state==="playing"?<Pause size={16}/>:<Play size={16}/>}</button><button title="Dừng" onClick={tts.stop}><Square size={15}/></button></div>}
    {selection&&<div className="selection-toolbar"><span><Highlighter size={16}/> Highlight</span>{(["yellow","green","pink"] as const).map(color=><button key={color} title={color} className={`color-dot ${color}`} onClick={()=>highlight(color)}/>)}<button title="Hủy" onClick={()=>setSelection(null)}><X size={16}/></button></div>}
  </div>;
}
