import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {test} from "node:test";

const source=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
type WorkerTests={
  isDemoNavigation:(value:URL)=>boolean;
  isStaticAsset:(value:URL)=>boolean;
  canCacheResponse:(response:Response)=>boolean;
};

function createWorker(){
  const listeners:Record<string,(event:unknown)=>void>={};
  const self={
    location:{origin:"https://reader.test"},
    addEventListener:(name:string,handler:(event:unknown)=>void)=>{listeners[name]=handler;},
    skipWaiting:async()=>{},clients:{claim:async()=>{}}
  } as unknown as {__test?:WorkerTests};
  runInNewContext(source+"\nself.__test={isDemoNavigation,isStaticAsset,canCacheResponse};",{
    self,URL,Request,Response,Headers,fetch:async()=>new Response("ok"),
    caches:{open:async()=>({match:async()=>null,put:async()=>{}}),keys:async()=>[],delete:async()=>{}}
  });
  return {rules:self.__test!,listeners};
}

test("offline service worker has narrow demo navigation scope",()=>{
  const {rules}=createWorker();
  assert.equal(rules.isDemoNavigation(new URL("https://reader.test/demo?book=cloud-1")),true);
  assert.equal(rules.isDemoNavigation(new URL("https://reader.test/demo/")),true);
  for(const url of [
    "https://reader.test/","https://reader.test/books/secret",
    "https://reader.test/knowledge","https://reader.test/api/ai",
    "https://reader.test/discover/read/9","https://elsewhere.test/demo"
  ])assert.equal(rules.isDemoNavigation(new URL(url)),false,url);
});

test("offline asset cache accepts only same-origin Next static assets",()=>{
  const {rules}=createWorker();
  assert.equal(rules.isStaticAsset(new URL("https://reader.test/_next/static/chunks/app.js")),true);
  assert.equal(rules.isStaticAsset(new URL("https://reader.test/_next/static/css/main.css")),true);
  for(const url of [
    "https://reader.test/api/ai","https://reader.test/books/secret.pdf",
    "https://reader.test/_next/image?url=private",
    "https://reader.test/_next/data/account.json",
    "https://untrusted.test/_next/static/chunks/app.js"
  ])assert.equal(rules.isStaticAsset(new URL(url)),false,url);
});

test("fetch event never attempts to cache auth, API or range requests",()=>{
  const {listeners}=createWorker();
  const handler=listeners.fetch;
  for(const request of [
    new Request("https://reader.test/api/ai"),
    new Request("https://reader.test/books/id"),
    new Request("https://reader.test/_next/static/chunks/app.js",{headers:{Authorization:"Bearer private"}}),
    new Request("https://reader.test/_next/static/chunks/app.js",{headers:{Range:"bytes=0-100"}})
  ]){
    let intercepted=false;
    handler({request,respondWith:()=>{intercepted=true;}});
    assert.equal(intercepted,false,request.url);
  }
});

test("refuses invalid, redirected and failed asset responses",()=>{
  const {rules}=createWorker();
  assert.equal(rules.canCacheResponse(new Response("okay")),true);
  assert.equal(rules.canCacheResponse(new Response("fail",{status:500})),false);
  const redirected={ok:true,type:"basic",redirected:true} as Response;
  assert.equal(rules.canCacheResponse(redirected),false);
});
