/* Local-only /demo shell cache.
 * Never cache account pages, signed files, APIs or remote origins.
 */
const CACHE_PREFIX="docsach-demo-";
const SHELL_CACHE=CACHE_PREFIX+"shell-v1";
const ASSETS_CACHE=CACHE_PREFIX+"assets-v1";
const SHELL_PATH="/demo";

function isDemoNavigation(url){
  return url.origin===self.location.origin &&
    (url.pathname==="/demo"||url.pathname==="/demo/");
}
function isStaticAsset(url){
  return url.origin===self.location.origin &&
    url.pathname.startsWith("/_next/static/") &&
    /\.(?:js|css|woff2?|mjs|png|svg|webp|ico)(?:$)/i.test(url.pathname);
}
function canCacheResponse(response){
  return response.ok&&(response.type==="basic"||response.type==="default")&&!response.redirected;
}

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    try{
      const response=await fetch(new Request(SHELL_PATH,{
        headers:{"Accept":"text/html"},credentials:"same-origin",cache:"reload"
      }));
      if(canCacheResponse(response)){
        const cache=await caches.open(SHELL_CACHE);
        await cache.put(SHELL_PATH,response);
      }
    }catch{/* Offline at install: retry on next navigation. */}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(CACHE_PREFIX) &&
      name!==SHELL_CACHE&&name!==ASSETS_CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET"||request.headers.has("Authorization")||
    request.headers.has("Range"))return;
  const url=new URL(request.url);
  if(isStaticAsset(url)){
    event.respondWith((async()=>{
      const cache=await caches.open(ASSETS_CACHE);
      const existing=await cache.match(request);
      if(existing)return existing;
      const response=await fetch(request);
      if(canCacheResponse(response))await cache.put(request,response.clone());
      return response;
    })());
    return;
  }
  if(request.mode==="navigate"&&isDemoNavigation(url)){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(canCacheResponse(response)){
          const cache=await caches.open(SHELL_CACHE);
          // Canonical cache key: don't persist book IDs or query parameters.
          await cache.put(SHELL_PATH,response.clone());
        }
        return response;
      }catch{
        const cached=await caches.match(SHELL_PATH);
        if(cached)return cached;
        return new Response("Không có bản giao diện offline. Hãy mở /demo khi có mạng.",{
          status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}
        });
      }
    })());
  }
});

self.addEventListener("message",event=>{
  if(event.data?.type!=="CACHE_DEMO_ASSETS"||!Array.isArray(event.data.urls))return;
  event.waitUntil((async()=>{
    const cache=await caches.open(ASSETS_CACHE);
    const urls=[...new Set(event.data.urls)].slice(0,200);
    let cached=0;
    for(const raw of urls){
      if(typeof raw!=="string"||raw.length>2000)continue;
      let url;
      try{url=new URL(raw,self.location.origin);}catch{continue;}
      if(!isStaticAsset(url))continue;
      try{
        const response=await fetch(url.toString(),{credentials:"same-origin",cache:"force-cache"});
        if(canCacheResponse(response)){await cache.put(url.toString(),response);cached++;}
      }catch{/* A missing chunk should not break reading. */}
    }
    // Do not claim full offline support; future lazy-loaded workers may still need network.
    if(event.source && "postMessage" in event.source)
      event.source.postMessage({type:"DEMO_ASSETS_CACHED",count:cached});
  })());
});
