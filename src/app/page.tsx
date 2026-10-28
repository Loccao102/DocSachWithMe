"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownUp, ArrowRight, BookHeart, BookOpen, BookText, Check, ChevronDown,
  CloudUpload, Compass, FileText, LibraryBig, LogOut, Plus, Search, Sparkles,
  Trash2, UploadCloud, Globe2, NotebookPen, X
} from "lucide-react";
import { AuthGate } from "@/components/AuthGate";
import { requireSupabase } from "@/lib/supabase";
import { extractPdf } from "@/lib/pdf";
import { extractEpub } from "@/lib/epub";
import type { Book, ReadingProgress } from "@/lib/types";

const colors = ["#9c766e", "#718578", "#9c8d6d", "#6c8292", "#b57e61", "#716f8a", "#8d7760"];

function BookCover({ book, large = false }: {book: Book;large?: boolean}) {
  return <div className={`book-cover ${large ? "large" : ""}`} style={{"--book-color": book.cover_color} as React.CSSProperties}>
    <div className="cover-top-rule" />
    <div className="cover-inner">
      <span className="cover-mini">DOCSACH · COLLECTION</span>
      <span className="cover-title">{book.title}</span>
      <span className="cover-author">{book.author || "Thư viện của tôi"}</span>
    </div>
    <div className="cover-ornament"><span/><BookOpen size={30} strokeWidth={1}/><span/></div>
  </div>;
}

