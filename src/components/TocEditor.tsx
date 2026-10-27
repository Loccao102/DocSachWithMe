"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, BookOpen, Check, ListPlus, Pencil, Trash2, X } from "lucide-react";
import type { BookChapter, BookDocument } from "@/lib/types";

type Props = {
  document: BookDocument;
  onSave: (updated: BookDocument) => Promise<void>;
  onClose: () => void;
};

const cleanChapter = (title:string,page:number,document:BookDocument):BookChapter => ({
  title:title.trim().slice(0,110),
  page,
  blockId:document.pages[page-1]?.blocks[0]?.id||`p${page}-b0`
});

export default function TocEditor({document,onSave,onClose}:Props){
  const [entries,setEntries]=useState<BookChapter[]>(()=>document.toc.slice().sort((a,b)=>a.page-b.page));
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{setEntries(document.toc.slice().sort((a,b)=>a.page-b.page));},[document]);
  const add = () => setEntries(prev=>[...prev,{title:"Chương mới",page:1,blockId:document.pages[0]?.blocks[0]?.id||"p1-b0"}]);
  const update = (index:number,patch:Partial<BookChapter>)=>setEntries(prev=>prev.map((entry,i)=>i===index?{...entry,...patch}:entry));
  const remove = (index:number)=>setEntries(prev=>prev.filter((_,i)=>i!==index));
  const move = (index:number,direction:number)=>setEntries(prev=>{
    const result=prev.slice(),destination=index+direction;
    if(destination<0||destination>=result.length)return prev;
    [result[index],result[destination]]=[result[destination],result[index]];
    return result;
  });

  const save=async()=>{
    if(entries.length>150){setError("Mục lục chỉ hỗ trợ tối đa 150 mục.");return;}
    const normalized=entries.map(entry=>cleanChapter(entry.title,Number(entry.page),document));
    if(normalized.some(entry=>!entry.title || !Number.isInteger(entry.page) || entry.page<1 || entry.page>document.totalPages)){
      setError(`Hãy nhập tiêu đề và số trang hợp lệ từ 1 đến ${document.totalPages}.`);return;
    }
    if(new Set(normalized.map(item=>item.page)).size!==normalized.length){
      setError("Mỗi trang PDF chỉ được làm trang bắt đầu của một chương. Hãy gộp các mục trùng trang.");return;
    }
    setWorking(true);setError("");
    try{
      normalized.sort((a,b)=>a.page-b.page);
      await onSave({...document,toc:normalized,analysis:document.analysis?{...document.analysis,tocSource:"manual"}:undefined});
      onClose();
    }catch(err){setError(err instanceof Error?err.message:"Không thể lưu mục lục.");}
    finally{setWorking(false);}
  };

  return <div className="modal-overlay toc-overlay" onMouseDown={event=>{if(event.target===event.currentTarget&&!working)onClose()}}>
    <div className="toc-modal" role="dialog" aria-modal="true" aria-labelledby="toc-title">
      <div className="toc-modal-header"><div><span className="eyebrow">BOOK STRUCTURE</span><h2 id="toc-title">Chỉnh sửa mục lục</h2><p>Đặt lại tên và trang bắt đầu của từng chương theo PDF gốc. Không thay đổi nội dung, highlight hoặc ghi chú.</p></div>
      <button aria-label="Đóng" className="icon-button" disabled={working} onClick={onClose}><X size={19}/></button></div>
      <div className="toc-editor-list">
        {entries.length?entries.map((entry,index)=><div className="toc-editor-row" key={index}>
          <span className="toc-editor-index">{String(index+1).padStart(2,"0")}</span>
          <label className="toc-editor-title"><span>Tên chương</span><input maxLength={110} value={entry.title} onChange={e=>update(index,{title:e.target.value})} disabled={working} aria-label={`Tên chương ${index+1}`}/></label>
          <label className="toc-editor-page"><span>Trang PDF</span><input type="number" min={1} max={document.totalPages} value={entry.page} onChange={e=>update(index,{page:e.target.value===""?0:Number(e.target.value)})} disabled={working} aria-label={`Trang chương ${index+1}`}/></label>
          <button title="Đưa lên" disabled={working||index===0} onClick={()=>move(index,-1)}><ArrowUp size={15}/></button>
          <button title="Đưa xuống" disabled={working||index===entries.length-1} onClick={()=>move(index,1)}><ArrowDown size={15}/></button>
          <button title="Xóa mục này" disabled={working} onClick={()=>remove(index)}><Trash2 size={15}/></button>
        </div>):<div className="toc-editor-empty"><BookOpen size={22}/><p>Chưa có mục lục. Thêm chương để sách dễ điều hướng hơn.</p></div>}
      </div>
      {error&&<div className="error-banner" role="alert">{error}</div>}
      <div className="toc-modal-footer"><button className="outline-button" disabled={working||entries.length>=150} onClick={add}><ListPlus size={17}/> Thêm chương</button><div><button className="subtle-button" disabled={working} onClick={onClose}>Hủy</button><button className="primary-button" disabled={working} onClick={save}><Check size={17}/>{working?"Đang lưu…":"Lưu mục lục"}</button></div></div>
    </div>
  </div>;
}
