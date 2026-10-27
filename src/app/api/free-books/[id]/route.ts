import { NextRequest, NextResponse } from "next/server";
import type { GutenbergBook } from "@/lib/free-books";
import { plaintextUrl } from "@/lib/free-books";
import { textToBookDocument } from "@/lib/gutenberg-text";

type Context={params:Promise<{id:string}>};
const validId=(value:string)=>/^\d{1,7}$/.test(value) && Number(value)>0;
export const runtime="nodejs";

async function getMetadata(id:string):Promise<GutenbergBook>{
  const response=await fetch(`https://gutendex.com/books/${id}`,{
    next:{revalidate:86400},signal:AbortSignal.timeout(11000)
  });
  if(!response.ok)throw new Error("Không thể lấy thông tin sách.");
  const book=await response.json() as GutenbergBook;
  if(!book || book.id!==Number(id))throw new Error("Không tìm thấy sách.");
  return book;
}

/** Only allow explicitly selected Gutenberg text resources; no arbitrary URL proxy. */
function approvedTextLink(value:string|null):URL|null{
  if(!value)return null;
  try{
    const uri=new URL(value);
    if(uri.protocol!=="https:" || !["www.gutenberg.org","gutenberg.org"].includes(uri.hostname)
      || uri.username || uri.password || uri.port || !/^\/(?:cache\/epub\/|files\/)/.test(uri.pathname))
      return null;
    return uri;
  }catch{return null;}
}

export async function GET(request:NextRequest,{params}:Context){
  const {id}=await params;
  if(!validId(id))return NextResponse.json({error:"Mã sách không hợp lệ."},{status:400});
  try{
    const book=await getMetadata(id);
    if(book.copyright!==false)
      return NextResponse.json({error:"Chưa có xác nhận sách thuộc phạm vi public domain tại Mỹ."},{status:403});
    if(request.nextUrl.searchParams.get("mode")!=="read")return NextResponse.json(book,{headers:{"Cache-Control":"public, s-maxage=86400"}});
    const src=approvedTextLink(plaintextUrl(book));
    if(!src)return NextResponse.json({error:"Sách không có bản TXT phù hợp để đọc trong ứng dụng. Bạn có thể mở sách tại nguồn."},{status:422});
    // Fetched only following an explicit user read action, never bulk-prefetched.
    const remote=await fetch(src.toString(),{
      cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(18000),
      headers:{"Accept":"text/plain"}
    });
    if(!remote.ok)throw new Error("Nguồn sách không trả về nội dung.");
    const size=Number(remote.headers.get("content-length")||0);
    if(size>2_500_000)return NextResponse.json({error:"Sách quá lớn cho trình đọc trực tuyến hiện tại. Hãy tải EPUB từ nguồn."},{status:413});
    const stream=remote.body?.getReader();
    if(!stream)throw new Error("Sách không có nội dung.");
    let total=0;
    const chunks:Uint8Array[]=[];
    while(true){
      const {done,value}=await stream.read();
      if(done)break;
      total+=value.byteLength;
      if(total>2_500_000){await stream.cancel();return NextResponse.json({error:"Sách vượt giới hạn dung lượng đọc trực tuyến."},{status:413});}
      chunks.push(value);
    }
    const bytes=new Uint8Array(total);
    let offset=0;
    for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
    const charset=remote.headers.get("content-type")?.match(/charset=([^;\s]+)/i)?.[1]||"utf-8";
    let content:string;
    try{content=new TextDecoder(charset).decode(bytes);}catch{content=new TextDecoder("utf-8").decode(bytes);}
    const document=textToBookDocument(content);
    return NextResponse.json({book,document},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Không đọc được sách từ nhà cung cấp."},{status:502});
  }
}
