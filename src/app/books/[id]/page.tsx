"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft, ArrowRight, BookHeart, BookMarked, BookOpen, Bookmark,
  Check, ChevronDown, ChevronLeft, ChevronRight, FileText, Highlighter,
  List, LoaderCircle, Menu, MessageCircle, Minus, Moon, Search, Focus, Download, Copy, PanelRightClose,
  PanelRightOpen, Plus, Send, Settings2, Sparkles, StickyNote, Sun, Trash2, X
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { requireSupabase } from "@/lib/supabase";
import type { Book, BookBlock, BookDocument, ReaderBookmark, ReaderNote, ReadingProgress } from "@/lib/types";
import { downloadNotesMarkdown } from "@/lib/export";

type Panel = "notes" | "ai";
type Theme = "cream" | "white" | "dark";
type Selection = { blockId: string; quote: string; page: number };
type ChatItem = { role: "user" | "assistant"; content: string };
type Section = { title: string; start: number; end: number; blockId: string };

function getSections(document: BookDocument | null): Section[] {
  if (!document) return [];
  const chapters = [...new Map(document.toc.map(chapter => [chapter.page, chapter])).values()]
    .filter(chapter => chapter.page >= 1 && chapter.page <= document.totalPages)
    .sort((a,b) => a.page-b.page);
  if (!chapters.length || chapters.length > 70) {
    const fallback: Section[] = [];
    for (let p=1; p<=document.totalPages; p+=8) fallback.push({
      title: `Trang ${p}–${Math.min(document.totalPages,p+7)}`, start:p,
      end:Math.min(document.totalPages,p+7), blockId:`p${p}-b0`
    });
    return fallback;
  }
  if (chapters[0].page > 1) chapters.unshift({title:"Lời mở đầu",page:1,blockId:"p1-b0"});
  return chapters.map((chapter,index)=>({
    title:chapter.title, start:chapter.page,
    end:index < chapters.length-1 ? chapters[index+1].page-1 : document.totalPages,
    blockId:chapter.blockId
  })).filter(section => section.end >= section.start);
}

