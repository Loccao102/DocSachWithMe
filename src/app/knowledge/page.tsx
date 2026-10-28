"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, BookHeart, BookOpen, Check, ChevronLeft, ChevronRight,
  ClipboardList, Download, FileText, Filter, GraduationCap, Layers3, LibraryBig,
  LoaderCircle, NotebookPen, Plus, RefreshCcw, Search, Sparkles, Trash2, X
} from "lucide-react";
import { configured, supabase } from "@/lib/supabase";
import { listDemoBooks } from "@/lib/demo-store";
import { listPublicBooks } from "@/lib/public-library";
import { collectKnowledge, knowledgeToMarkdown, searchKnowledge, sourceLabels, type KnowledgeEntry, type KnowledgeSource } from "@/lib/knowledge";
import { isCardDue, makeStudyCard, reviewStudyCard, type ReviewRating, type StudyCard } from "@/lib/flashcards";
import { listStudyCards, putStudyCard, removeStudyCard } from "@/lib/study-store";
import type { Book, ReaderNote } from "@/lib/types";

type FilterSource="all"|KnowledgeSource;
type EditorState={sourceNoteId:string|null;question:string;answer:string;bookTitle:string;sourceUrl:string};
const emptyEditor:EditorState={sourceNoteId:null,question:"",answer:"",bookTitle:"Ghi chú tự tạo",sourceUrl:"/knowledge"};
const sources:[FilterSource,string][]=[["all","Tất cả"],["local","PDF / EPUB"],["gutenberg","Gutenberg"],["cloud","Cloud"]];
function downloadText(name:string,content:string){
  const url=URL.createObjectURL(new Blob([content],{type:"text/markdown;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function shorten(text:string,limit=300){return text.length>limit?text.slice(0,limit).trim()+"…":text;}

export default function KnowledgePage(){
  const [activeTab,setActiveTab]=useState<"notes"|"study">("notes");
  const [entries,setEntries]=useState<KnowledgeEntry[]>([]);
  const [cards,setCards]=useState<StudyCard[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [source,setSource]=useState<FilterSource>("all");
  const [editing,setEditing]=useState(false);
  const [editor,setEditor]=useState<EditorState>(emptyEditor);
  const [saving,setSaving]=useState(false);
  const [revealed,setRevealed]=useState(false);
  const [reviewed,setReviewed]=useState(0);
  const [showAllCards,setShowAllCards]=useState(false);
  const [cardError,setCardError]=useState("");

  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    const errors:string[]=[];
    const [local,publicBooks,study]=await Promise.all([
      listDemoBooks().catch(()=>{errors.push("Không đọc được thư viện PDF/EPUB trên thiết bị.");return [];}),
      listPublicBooks().catch(()=>{errors.push("Không đọc được sách miễn phí đã lưu.");return [];}),
      listStudyCards().catch(()=>{errors.push("Không đọc được flashcard.");return [];})
    ]);
    let cloudBooks:Book[]=[];
    let cloudNotes:ReaderNote[]=[];
    if(configured&&supabase){
      try{
        const {data:{user}}=await supabase.auth.getUser();
        if(user){
          const [bookResult,noteResult]=await Promise.all([
            supabase.from("books").select("id,title,author"),
            supabase.from("reader_notes").select("id,book_id,owner_id,block_id,quote,note,color,created_at")
          ]);
          if(bookResult.error||noteResult.error)throw new Error(bookResult.error?.message||noteResult.error?.message);
          cloudBooks=(bookResult.data||[]) as Book[];
          cloudNotes=(noteResult.data||[]) as ReaderNote[];
        }
      }catch{errors.push("Ghi chú cloud chưa tải được. Các ghi chú local vẫn hiển thị.");}
    }
    setEntries(collectKnowledge(local,publicBooks,cloudBooks,cloudNotes));
    setCards(study);
    if(errors.length)setError(errors.join(" "));
    setLoading(false);
  },[]);
  useEffect(()=>{refresh()},[refresh]);

  const filtered=useMemo(()=>searchKnowledge(entries,search,source),[entries,search,source]);
  const filteredBooks=useMemo(()=>new Set(filtered.map(e=>e.source+":"+e.bookId)).size,[filtered]);
  const due=useMemo(()=>cards.filter(card=>isCardDue(card)).sort((a,b)=>a.dueAt.localeCompare(b.dueAt)),[cards]);
  const nextCard=due[0];
  const distinctBooks=useMemo(()=>new Set(entries.map(e=>e.source+":"+e.bookId)).size,[entries]);

  function startCard(entry?:KnowledgeEntry){
    setEditor(entry?{
      sourceNoteId:entry.id,question:`Bạn rút ra điều gì từ đoạn này trong “${entry.bookTitle}”?`,
      answer:entry.note.trim()||entry.quote,bookTitle:entry.bookTitle,sourceUrl:entry.url
    }:emptyEditor);
    setCardError("");setEditing(true);setActiveTab("study");setRevealed(false);
  }
  async function createCard(event:React.FormEvent){
    event.preventDefault();if(saving)return;
    setCardError("");setSaving(true);
    try{
      const card=makeStudyCard(editor,new Date(),crypto.randomUUID());
      await putStudyCard(card);
      setCards(prev=>[card,...prev]);
      setEditing(false);setRevealed(false);
    }catch(ex){setCardError(ex instanceof Error?ex.message:"Không thể lưu flashcard.");}
    finally{setSaving(false);}
  }
  async function rate(rating:ReviewRating){
    if(!nextCard)return;
    const updated=reviewStudyCard(nextCard,rating);
    try{
      await putStudyCard(updated);
      setCards(previous=>previous.map(card=>card.id===updated.id?updated:card));
      setReviewed(prev=>prev+1);setRevealed(false);setCardError("");
    }catch{setCardError("Chưa lưu được kết quả ôn tập. Vui lòng thử lại.");}
  }
  async function deleteCard(card:StudyCard){
    if(!confirm("Xóa flashcard này?"))return;
    try{await removeStudyCard(card.id);setCards(prev=>prev.filter(c=>c.id!==card.id));}
    catch{setCardError("Không thể xóa flashcard.");}
  }
  const countBy=(value:KnowledgeSource)=>entries.filter(e=>e.source===value).length;

  return <div className="knowledge-page">
    <header className="knowledge-navbar">
      <Link href="/" className="knowledge-brand"><span><BookHeart size={21}/></span><strong>DocSach<span>WithMe</span></strong></Link>
      <div className="knowledge-navlinks"><Link href="/demo">Đọc sách</Link><Link href="/discover">Khám phá</Link><span className="knowledge-current">Sổ tay</span></div>
    </header>
    <main className="knowledge-main">
      <div className="knowledge-head">
        <div><span className="eyebrow"><span className="eyebrow-line"/> PERSONAL KNOWLEDGE SPACE</span>
          <h1>Đọc để nhớ, <em>ghi để hiểu.</em></h1>
          <p>Mọi câu trích dẫn, suy nghĩ và điều đáng nhớ từ những cuốn sách của bạn — cùng nằm trong một không gian.</p></div>
        <div className="knowledge-ornament" aria-hidden="true"><NotebookPen size={72} strokeWidth={1}/><span>✳</span></div>
      </div>
      <section className="knowledge-stats" aria-label="Thống kê sổ tay">
        <div><span className="knowledge-stat-icon"><NotebookPen size={19}/></span><strong>{entries.length}</strong><small>Ghi chú đã lưu</small></div>
        <div><span className="knowledge-stat-icon"><BookOpen size={19}/></span><strong>{distinctBooks}</strong><small>Cuốn sách</small></div>
        <div><span className="knowledge-stat-icon"><Layers3 size={19}/></span><strong>{cards.length}</strong><small>Flashcard</small></div>
        <div><span className="knowledge-stat-icon"><GraduationCap size={19}/></span><strong>{due.length}</strong><small>Cần ôn hôm nay</small></div>
      </section>
      <div className="knowledge-tabs">
        <button className={activeTab==="notes"?"active":""} onClick={()=>setActiveTab("notes")}><NotebookPen size={17}/> Sổ tay tổng hợp</button>
        <button className={activeTab==="study"?"active":""} onClick={()=>setActiveTab("study")}><GraduationCap size={18}/> Flashcard & ôn tập{due.length>0&&<span className="knowledge-tab-count">{due.length}</span>}</button>
        <button className="knowledge-reload" title="Tải lại dữ liệu sách và ghi chú" onClick={refresh} disabled={loading}><RefreshCcw size={16}/></button>
      </div>
      {error&&<div role="alert" className="knowledge-alert">{error}</div>}
      {loading?<div className="knowledge-loading"><LoaderCircle className="spin" size={25}/> Đang tổng hợp ghi chú của bạn…</div>:activeTab==="notes"?<>
        <div className="knowledge-section-head"><div><span className="eyebrow">ALL YOUR THOUGHTS</span><h2>Những điều bạn đã ghi lại</h2></div>
          <button className="outline-button" disabled={!filtered.length} onClick={()=>downloadText("docsachwithme-so-tay.md",knowledgeToMarkdown(filtered))}><Download size={16}/> Xuất sổ tay Markdown</button></div>
        <div className="knowledge-toolbar"><div className="knowledge-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm đoạn trích, ghi chú, sách hoặc tác giả…" aria-label="Tìm kiếm ghi chú"/></div>
          <div className="knowledge-filter"><Filter size={15}/><select value={source} aria-label="Nguồn sách" onChange={e=>setSource(e.target.value as FilterSource)}>
            {sources.map(([value,title])=><option key={value} value={value}>{title}{value!=="all"&&entries.length?" ("+countBy(value)+")":""}</option>)}
          </select></div></div>
        <div className="knowledge-results-meta">{filtered.length} ghi chú · {filteredBooks} cuốn sách</div>
        {filtered.length?<div className="knowledge-grid">{filtered.map(entry=><article className="knowledge-note" key={entry.id}>
          <div className="knowledge-note-top"><span className={`knowledge-note-marker marker-${["yellow","green","pink"].includes(entry.color)?entry.color:"yellow"}`}/><span>{sourceLabels[entry.source]}</span><span className="knowledge-note-page">Trang {entry.page}</span></div>
          <h3>{entry.bookTitle}</h3>{entry.author&&<p className="knowledge-author">{entry.author}</p>}
          {entry.quote&&<blockquote>“{shorten(entry.quote,460)}”</blockquote>}
          {entry.note&&<p className="knowledge-thought"><NotebookPen size={14}/>{shorten(entry.note,500)}</p>}
          <div className="knowledge-note-foot"><Link href={entry.url}>Về đoạn sách <ArrowRight size={15}/></Link><button onClick={()=>startCard(entry)}><Plus size={15}/> Tạo flashcard</button></div>
        </article>)}</div>:<div className="knowledge-empty"><NotebookPen size={33}/><h3>{search?"Không có ghi chú khớp tìm kiếm":"Sổ tay đang chờ những dòng đầu tiên"}</h3><p>Highlight một đoạn trong sách PDF/EPUB hoặc sách miễn phí; ghi chú sẽ xuất hiện ở đây.</p><div><Link href="/demo" className="outline-button">Đọc sách của tôi</Link><Link href="/discover" className="primary-button">Khám phá sách <ArrowRight size={16}/></Link></div></div>}
      </>:<>
        <div className="knowledge-section-head"><div><span className="eyebrow">REMEMBER WHAT MATTERS</span><h2>Ôn tập bằng flashcard</h2></div><button className="primary-button" onClick={()=>startCard()}><Plus size={16}/> Tạo thẻ mới</button></div>
        <p className="knowledge-study-intro">Tạo câu hỏi từ ghi chú của bạn và ôn lại theo lịch giãn cách. Các thẻ được lưu riêng trên trình duyệt; không cần AI API key.</p>
        {cardError&&<div role="alert" className="error-banner">{cardError}</div>}
        {editing?<form className="knowledge-card-editor" onSubmit={createCard}>
          <div className="knowledge-editor-title"><div><span className="eyebrow">NEW FLASHCARD</span><h3>Điều bạn muốn ghi nhớ</h3></div><button type="button" className="icon-button" onClick={()=>setEditing(false)} aria-label="Hủy tạo thẻ"><X size={19}/></button></div>
          {editor.sourceNoteId&&<p className="knowledge-editor-origin"><BookOpen size={15}/> Từ ghi chú trong “{editor.bookTitle}”</p>}
          <label>Câu hỏi<textarea required maxLength={500} rows={2} value={editor.question} onChange={e=>setEditor(p=>({...p,question:e.target.value}))} placeholder="Vì sao tác giả lại đưa ra quan điểm này?"/></label>
          <label>Câu trả lời<textarea required maxLength={4000} rows={5} value={editor.answer} onChange={e=>setEditor(p=>({...p,answer:e.target.value}))} placeholder="Viết cách bạn hiểu, hoặc diễn giải lại bằng lời của mình…"/></label>
          <div className="knowledge-editor-actions"><button type="button" className="subtle-button" onClick={()=>setEditing(false)}>Hủy</button><button type="submit" disabled={saving} className="primary-button"><Check size={16}/>{saving?"Đang lưu…":"Lưu flashcard"}</button></div>
        </form>:nextCard?<div className="knowledge-review-wrap">
          <div className="knowledge-review-top"><span className="eyebrow">DAILY REVIEW</span><span>{due.length} thẻ cần ôn</span></div>
          <div className="knowledge-review-card"><span className="knowledge-review-source"><BookOpen size={14}/>{nextCard.bookTitle}</span>
            <h3>{nextCard.question}</h3>
            {revealed?<div className="knowledge-review-answer"><span>ĐÁP ÁN / GỢI NHỚ</span><p>{nextCard.answer}</p></div>:<div className="knowledge-review-hidden"><Sparkles size={20}/><p>Thử tự trả lời trước khi lật thẻ.</p></div>}
          </div>
          {revealed?<div className="knowledge-review-buttons"><button onClick={()=>rate("again")}>Học lại <small>10 phút</small></button><button onClick={()=>rate("hard")}>Khó <small>~1 ngày</small></button><button onClick={()=>rate("good")}>Nhớ được <small>Ôn sau</small></button><button onClick={()=>rate("easy")}>Dễ <small>Giãn lâu hơn</small></button></div>:<button className="primary-button knowledge-reveal" onClick={()=>setRevealed(true)}>Lật thẻ xem đáp án <ArrowRight size={17}/></button>}
          <p className="knowledge-review-tip">Ôn theo trí nhớ thực tế của bạn. Mỗi đánh giá sẽ điều chỉnh thời gian xuất hiện lần tiếp theo.</p>
        </div>:<div className="knowledge-complete"><span><Check size={31}/></span><h3>{cards.length?"Đã ôn xong các thẻ đến hạn!":"Chưa có flashcard nào"}</h3><p>{cards.length?`Bạn đã ôn ${reviewed} thẻ trong phiên này. Thẻ tiếp theo sẽ xuất hiện khi tới hạn.`:"Hãy biến một đoạn highlight thành câu hỏi để ghi nhớ lâu hơn."}</p><button className="outline-button" onClick={()=>startCard()}><Plus size={16}/> Tạo flashcard</button></div>}
        <div className="knowledge-card-list-head"><h3>Bộ thẻ của tôi <span>({cards.length})</span></h3><button onClick={()=>setShowAllCards(p=>!p)}>{showAllCards?"Thu gọn":"Xem tất cả"}</button></div>
        {(showAllCards?cards:cards.slice(0,4)).length?<div className="knowledge-card-list">{(showAllCards?cards:cards.slice(0,4)).map(card=><div className="knowledge-card-row" key={card.id}><div><span>{card.bookTitle}</span><strong>{shorten(card.question,135)}</strong><small>{isCardDue(card)?"Đến hạn ôn":`Ôn lại: ${new Date(card.dueAt).toLocaleDateString("vi-VN")}`}</small></div><button title="Xóa flashcard" onClick={()=>deleteCard(card)}><Trash2 size={17}/></button></div>)}</div>:null}
      </>}
      <footer className="knowledge-footer"><span>Sách & ghi chú, được kết nối bởi chính bạn ✳</span><p>Ghi chú PDF/EPUB và Gutenberg lưu trên thiết bị; ghi chú cloud hiển thị khi bạn đã đăng nhập Supabase. Flashcard hiện lưu riêng trên thiết bị này.</p></footer>
    </main>
  </div>;
}
