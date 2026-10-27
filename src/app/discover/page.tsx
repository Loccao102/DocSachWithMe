"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BookHeart, BookOpen, BookText, Check, ChevronLeft, ChevronRight, Download, ExternalLink, Globe2, LibraryBig, LoaderCircle, Search, Sparkles } from "lucide-react";
import { coverUrl, epubUrl, gutenbergPage, plaintextUrl, type GutenbergBook } from "@/lib/free-books";
import { listPublicBooks, removePublicBook } from "@/lib/public-library";
import type { SavedPublicBook } from "@/lib/free-books";

type CatalogResult={count:number;hasNext:boolean;hasPrevious:boolean;results:GutenbergBook[]};
const languages=[["en","English"],["vi","Tiếng Việt"],["fr","Français"],["de","Deutsch"],["es","Español"],["all","Tất cả"]] as const;
const topics=[["","Tất cả"],["fiction","Văn học"],["philosophy","Triết học"],["psychology","Tâm lý"],["science","Khoa học"],["history","Lịch sử"],["children","Thiếu nhi"],["poetry","Thơ"]] as const;

export default function DiscoverPage(){
  const [language,setLanguage]=useState("en");
  const [topic,setTopic]=useState("");
  const [searchInput,setSearchInput]=useState("");
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(1);
  const [tab,setTab]=useState<"discover"|"saved">("discover");
  const [results,setResults]=useState<CatalogResult|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState<SavedPublicBook[]>([]);
  const loadSaved=useCallback(()=>listPublicBooks().then(data=>setSaved(data.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))).catch(()=>setSaved([])),[]);
  useEffect(()=>{loadSaved()},[loadSaved]);
  useEffect(()=>{
    if(tab!=="discover")return;
    const controller=new AbortController();
    setLoading(true);setError("");
    const params=new URLSearchParams({lang:language,page:String(page)});
    if(query)params.set("q",query);
    if(topic)params.set("topic",topic);
    fetch("/api/free-books?"+params.toString(),{signal:controller.signal}).then(async response=>{
      const json=await response.json();
      if(!response.ok)throw new Error(json.error||"Không thể tải thư viện.");
      setResults(json as CatalogResult);
    }).catch(ex=>{if(!controller.signal.aborted)setError(ex instanceof Error?ex.message:"Kho sách tạm không hoạt động.");})
    .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return ()=>controller.abort();
  },[language,topic,query,page,tab]);
  const ids=useMemo(()=>new Set(saved.map(book=>book.id)),[saved]);
  const selectedLanguage=languages.find(([key])=>key===language)?.[1]||"English";
  function submit(event:React.FormEvent){
    event.preventDefault();setQuery(searchInput.trim());setPage(1);
  }
  async function forget(book:SavedPublicBook){
    if(!confirm(`Xóa bản lưu “${book.title}” và toàn bộ ghi chú trên trình duyệt này?`))return;
    await removePublicBook(book.id);await loadSaved();
  }
  return <div className="free-library">
    <header className="free-navbar"><Link className="free-logo" href="/"><span><BookHeart size={20}/></span>DocSach<em>WithMe</em></Link>
      <nav><Link href="/demo"><BookOpen size={16}/> Đọc PDF</Link><Link className="selected" href="/discover"><Globe2 size={16}/> Sách miễn phí</Link></nav>
    </header>
    <main className="free-main">
      <section className="free-hero"><div><span className="eyebrow"><span className="eyebrow-line"/> OPEN BOOKS · FREE TO EXPLORE</span>
        <h1>Những cuốn sách hay,<br/><em>đang đợi bạn khám phá.</em></h1>
        <p>Khám phá sách từ Project Gutenberg, đọc ngay trong DocSachWithMe và giữ lại những ý tưởng đáng nhớ. Không cần tài khoản hay API key.</p>
        <div className="free-hero-ornament">✳ &nbsp; READ · THINK · REMEMBER</div>
      </div><div className="free-hero-art" aria-hidden="true"><div className="free-art-circle"/><div className="free-art-book one"/><div className="free-art-book two"/><div className="free-art-book three"/><span>✦</span></div></section>
      <div className="free-tabs"><button className={tab==="discover"?"active":""} onClick={()=>setTab("discover")}><Globe2 size={17}/> Khám phá sách</button><button className={tab==="saved"?"active":""} onClick={()=>{setTab("saved");loadSaved()}}><LibraryBig size={17}/> Đang lưu trên thiết bị <span>{saved.length}</span></button></div>
      {tab==="discover"?<>
        <section className="free-filters">
          <form onSubmit={submit} className="free-search"><Search size={18}/><input value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder="Tìm tên sách hoặc tác giả, ví dụ: Jane Austen…" aria-label="Tìm sách"/><button type="submit">Tìm sách <ArrowRight size={15}/></button></form>
          <div className="free-filter-line"><label>Ngôn ngữ <select value={language} onChange={e=>{setLanguage(e.target.value);setPage(1)}}>{languages.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
            <div className="free-topic-pills">{topics.map(([value,label])=><button key={value} className={topic===value?"active":""} onClick={()=>{setTopic(value);setPage(1)}}>{label}</button>)}</div>
          </div>
        </section>
        <div className="free-heading"><div><span className="eyebrow">DIGITAL BOOKSHELF</span><h2>{query?`Kết quả cho “${query}”`:topic?"Theo chủ đề bạn chọn":"Được yêu thích nhất"}</h2></div><p>{selectedLanguage} · {results?.count?.toLocaleString("vi-VN")||"—"} kết quả từ thư viện</p></div>
        {error&&<div className="free-error"><p>{error}</p><a target="_blank" rel="noreferrer" href="https://www.gutenberg.org/">Mở Project Gutenberg <ExternalLink size={14}/></a></div>}
        {loading?<div className="free-loading"><LoaderCircle className="spin" size={26}/> Đang tìm những cuốn sách dành cho bạn…</div>:results?.results?.length?<div className="free-grid">{results.results.map(book=>{
          const cover=coverUrl(book),epub=epubUrl(book),readable=Boolean(plaintextUrl(book));
          return <article key={book.id} className="free-book-card">
            <div className="free-card-cover">{cover?<img loading="lazy" src={cover} alt={`Bìa sách ${book.title}`}/>:<div className="free-cover-placeholder"><BookText size={32}/><strong>{book.title}</strong></div>}
              {ids.has(book.id)&&<span className="free-saved-pill"><Check size={12}/> Đã lưu</span>}
            </div>
            <div className="free-card-content"><small>{book.languages.join(", ").toUpperCase()} · GUTENBERG #{book.id}</small><h3 title={book.title}>{book.title}</h3><p>{book.authors.map(a=>a.name).join(", ")||"Không rõ tác giả"}</p>
              <div className="free-card-actions">{readable?<Link href={`/discover/read/${book.id}`} className="free-read-button"><BookOpen size={15}/> {ids.has(book.id)?"Đọc tiếp":"Đọc ngay"}</Link>:<a className="free-read-button" href={gutenbergPage(book.id)} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Xem tại nguồn</a>}
                {epub?<a className="free-download-button" href={epub} target="_blank" rel="noreferrer" title="Tải EPUB từ Project Gutenberg"><Download size={16}/></a>:<a className="free-download-button" target="_blank" rel="noreferrer" href={gutenbergPage(book.id)} title="Xem các định dạng"><ExternalLink size={16}/></a>}</div>
            </div>
          </article>
        })}</div>:!error&&!loading?<div className="free-empty"><Search size={30}/><h3>Chưa tìm thấy cuốn sách phù hợp</h3><p>Thử tìm bằng tên tác giả, đổi chủ đề hoặc chọn một ngôn ngữ khác.</p></div>:null}
        {results&&!loading&&!error&&(results.hasPrevious||results.hasNext)&&<div className="free-pagination"><button disabled={!results.hasPrevious} onClick={()=>{setPage(p=>Math.max(1,p-1));window.scrollTo({top:350,behavior:"smooth"})}}><ChevronLeft size={17}/> Trước</button><span>Trang {page}</span><button disabled={!results.hasNext} onClick={()=>{setPage(p=>p+1);window.scrollTo({top:350,behavior:"smooth"})}}>Tiếp <ChevronRight size={17}/></button></div>}
      </>:<>
        <div className="free-heading"><div><span className="eyebrow">YOUR READING COLLECTION</span><h2>Sách bạn đã mở đọc</h2></div><p>Đã lưu trong trình duyệt này · {saved.length} cuốn</p></div>
        {saved.length?<div className="free-grid">{saved.map(book=><article key={book.id} className="free-book-card">
          <div className="free-card-cover">{book.cover?<img src={book.cover} alt={book.title}/>:<div className="free-cover-placeholder"><BookOpen size={29}/><strong>{book.title}</strong></div>}</div>
          <div className="free-card-content"><small>{book.language.toUpperCase()} · TRANG {book.page}/{book.document.totalPages}</small><h3>{book.title}</h3><p>{book.author}</p>
            <div className="free-progress"><span style={{width:`${Math.round(book.page/book.document.totalPages*100)}%`}}/></div>
            <div className="free-card-actions"><Link className="free-read-button" href={`/discover/read/${book.id}`}>Đọc tiếp <ArrowRight size={15}/></Link><button className="free-download-button" title="Xóa bản lưu trên thiết bị" onClick={()=>forget(book)}>×</button></div>
          </div>
        </article>)}</div>:<div className="free-empty"><LibraryBig size={31}/><h3>Chưa có cuốn sách nào được lưu</h3><p>Mở đọc một cuốn từ kho sách miễn phí. Sách và ghi chú sẽ được lưu trên thiết bị này.</p><button className="outline-button" onClick={()=>setTab("discover")}>Khám phá sách <ArrowRight size={15}/></button></div>}
      </>}
      <footer className="free-footer"><p>Danh mục: <a href="https://gutendex.com/" target="_blank" rel="noreferrer">Gutendex</a> · Nội dung sách: <a href="https://www.gutenberg.org/" target="_blank" rel="noreferrer">Project Gutenberg</a>. Trạng thái public domain căn cứ luật Hoa Kỳ; quyền sử dụng có thể khác tại quốc gia của bạn.</p><Link href="/">Về thư viện <ArrowRight size={14}/></Link></footer>
    </main>
  </div>;
}