function Reader({user,bookId}:{user:User;bookId:string}) {
  const router=useRouter();
  const [book,setBook]=useState<Book|null>(null);
  const [documentData,setDocumentData]=useState<BookDocument|null>(null);
  const [notes,setNotes]=useState<ReaderNote[]>([]);
  const [bookmarks,setBookmarks]=useState<ReaderBookmark[]>([]);
  const [pdfUrl,setPdfUrl]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [page,setPage]=useState(1);
  const [activeBlock,setActiveBlock]=useState("");
  const [view,setView]=useState<"reflow"|"original">("reflow");
  const [theme,setTheme]=useState<Theme>("cream");
  const [fontSize,setFontSize]=useState(19);
  const [lineHeight,setLineHeight]=useState(1.88);
  const [leftOpen,setLeftOpen]=useState(true);
  const [rightOpen,setRightOpen]=useState(false);
  const [panel,setPanel]=useState<Panel>("notes");
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchTerm,setSearchTerm]=useState("");
  const [focusMode,setFocusMode]=useState(false);
  const [settingsReady,setSettingsReady]=useState(false);
  const [selection,setSelection]=useState<Selection|null>(null);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [noteDraft,setNoteDraft]=useState("");
  const [chat,setChat]=useState<ChatItem[]>([]);
  const [question,setQuestion]=useState("");
  const [asking,setAsking]=useState(false);
  const [aiError,setAiError]=useState("");
  const [finished,setFinished]=useState(false);
  const scrollRef=useRef<HTMLDivElement>(null);
  const saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const chatEndRef=useRef<HTMLDivElement>(null);
  const searchInputRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    try {
      const saved=JSON.parse(localStorage.getItem("docsach-reader-settings")||"{}");
      if (["cream","white","dark"].includes(saved.theme)) setTheme(saved.theme);
      if (Number.isInteger(saved.fontSize) && saved.fontSize>=15 && saved.fontSize<=28) setFontSize(saved.fontSize);
      if (typeof saved.lineHeight==="number" && saved.lineHeight>=1.4 && saved.lineHeight<=2.4) setLineHeight(saved.lineHeight);
    } catch { /* Invalid old preferences are ignored. */ }
    setSettingsReady(true);
  },[]);
  useEffect(()=>{
    if(settingsReady) localStorage.setItem("docsach-reader-settings",JSON.stringify({theme,fontSize,lineHeight}));
  },[settingsReady,theme,fontSize,lineHeight]);
  useEffect(()=>{if(searchOpen) searchInputRef.current?.focus();},[searchOpen]);

  useEffect(()=>{
    let live=true;
    async function load() {
      try {
        const client=requireSupabase();
        const [{data:found,error:bookError},{data:storedNotes},{data:storedBookmarks},{data:progress}] = await Promise.all([
          client.from("books").select("*").eq("id",bookId).single(),
          client.from("reader_notes").select("*").eq("book_id",bookId).order("created_at",{ascending:false}),
          client.from("reader_bookmarks").select("*").eq("book_id",bookId).order("page"),
          client.from("reading_progress").select("*").eq("book_id",bookId).maybeSingle()
        ]);
        if (bookError || !found) throw new Error("Không tìm thấy cuốn sách trong thư viện.");
        const current=found as Book;
        const [signed,docResponse]=await Promise.all([
          client.storage.from("books").createSignedUrl(current.file_path,3600),
          current.text_path ? client.storage.from("books").download(current.text_path) : Promise.resolve({data:null,error:null})
        ]);
        if (signed.error) throw signed.error;
        let parsed:BookDocument|null=null;
        if (docResponse.data) {
          try { parsed=JSON.parse(await docResponse.data.text()) as BookDocument; }
          catch { parsed=null; }
        }
        if(!live) return;
        setBook(current);setDocumentData(parsed);setPdfUrl(signed.data.signedUrl);
        setNotes((storedNotes||[]) as ReaderNote[]);setBookmarks((storedBookmarks||[]) as ReaderBookmark[]);
        const currentProgress=progress as ReadingProgress|null;
        setPage(currentProgress?.page||1);
        setActiveBlock(currentProgress?.block_id||"");
        setFinished((currentProgress?.percent||0)>=100);
        if (!parsed || !parsed.wordCount) setView("original");
        client.from("books").update({last_opened_at:new Date().toISOString()}).eq("id",bookId).then(()=>{});
      } catch(err) {if(live)setError(err instanceof Error ? err.message : "Không thể tải sách");}
      finally {if(live)setLoading(false);}
    }
    load();
    return ()=>{live=false;if(saveTimer.current)clearTimeout(saveTimer.current);};
  },[bookId]);

  const sections=useMemo(()=>getSections(documentData),[documentData]);
  const sectionIndex=useMemo(()=>{
    const index=sections.findIndex(section=>page>=section.start && page<=section.end);
    return index>=0 ? index : 0;
  },[sections,page]);
  const section=sections[sectionIndex];
  const visiblePages=useMemo(()=>documentData?.pages.filter(p=>section && p.page>=section.start && p.page<=section.end)||[],[documentData,section]);
  const activeBookmark=bookmarks.some(item=>item.page===page);
  const searchResults=useMemo(()=>{
    const query=searchTerm.trim().toLocaleLowerCase("vi");
    if(!documentData||query.length<2)return [];
    const found:{page:number;blockId:string;preview:string}[]=[];
    for(const currentPage of documentData.pages){
      for(const block of currentPage.blocks){
        const match=block.text.toLocaleLowerCase("vi").indexOf(query);
        if(match<0)continue;
        const start=Math.max(0,match-65);
        const preview=(start>0?"…":"")+block.text.slice(start,Math.min(block.text.length,match+query.length+95))+(match+query.length+95<block.text.length?"…":"");
        found.push({page:currentPage.page,blockId:block.id,preview});
        if(found.length>=150)return found;
      }
    }
    return found;
  },[documentData,searchTerm]);
  const totalPages=book?.total_pages||documentData?.totalPages||0;
  const percent=finished?100:totalPages?Math.min(99,Math.round((page-1)/totalPages*100)):0;

  const persist=useCallback((newPage:number,blockId:string,done=false)=>{
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>{
      const total=book?.total_pages||1;
      requireSupabase().from("reading_progress").upsert({
        book_id:bookId,owner_id:user.id,page:newPage,block_id:blockId,
        percent:done?100:Math.min(99,Math.max(0,Math.round((newPage-1)/total*100))),
        updated_at:new Date().toISOString()
      },{onConflict:"book_id"}).then(({error})=>{if(error)console.warn("Progress sync failed",error.message);});
    },500);
  },[bookId,book?.total_pages,user.id]);

  function navigateTo(target:number,blockId?:string) {
    if(!documentData)return;
    const safe=Math.max(1,Math.min(documentData.totalPages,target));
    setPage(safe);setActiveBlock(blockId||`p${safe}-b0`);
    persist(safe,blockId||`p${safe}-b0`);
    window.setTimeout(()=>{
      if(blockId) document.getElementById(blockId)?.scrollIntoView({behavior:"smooth",block:"center"});
      else scrollRef.current?.scrollTo({top:0,behavior:"smooth"});
    },50);
  }

  useEffect(()=>{
    if(view!=="reflow" || !documentData || !visiblePages.length) return;
    const root=scrollRef.current;
    if(!root) return;
    const observer=new IntersectionObserver(entries=>{
      const visible=entries.filter(item=>item.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
      if(!visible.length) return;
      const element=visible[0].target as HTMLElement;
      const currentPage=Number(element.dataset.page)||1;
      const blockId=element.dataset.blockId||"";
      setPage(previous=>previous===currentPage?previous:currentPage);
      setActiveBlock(previous=>previous===blockId?previous:blockId);
      persist(currentPage,blockId);
    },{root,rootMargin:"-8% 0px -65% 0px",threshold:0});
    const blocks=root.querySelectorAll(".reading-paragraph");
    blocks.forEach(block=>observer.observe(block));
    return ()=>observer.disconnect();
  },[view,visiblePages,documentData,persist]);

  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:"smooth",block:"end"});},[chat,asking]);

  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      const element=event.target as HTMLElement|null;
      const typing=element?.matches("input, textarea, [contenteditable=true]");
      if(event.key==="Escape") {setFocusMode(false);setSearchOpen(false);setSelection(null);setSettingsOpen(false);return;}
      if(typing || event.metaKey || event.ctrlKey) return;
      if(event.key.toLowerCase()==="f" && !event.altKey){event.preventDefault();setFocusMode(previous=>!previous);}
      if(event.key==="/" && !event.altKey){event.preventDefault();setSearchOpen(true);}
      if(event.altKey && event.key==="ArrowRight" && sectionIndex<sections.length-1){event.preventDefault();navigateTo(sections[sectionIndex+1].start);}
      if(event.altKey && event.key==="ArrowLeft" && sectionIndex>0){event.preventDefault();navigateTo(sections[sectionIndex-1].start);}
    };
    window.addEventListener("keydown",onKeyDown);
    return ()=>window.removeEventListener("keydown",onKeyDown);
  });

  function captureSelection() {
    if(view!=="reflow")return;
    const selected=window.getSelection();
    const quote=selected?.toString().replace(/\s+/g," ").trim()||"";
    if(!selected || !quote || quote.length>2000)return;
    const start=selected.anchorNode?.parentElement?.closest<HTMLElement>("[data-block-id]");
    const end=selected.focusNode?.parentElement?.closest<HTMLElement>("[data-block-id]");
    if(start && start===end) setSelection({blockId:start.dataset.blockId||"",quote,page:Number(start.dataset.page)||page});
    else setSelection(null);
  }

  async function highlight(color:string) {
    if(!selection)return;
    const client=requireSupabase();
    const {data,error}=await client.from("reader_notes").insert({
      book_id:bookId,owner_id:user.id,block_id:selection.blockId,quote:selection.quote,note:"",color
    }).select("*").single();
    if(error) {window.alert(error.message);return;}
    const created=data as ReaderNote;
    setNotes(previous=>[created,...previous]);
    setSelection(null);window.getSelection()?.removeAllRanges();
    setRightOpen(true);setPanel("notes");setEditingId(created.id);setNoteDraft("");
  }

  async function saveNote() {
    if(!editingId)return;
    const note=notes.find(n=>n.id===editingId);
    if(!note || note.note===noteDraft)return;
    const {error}=await requireSupabase().from("reader_notes").update({note:noteDraft}).eq("id",editingId);
    if(!error) setNotes(previous=>previous.map(n=>n.id===editingId?{...n,note:noteDraft}:n));
  }

  async function deleteNote(id:string) {
    const {error}=await requireSupabase().from("reader_notes").delete().eq("id",id);
    if(error){window.alert(error.message);return;}
    setNotes(previous=>previous.filter(n=>n.id!==id));
    if(editingId===id){setEditingId(null);setNoteDraft("");}
  }

  async function toggleBookmark() {
    if(activeBookmark) {
      const matches=bookmarks.filter(item=>item.page===page);
      const {error}=await requireSupabase().from("reader_bookmarks").delete().in("id",matches.map(item=>item.id));
      if(!error)setBookmarks(previous=>previous.filter(item=>item.page!==page));
      return;
    }
    const {data,error}=await requireSupabase().from("reader_bookmarks").insert({
      book_id:bookId,owner_id:user.id,block_id:activeBlock||`p${page}-b0`,page
    }).select("*").single();
    if(error){window.alert(error.message);return;}
    setBookmarks(previous=>[...previous,data as ReaderBookmark]);
  }

  async function askAi(prompt?:string,mode:"ask"|"summarize"|"explain"="ask",selectedText?:string) {
    const text=(prompt||question).trim();
    if(!text || asking) return;
    setRightOpen(true);setPanel("ai");setAiError("");setAsking(true);
    setChat(previous=>[...previous,{role:"user",content:text}]);setQuestion("");
    try {
      const {data:{session}}=await requireSupabase().auth.getSession();
      if(!session)throw new Error("Phiên đăng nhập đã hết hạn.");
      const response=await fetch("/api/ai",{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({bookId,question:text,page,mode,selection:selectedText||""})
      });
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"AI không thể trả lời.");
      setChat(previous=>[...previous,{role:"assistant",content:data.answer}]);
    }catch(err){setAiError(err instanceof Error?err.message:"Đã có lỗi xảy ra");}
    finally{setAsking(false);}
  }

  function renderText(block:BookBlock) {
    const relevant=notes.filter(n=>n.block_id===block.id && n.quote).map(n=>({...n,index:block.text.indexOf(n.quote)})).filter(n=>n.index>=0).sort((a,b)=>a.index-b.index);
    const nodes:React.ReactNode[]=[];
    let cursor=0;
    for(const note of relevant) {
      if(note.index<cursor)continue;
      if(note.index>cursor)nodes.push(block.text.slice(cursor,note.index));
      nodes.push(<mark key={note.id} title={note.note||"Bấm để xem ghi chú"} className={`highlight-${note.color}`} onClick={(event)=>{
        event.stopPropagation();setRightOpen(true);setPanel("notes");setEditingId(note.id);setNoteDraft(note.note);
      }}>{note.quote}</mark>);
      cursor=note.index+note.quote.length;
    }
    if(cursor<block.text.length)nodes.push(block.text.slice(cursor));
    return nodes.length?nodes:block.text;
  }

  function renderAnswer(text:string){
    return text.split(/(\(trang\s+\d+\))/gi).map((part,index)=>{
      const match=part.match(/^\(trang\s+(\d+)\)$/i);
      return match?<button key={index} className="ai-citation" onClick={()=>navigateTo(Number(match[1]))}>{part}</button>:<span key={index}>{part}</span>;
    });
  }

  if(loading)return <div className="loading-screen"><div className="loader"/><p>Đang mở những trang sách…</p></div>;
  if(error || !book)return <div className="loading-screen"><BookOpen size={35}/><p>{error||"Không tìm thấy sách"}</p><button className="outline-button" onClick={()=>router.push("/")}>Về thư viện</button></div>;

  return <div className={`reader-shell reader-theme-${theme} ${focusMode?"reader-focus":""}`}>
    <header className="reader-topbar">
      <div className="reader-top-left"><button className="icon-button" title="Về thư viện" onClick={()=>router.push("/")}><ArrowLeft size={19}/></button><div className="reader-divider"/>
      <button className="icon-button" title="Mục lục" onClick={()=>setLeftOpen(!leftOpen)}><Menu size={19}/></button><div className="reader-book-identity"><strong>{book.title}</strong><span>{book.author||"Thư viện của tôi"}</span></div></div>
      <div className="reader-top-mid"><div className="reader-view-switch"><button className={view==="reflow"?"selected":""} onClick={()=>setView("reflow")} disabled={!documentData?.wordCount}><BookOpen size={15}/> Sách điện tử</button><button className={view==="original"?"selected":""} onClick={()=>setView("original")}><FileText size={15}/> PDF gốc</button></div></div>
      <div className="reader-top-right">
        <button className="icon-button" title="Tìm trong sách (/)" disabled={!documentData?.wordCount} onClick={()=>{setSearchOpen(true);setFocusMode(false)}}><Search size={19}/></button>
        <button className="icon-button" title="Chế độ tập trung (F)" onClick={()=>setFocusMode(!focusMode)}><Focus size={19}/></button>
        <button className={`icon-button ${activeBookmark?"is-bookmarked":""}`} title="Đánh dấu trang" onClick={toggleBookmark}><Bookmark size={19} fill={activeBookmark?"currentColor":"none"}/></button>
        <div className="settings-wrap"><button className="icon-button" title="Cài đặt đọc sách" onClick={()=>setSettingsOpen(!settingsOpen)}><Settings2 size={19}/></button>
          {settingsOpen && <div className="settings-popover"><div className="settings-title"><strong>Tùy chỉnh trải nghiệm đọc</strong><button className="icon-button small" onClick={()=>setSettingsOpen(false)}><X size={16}/></button></div>
            <span className="settings-label">Màu trang sách</span><div className="theme-choices">
              {([["cream","Giấy ấm"],["white","Trắng"],["dark","Ban đêm"]] as const).map(([value,label])=><button title={label} key={value} className={`theme-swatch ${value} ${theme===value?"active":""}`} onClick={()=>setTheme(value)}>{theme===value&&<Check size={16}/>}</button>)}
            </div>
            <span className="settings-label">Kích thước chữ</span><div className="setting-stepper"><button onClick={()=>setFontSize(Math.max(15,fontSize-1))}><Minus size={16}/></button><span>{fontSize}px</span><button onClick={()=>setFontSize(Math.min(28,fontSize+1))}><Plus size={16}/></button></div>
            <span className="settings-label">Giãn dòng</span><div className="setting-stepper"><button onClick={()=>setLineHeight(Math.max(1.4,Number((lineHeight-.1).toFixed(1))))}><Minus size={16}/></button><span>{lineHeight.toFixed(1)}×</span><button onClick={()=>setLineHeight(Math.min(2.4,Number((lineHeight+.1).toFixed(1))))}><Plus size={16}/></button></div>
          </div>}
        </div>
        <button className={`ai-open-button ${rightOpen&&panel==="ai"?"active":""}`} onClick={()=>{setRightOpen(true);setPanel("ai")}}><Sparkles size={16}/> Hỏi AI</button>
        <button className="icon-button sidebar-toggle" title="Bảng ghi chú" onClick={()=>setRightOpen(!rightOpen)}>{rightOpen?<PanelRightClose size={20}/>:<PanelRightOpen size={20}/>}</button>
      </div>
    </header>
    {focusMode && <button className="focus-exit" onClick={()=>setFocusMode(false)}><Focus size={15}/> Thoát tập trung (Esc)</button>}
    <div className="reader-body">
      {leftOpen && <aside className="reader-left">
        <div className="pane-top"><span className="eyebrow">CÔNG CỤ ĐỌC</span><button className="icon-button small mobile-close" onClick={()=>setLeftOpen(false)}><X size={16}/></button></div>
        <div className="toc-heading"><List size={17}/><strong>Mục lục</strong></div>
        <div className="toc-list">{sections.length ? sections.map((chapter,index)=><button key={index} className={sectionIndex===index?"selected":""} onClick={()=>{navigateTo(chapter.start,chapter.blockId);if(window.innerWidth<800)setLeftOpen(false)}}><span>{(index+1).toString().padStart(2,"0")}</span><span>{chapter.title}</span></button>):<p className="empty-side-text">Dùng chế độ PDF gốc để xem mục lục theo tài liệu.</p>}</div>
        <div className="bookmarks-area"><div className="toc-heading"><Bookmark size={17}/><strong>Trang đã lưu</strong><span>{bookmarks.length}</span></div>
        {bookmarks.length ? bookmarks.map(item=><button key={item.id} className="bookmark-entry" onClick={()=>navigateTo(item.page,item.block_id)}>Trang {item.page}<ChevronRight size={14}/></button>):<p className="empty-side-text">Bấm biểu tượng đánh dấu trang để quay lại sau.</p>}</div>
        <div className="reading-stat"><span>TIẾN ĐỘ ĐỌC</span><div className="stat-percent"><strong>{percent}%</strong><small>{page}/{totalPages||"?"} trang</small></div><div className="progress-track"><span style={{width:`${percent}%`}}/></div></div>
      </aside>}
      <main className="reader-content" ref={scrollRef}>
        {searchOpen && <div className="book-search"><div className="book-search-head"><Search size={18}/><input ref={searchInputRef} value={searchTerm} onChange={event=>setSearchTerm(event.target.value)} placeholder="Tìm câu, từ khóa trong sách…" aria-label="Tìm trong sách"/><button className="icon-button small" aria-label="Đóng tìm kiếm" onClick={()=>setSearchOpen(false)}><X size={17}/></button></div><div className="book-search-results">{searchTerm.trim().length<2?<p>Nhập ít nhất 2 ký tự để tìm trên toàn bộ sách.</p>:!searchResults.length?<p>Không tìm thấy đoạn văn phù hợp.</p>:<><span className="book-search-count">{searchResults.length >= 150?"150+ kết quả":`${searchResults.length} kết quả`}</span>{searchResults.map(result=><button key={result.blockId} onClick={()=>{setView("reflow");setSearchOpen(false);navigateTo(result.page,result.blockId)}}><span>Trang {result.page}</span><p>{result.preview}</p></button>)}</>}</div></div>}
        {view==="original" ? <div className="original-reader"><div className="original-notice"><FileText size={16}/> Đang xem bản PDF gốc. Chuyển sang Sách điện tử để thay đổi cỡ chữ và highlight.</div><iframe src={pdfUrl} title={book.title} className="pdf-iframe"/></div> :
          <div className="reflow-container" onMouseUp={captureSelection}>
            <div className="reflow-overline">DOCSACHWITHME <span>✳</span> READING EDITION</div>
            <div className="chapter-top"><span className="eyebrow">PHẦN {(sectionIndex+1).toString().padStart(2,"0")} / {sections.length.toString().padStart(2,"0")}</span>
              <h1>{section?.title||book.title}</h1><div className="chapter-deco"><span/>✦<span/></div>
            </div>
            <article className="reader-article" style={{fontSize:`${fontSize}px`,lineHeight}}>
              {visiblePages.map(currentPage=><section key={currentPage.page} className="reflow-page">
                {currentPage.blocks.map(block=>block.kind==="heading"
                  ? <h2 key={block.id} id={block.id} className="reading-paragraph reading-heading" data-block-id={block.id} data-page={block.page}>{renderText(block)}</h2>
                  : <p key={block.id} id={block.id} className="reading-paragraph" data-block-id={block.id} data-page={block.page}>{renderText(block)}</p>)}
                {currentPage.blocks.length>0 && <div className="pdf-page-label">TRANG GỐC {currentPage.page}</div>}
              </section>)}
            </article>
            <div className="chapter-end"><div>✳</div><span>Hết phần {(sectionIndex+1).toString().padStart(2,"0")}</span>
              <div className="chapter-navigation"><button disabled={sectionIndex===0} className="outline-button" onClick={()=>navigateTo(sections[sectionIndex-1].start)}><ChevronLeft size={17}/> Phần trước</button>
                {sectionIndex<sections.length-1 ? <button className="primary-button" onClick={()=>navigateTo(sections[sectionIndex+1].start)}>Đọc tiếp <ArrowRight size={17}/></button> :
                  <button className="primary-button" onClick={()=>{setFinished(true);persist(totalPages,activeBlock,true)}}><Check size={17}/>{finished?"Đã hoàn thành":"Đánh dấu đã đọc xong"}</button>}
              </div>
            </div>
          </div>}
      </main>
      {rightOpen && <aside className="reader-right">
        <div className="right-panel-tabs"><button className={panel==="notes"?"active":""} onClick={()=>setPanel("notes")}><StickyNote size={16}/> Ghi chú</button><button className={panel==="ai"?"active":""} onClick={()=>setPanel("ai")}><Sparkles size={16}/> Bạn đọc AI</button><button className="icon-button small" title="Đóng" onClick={()=>setRightOpen(false)}><X size={16}/></button></div>
        {panel==="notes" ? <div className="notes-pane">
          <div className="right-pane-intro"><h3>Khoảnh khắc đáng nhớ.</h3><p>Lưu lại những câu khiến bạn dừng đọc và suy nghĩ.</p><button className="export-notes" disabled={!notes.length} onClick={()=>downloadNotesMarkdown(book,notes,bookmarks,documentData)}><Download size={15}/> Xuất ghi chú Markdown</button></div>
          {notes.length ? <div className="note-list">{notes.map(note=><div key={note.id} className={`note-item ${editingId===note.id?"active":""}`}>
            <button className="note-quote" onClick={()=>{setEditingId(note.id);setNoteDraft(note.note);const block=documentData?.pages.flatMap(p=>p.blocks).find(b=>b.id===note.block_id);navigateTo(block?.page||1,note.block_id)}}><span className={`note-dot ${note.color}`}/>“{note.quote.slice(0,230)}{note.quote.length>230?"…":""}”</button>
            {editingId===note.id ? <div className="note-editor"><textarea value={noteDraft} rows={3} onChange={e=>setNoteDraft(e.target.value)} onBlur={saveNote} placeholder="Bạn nghĩ gì về đoạn này?"/><div><button onClick={saveNote}><Check size={14}/> Lưu ghi chú</button><button title="Xóa ghi chú" onClick={()=>deleteNote(note.id)}><Trash2 size={15}/></button></div></div> : note.note&&<p className="note-comment">{note.note}</p>}
          </div>)}</div> : <div className="notes-empty"><Highlighter size={26}/><strong>Chưa có ghi chú</strong><p>Bôi đen một đoạn văn trong chế độ Sách điện tử, chọn màu để lưu lại.</p></div>}
        </div> : <div className="ai-pane">
          <div className="ai-messages">
            {!chat.length && <div className="ai-welcome"><span className="ai-spark"><Sparkles size={27}/></span><span className="eyebrow">YOUR READING COMPANION</span><h3>Cùng hiểu cuốn sách sâu hơn.</h3><p>Hỏi bất cứ điều gì về nội dung bạn đang đọc. AI sẽ dựa trên chính cuốn sách và dẫn số trang.</p>
              <div className="suggestions"><button onClick={()=>askAi("Tóm tắt những luận điểm chính trong phần tôi đang đọc.", "summarize")}><BookOpen size={16}/> Tóm tắt phần này <ArrowRight size={15}/></button><button onClick={()=>askAi("Điều quan trọng nhất tôi nên ghi nhớ ở phần này là gì?")}><Sparkles size={16}/> Ý tưởng đáng nhớ <ArrowRight size={15}/></button><button onClick={()=>askAi("Hãy đặt ba câu hỏi suy ngẫm từ phần này.")}><MessageCircle size={16}/> Gợi mở suy nghĩ <ArrowRight size={15}/></button></div>
            </div>}
            {chat.map((item,index)=><div key={index} className={`chat-bubble ${item.role}`}><div className="chat-role">{item.role==="assistant"?<><Sparkles size={14}/> AI bạn đọc</>:<>Bạn</>}</div><div className="chat-text">{item.role==="assistant"?renderAnswer(item.content):item.content}</div></div>)}
            {asking&&<div className="ai-thinking"><LoaderCircle size={17} className="spin"/> Đang tìm trong những trang sách…</div>}
            {aiError&&<div className="error-banner">{aiError}</div>}
            <div ref={chatEndRef}/>
          </div>
          <form className="ai-compose" onSubmit={e=>{e.preventDefault();askAi()}}><textarea value={question} rows={2} placeholder="Hỏi điều gì đó về cuốn sách…" onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();askAi()}}}/><div><span><Sparkles size={13}/> Dựa trên nội dung sách</span><button aria-label="Gửi câu hỏi" disabled={!question.trim()||asking} type="submit"><Send size={17}/></button></div></form>
        </div>}
      </aside>}
    </div>
    {selection && <div className="selection-toolbar"><span><Highlighter size={16}/> Highlight</span><button className="color-dot yellow" title="Vàng" onClick={()=>highlight("yellow")}/><button className="color-dot green" title="Xanh" onClick={()=>highlight("green")}/><button className="color-dot pink" title="Hồng" onClick={()=>highlight("pink")}/><span className="selection-separator"/><button title="Sao chép đoạn văn" onClick={()=>{if(selection)navigator.clipboard.writeText(selection.quote).catch(()=>{});setSelection(null);window.getSelection()?.removeAllRanges()}}><Copy size={15}/></button><button title="Nhờ AI giải thích đoạn đã chọn" onClick={()=>{const chosen=selection;setSelection(null);window.getSelection()?.removeAllRanges();askAi("Giải thích đoạn văn tôi vừa chọn theo ngữ cảnh cuốn sách.", "explain", chosen.quote)}}><Sparkles size={16}/> Giải thích</button><button title="Đóng" onClick={()=>{setSelection(null);window.getSelection()?.removeAllRanges()}}><X size={15}/></button></div>}
  </div>;
}
export default function ReaderPage() {
  const params=useParams();
  const bookId=typeof params.id==="string"?params.id:"";
  return <AuthGate>{user=><Reader user={user} bookId={bookId}/>}</AuthGate>;
}
