import type { SavedPublicBook } from "./free-books";
const DB_NAME="docsach-public-library";
const STORE="books";
function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE,{keyPath:"id"});
    };
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>resolve(request.result);
  });
}
async function execute<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode);
    const request=action(tx.objectStore(STORE));
    let output:T;
    request.onsuccess=()=>{output=request.result};
    request.onerror=()=>reject(request.error);
    tx.onerror=()=>{db.close();reject(tx.error)};
    tx.onabort=()=>{db.close();reject(tx.error)};
    tx.oncomplete=()=>{db.close();resolve(output)};
  });
}
export const listPublicBooks=()=>execute<SavedPublicBook[]>("readonly",s=>s.getAll());
export const getPublicBook=(id:number)=>execute<SavedPublicBook|undefined>("readonly",s=>s.get(id));
export const putPublicBook=(book:SavedPublicBook)=>execute<IDBValidKey>("readwrite",s=>s.put(book));
export const removePublicBook=(id:number)=>execute<undefined>("readwrite",s=>s.delete(id));
