/**
 * Prepare local demo for repeat offline visits.
 * Does not cache Supabase APIs, authenticated pages, signed URLs or user content.
 * Books remain in IndexedDB instead.
 */
export async function prepareDemoOffline():Promise<boolean>{
  if(typeof window==="undefined"||!window.isSecureContext||
    !("serviceWorker" in navigator))return false;
  const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/demo"});
  const ready=await navigator.serviceWorker.ready;
  const loaded=performance.getEntriesByType("resource").map(entry=>entry.name);
  const tagged=Array.from(document.querySelectorAll("script[src],link[href]")).map(element=>
    element instanceof HTMLScriptElement?element.src:
    element instanceof HTMLLinkElement?element.href:""
  );
  const paths=[...new Set([...loaded,...tagged])]
    .filter(url=>{
      try{
        const parsed=new URL(url,window.location.origin);
        return parsed.origin===window.location.origin&&
          parsed.pathname.startsWith("/_next/static/");
      }catch{return false;}
    });
  (ready.active||registration.active)?.postMessage({
    type:"CACHE_DEMO_ASSETS",urls:paths.slice(0,200)
  });
  return true;
}
