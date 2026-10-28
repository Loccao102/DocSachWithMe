import type { BookDocument } from "./types";

export type DemoNote = {
  id: string; blockId: string; page: number; quote: string; content: string; color: "yellow"|"green"|"pink"; createdAt: string;
};
export type DemoBook = {
  id: string; title: string; author: string; createdAt: string; pdf: Blob; document: BookDocument|null;
  page: number; bookmarks: number[]; notes: DemoNote[]; format?: "pdf" | "epub";
};
const DATABASE="docsachwithme-preview";
const STORE="books";
function openDatabase():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:"id"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function transact<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);
    const req=operation(tx.objectStore(STORE));
    let result:T;
    req.onsuccess=()=>{result=req.result;};
    req.onerror=()=>reject(req.error);
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onerror=()=>{db.close();reject(tx.error);};
    tx.onabort=()=>{db.close();reject(tx.error);};
  });
}
export const listDemoBooks=()=>transact<DemoBook[]>("readonly",s=>s.getAll());
export const getDemoBook=(id:string)=>transact<DemoBook|undefined>("readonly",s=>s.get(id));
export const saveDemoBook=(book:DemoBook)=>transact<IDBValidKey>("readwrite",s=>s.put(book));
export const deleteDemoBook=(id:string)=>transact<undefined>("readwrite",s=>s.delete(id));
