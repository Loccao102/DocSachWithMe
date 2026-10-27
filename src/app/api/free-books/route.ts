import { NextRequest, NextResponse } from "next/server";
import type { GutenbergList } from "@/lib/free-books";

const LANGUAGES=new Set(["en","vi","fr","de","es","it","ja","pt","zh","all"]);
const TOPICS=new Set(["","fiction","philosophy","psychology","science","history","children","poetry"]);
const UPSTREAM="https://gutendex.com/books";
export const revalidate=3600;

export async function GET(request:NextRequest){
  const search=request.nextUrl.searchParams;
  const language=search.get("lang")||"en";
  const topic=search.get("topic")||"";
  const query=(search.get("q")||"").trim().slice(0,100);
  const page=Math.max(1,Math.min(1000,Number(search.get("page"))||1));
  if(!LANGUAGES.has(language)||!TOPICS.has(topic))
    return NextResponse.json({error:"Bộ lọc không hợp lệ."},{status:400});
  const url=new URL(UPSTREAM);
  url.searchParams.set("copyright","false");
  url.searchParams.set("sort","popular");
  if(language!=="all")url.searchParams.set("languages",language);
  if(topic)url.searchParams.set("topic",topic);
  if(query)url.searchParams.set("search",query);
  url.searchParams.set("page",String(page));
  try{
    const result=await fetch(url.toString(),{next:{revalidate:3600},signal:AbortSignal.timeout(12000)});
    if(!result.ok)throw new Error(`Catalog error ${result.status}`);
    const payload=await result.json() as GutenbergList;
    // Only books classified public domain in the US. Other territories differ.
    const books=(payload.results||[]).filter(book=>book.copyright===false);
    return NextResponse.json({
      count:payload.count||0,hasNext:Boolean(payload.next),hasPrevious:Boolean(payload.previous),
      results:books
    },{headers:{"Cache-Control":"public, s-maxage=3600, stale-while-revalidate=86400"}});
  }catch{
    return NextResponse.json({error:"Kho sách đang tạm thời không kết nối được. Hãy thử lại hoặc mở Project Gutenberg."},{status:502});
  }
}
