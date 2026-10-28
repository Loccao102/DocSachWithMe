import type { StudyCard } from "./flashcards";

const NAME="docsachwithme-study";
function db():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains("cards"))
        request.result.createObjectStore("cards",{keyPath:"id"});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
function transact<T>(mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  return db().then(database=>new Promise<T>((resolve,reject)=>{
    const tx=database.transaction("cards",mode);
    const request=fn(tx.objectStore("cards"));
    let value:T;
    request.onsuccess=()=>{value=request.result;};
    request.onerror=()=>reject(request.error);
    tx.oncomplete=()=>{database.close();resolve(value);};
    tx.onerror=()=>{database.close();reject(tx.error);};
    tx.onabort=()=>{database.close();reject(tx.error);};
  }));
}
export const listStudyCards=()=>transact<StudyCard[]>("readonly",s=>s.getAll());
export const putStudyCard=(card:StudyCard)=>transact<IDBValidKey>("readwrite",s=>s.put(card));
export const removeStudyCard=(id:string)=>transact<undefined>("readwrite",s=>s.delete(id));

/** Write imported cards in a single IndexedDB transaction. */
export async function putStudyCards(cards:StudyCard[]):Promise<void>{
  if(!cards.length)return;
  const database=await db();
  return new Promise<void>((resolve,reject)=>{
    const tx=database.transaction("cards","readwrite");
    const store=tx.objectStore("cards");
    for(const card of cards)store.put(card);
    tx.oncomplete=()=>{database.close();resolve();};
    tx.onerror=()=>{database.close();reject(tx.error);};
    tx.onabort=()=>{database.close();reject(tx.error);};
  });
}