function Library({ user }: { user: User }) {
  const router = useRouter();
  const [books, setBooks] = useState<Book[]>([]);
  const [progress, setProgress] = useState<Record<string, ReadingProgress>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "reading" | "finished">("all");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const client = requireSupabase();
    const [{ data: found, error }, { data: positions }] = await Promise.all([
      client.from("books").select("*").order("created_at", { ascending: false }),
      client.from("reading_progress").select("*")
    ]);
    if (error) { setUploadError(error.message); }
    setBooks((found || []) as Book[]);
    setProgress(Object.fromEntries(((positions || []) as ReadingProgress[]).map(item => [item.book_id, item])));
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const visibleBooks = useMemo(() => books.filter(book => {
    const q = search.trim().toLocaleLowerCase();
    const isMatch = !q || `${book.title} ${book.author || ""}`.toLocaleLowerCase().includes(q);
    const position = progress[book.id]?.percent || 0;
    return isMatch && (filter === "all" || (filter === "reading" && position > 0 && position < 100) || (filter === "finished" && position >= 100));
  }).sort((a,b) => sort === "name" ? a.title.localeCompare(b.title, "vi") : new Date(b.last_opened_at || b.created_at).getTime() - new Date(a.last_opened_at || a.created_at).getTime()), [books, search, filter, sort, progress]);

  const finished = books.filter(book => (progress[book.id]?.percent || 0) >= 100).length;
  const reading = books.filter(book => { const p=progress[book.id]?.percent || 0;return p > 0 && p < 100; }).length;

  function selectFile(next: File | null) {
    if (!next) return;
    const epub=next.name.toLowerCase().endsWith(".epub");
    const pdf=next.name.toLowerCase().endsWith(".pdf");
    if ((!epub&&!pdf) || next.size > (epub?35:50)*1024*1024) {
      setUploadError("Vui lòng chọn PDF tối đa 50MB hoặc EPUB tối đa 35MB."); return;
    }
    setFile(next);setTitle(next.name.replace(/\.(pdf|epub)$/i, "").replace(/[_-]/g," ").trim());setUploadError("");setUploadOpen(true);
  }

  async function upload() {
    if (!file || !title.trim() || uploading) return;
    setUploading(true);setUploadError("");setUploadProgress(2);setUploadMessage("Đang đọc và sắp xếp các trang sách…");
    const client = requireSupabase();
    const id = crypto.randomUUID();
    const isEpub=file.name.toLowerCase().endsWith(".epub");
    const path = `${user.id}/${id}.${isEpub?"epub":"pdf"}`;
    const textPath = `${user.id}/${id}.json`;
    let pdfUploaded = false, textUploaded = false;
    try {
      let documentData = null;
      let extractedAuthor=author.trim();
      let extractedTitle=title.trim();
      try {
        if(isEpub){
          const extracted=await extractEpub(file,(current,total)=>setUploadProgress(Math.round(5+current/total*65)));
          documentData=extracted.document;
          if(!extractedAuthor && extracted.author)extractedAuthor=extracted.author;
          if(extracted.title && extractedTitle===file.name.replace(/\.(pdf|epub)$/i, "").replace(/[_-]/g," ").trim())extractedTitle=extracted.title;
        } else {
          documentData=await extractPdf(file, (current,total) => setUploadProgress(Math.round(5 + current / total * 65)));
        }
      } catch (extractionError) {
        if(isEpub)throw extractionError;
        console.warn("PDF text extraction unavailable; original reader will still work:", extractionError);
      }
      setUploadMessage("Đang lưu sách vào thư viện cloud…"); setUploadProgress(74);
      const pdfResult = await client.storage.from("books").upload(path, file, { upsert: false, contentType: isEpub?"application/epub+zip":"application/pdf" });
      if (pdfResult.error) throw pdfResult.error;
      pdfUploaded = true;
      if (documentData) {
        const parsed = new Blob([JSON.stringify(documentData)], { type: "application/json" });
        const textResult = await client.storage.from("books").upload(textPath, parsed, { upsert: false, contentType: "application/json" });
        if (textResult.error) throw textResult.error;
        textUploaded = true;
      }
      setUploadProgress(92);setUploadMessage("Đang hoàn thiện kệ sách…");
      const { error } = await client.from("books").insert({
        id, owner_id: user.id, title: extractedTitle, author: (extractedAuthor || null),
        file_path: path, text_path: textUploaded ? textPath : null,
        total_pages: documentData?.totalPages || 0, word_count: documentData?.wordCount || 0,
        cover_color: colors[Math.floor(Math.random() * colors.length)]
      });
      if (error) throw error;
      setUploadProgress(100);setUploadOpen(false);setFile(null);setAuthor("");setTitle("");
      await reload();
      router.push(`/books/${id}`);
    } catch (err) {
      if (pdfUploaded) await client.storage.from("books").remove(textUploaded ? [path,textPath] : [path]);
      setUploadError(err instanceof Error ? err.message : "Không thể tải sách lên, vui lòng thử lại.");
    } finally { setUploading(false); }
  }

  async function removeBook(book: Book) {
    if (!window.confirm(`Xóa “${book.title}” cùng toàn bộ ghi chú và tiến độ đọc?`)) return;
    const client = requireSupabase();
    const { error: storageError } = await client.storage.from("books").remove([book.file_path, ...(book.text_path ? [book.text_path] : [])]);
    if (storageError) { window.alert(storageError.message); return; }
    const { error } = await client.from("books").delete().eq("id",book.id);
    if (error) window.alert(error.message); else await reload();
  }

  return <div className="app-shell">
    <aside className="library-sidebar">
      <div className="brand"><span className="brand-symbol"><BookHeart size={21} strokeWidth={1.7}/></span><span>DocSach<span className="brand-light">WithMe</span></span></div>
      <div className="sidebar-label">KHÔNG GIAN CỦA TÔI</div>
      <nav className="side-nav">
        <button className={filter==="all" ? "active" : ""} onClick={() => setFilter("all")}><LibraryBig size={18}/> Thư viện <span>{books.length}</span></button>
        <button className={filter==="reading" ? "active" : ""} onClick={() => setFilter("reading")}><BookOpen size={18}/> Đang đọc <span>{reading}</span></button>
        <button className={filter==="finished" ? "active" : ""} onClick={() => setFilter("finished")}><Check size={18}/> Đã hoàn thành <span>{finished}</span></button>
        <a className="side-explore-link" href="/discover"><Globe2 size={18}/> Sách miễn phí <span>↗</span></a><a className="side-explore-link" href="/knowledge"><NotebookPen size={18}/> Sổ tay tri thức <span>↗</span></a>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-quote"><Sparkles size={20}/><p>“Giữa những trang sách, ta tìm thấy những phiên bản khác của chính mình.”</p></div>
        <div className="account-footer"><span className="avatar">{(user.email || "R")[0].toUpperCase()}</span><div><strong>Góc đọc của tôi</strong><small title={user.email}>{user.email}</small></div><button title="Đăng xuất" onClick={() => requireSupabase().auth.signOut()}><LogOut size={17}/></button></div>
      </div>
    </aside>
    <main className="library-main">
      <header className="library-topbar">
        <div className="breadcrumb"><span>Không gian đọc</span><span className="breadcrumb-dot">/</span><strong>Thư viện</strong></div>
        <div className="topbar-actions"><span className="sync-label"><span className="online-dot"/> Cloud synced</span><button className="top-avatar" title={user.email}>{(user.email||"R")[0].toUpperCase()}</button></div>
      </header>
      <div className="library-content">
        <div className="library-hero">
          <div><div className="eyebrow"><span className="eyebrow-line"/> YOUR PERSONAL LIBRARY</div>
          <h1>Một góc nhỏ, <em>ngàn thế giới.</em></h1>
          <p>Tất cả những câu chuyện, ý tưởng và điều bạn muốn nhớ — ở đây.</p>
          <button className="primary-button" onClick={() => setUploadOpen(true)}><Plus size={18}/> Thêm một cuốn sách</button></div>
          <div className="hero-art" aria-hidden="true"><div className="art-halo"/><div className="hero-book b1"/><div className="hero-book b2"/><div className="hero-book b3"/><div className="hero-book b4"/><div className="hero-book b5"/><div className="art-spark">✳</div></div>
        </div>
        <div className="stats-strip">
          <div><span className="stat-icon lavender"><LibraryBig size={18}/></span><div><strong>{books.length.toString().padStart(2,"0")}</strong><small>Cuốn sách của bạn</small></div></div>
          <div><span className="stat-icon peach"><BookOpen size={18}/></span><div><strong>{reading.toString().padStart(2,"0")}</strong><small>Đang đọc dở</small></div></div>
          <div><span className="stat-icon mint"><Check size={18}/></span><div><strong>{finished.toString().padStart(2,"0")}</strong><small>Đã hoàn thành</small></div></div>
        </div>
        <div className="section-header"><div><span className="eyebrow">BOOKSHELF</span><h2>{filter==="all"?"Kệ sách của bạn":filter==="reading"?"Đọc tiếp câu chuyện":"Những cuốn đã đọc"}</h2></div><div className="library-controls"><div className="search-field"><Search size={17}/><input placeholder="Tìm tên sách, tác giả…" value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="sort-button" onClick={()=>setSort(sort==="recent"?"name":"recent")} title="Đổi cách sắp xếp"><ArrowDownUp size={17}/> {sort==="recent"?"Gần đây":"Tên A–Z"}</button></div></div>
        {loading ? <div className="empty-panel"><div className="loader"/><p>Đang tải kệ sách…</p></div> : visibleBooks.length ? <div className="books-grid">
          {visibleBooks.map(book => <div className="book-card" key={book.id}><button className="book-card-open" onClick={()=>router.push(`/books/${book.id}`)} aria-label={`Mở ${book.title}`}>
            <BookCover book={book}/>
            <strong>{book.title}</strong><span className="book-author">{book.author||"Chưa có tác giả"}</span>
            <div className="book-progress"><span><span style={{width:`${progress[book.id]?.percent || 0}%`}}/></span><small>{book.total_pages ? `${book.total_pages} trang` : "PDF gốc"} · {Math.round(progress[book.id]?.percent || 0)}%</small></div>
          </button><button className="book-delete" title="Xóa sách" onClick={()=>removeBook(book)}><Trash2 size={16}/></button></div>)}
          <button className="add-book-card" onClick={()=>setUploadOpen(true)}><span><Plus size={25}/></span><strong>Thêm cuốn sách mới</strong><small>PDF / EPUB</small></button>
        </div> : <div className="empty-panel"><div className="empty-icon"><BookText size={30}/></div><h3>{search?"Không tìm thấy cuốn sách nào":"Một kệ sách đang chờ được lấp đầy."}</h3><p>{search?"Thử tìm với từ khóa khác nhé.":"Tải lên cuốn PDF đầu tiên để bắt đầu trải nghiệm đọc thật khác."}</p><button className="outline-button" onClick={()=>setUploadOpen(true)}><Plus size={18}/> Thêm sách đầu tiên</button></div>}
        <footer className="library-footer"><span>Made for curious minds ✳</span><span>DocSachWithMe © 2026</span></footer>
      </div>
    </main>
    {uploadOpen && <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget && !uploading)setUploadOpen(false)}}><div className="upload-modal">
      <div className="modal-heading"><div><span className="eyebrow">NEW BOOK</span><h2>Thêm vào thư viện</h2></div><button className="icon-button" disabled={uploading} onClick={()=>setUploadOpen(false)}><X size={20}/></button></div>
      <div className={`dropzone ${file?"has-file":""}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();selectFile(e.dataTransfer.files[0])}} onClick={()=>!uploading && inputRef.current?.click()}>
        <input ref={inputRef} accept="application/pdf,application/epub+zip,.pdf,.epub" type="file" hidden onChange={e=>selectFile(e.target.files?.[0]||null)}/>
        <span><CloudUpload size={27}/></span><strong>{file ? file.name : "Kéo thả PDF hoặc EPUB vào đây"}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · Sẵn sàng tải lên` : "hoặc nhấp để chọn · PDF tối đa 50MB, EPUB tối đa 35MB"}</small>
      </div>
      <label className="modal-field">Tên cuốn sách <input disabled={uploading} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ví dụ: Nghệ thuật tư duy rõ ràng"/></label>
      <label className="modal-field">Tác giả <span>(không bắt buộc)</span><input disabled={uploading} value={author} onChange={e=>setAuthor(e.target.value)} placeholder="Tên tác giả"/></label>
      {uploading && <div className="upload-status"><div className="status-label"><span>{uploadMessage}</span><strong>{uploadProgress}%</strong></div><div className="progress-track"><span style={{width:`${uploadProgress}%`}}/></div></div>}
      {uploadError && <div className="error-banner">{uploadError}</div>}
      <button disabled={!file||!title.trim()||uploading} className="primary-button full modal-submit" onClick={upload}>{uploading?"Đang xử lý sách…":"Thêm vào thư viện"}<ArrowRight size={18}/></button>
      <p className="modal-footnote">Sách của bạn được lưu riêng tư trên cloud. PDF scan vẫn đọc được ở chế độ gốc.</p>
    </div></div>}
  </div>;
}
export default function HomePage() { return <AuthGate>{user=><Library user={user}/>}</AuthGate>; }
