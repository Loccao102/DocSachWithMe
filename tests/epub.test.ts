import assert from "node:assert/strict";
import {test} from "node:test";
import {zipSync, strToU8} from "fflate";
import {checkEpubZip, resolveEpubPath} from "../src/lib/epub";

test("resolves EPUB chapter paths and blocks escaping the package",()=>{
  assert.equal(resolveEpubPath("OEBPS/content.opf","Text/chapter%201.xhtml"),"OEBPS/Text/chapter 1.xhtml");
  assert.equal(resolveEpubPath("OPS/Package/content.opf","../chapters/one.xhtml#top"),"OPS/chapters/one.xhtml");
  assert.throws(()=>resolveEpubPath("content.opf","../../outside.xhtml"),/ngoài sách/);
  assert.throws(()=>resolveEpubPath("OPS/content.opf","https://example.com/chapter.xhtml"),/đường dẫn ngoài/);
});

test("validates EPUB ZIP central directory before decompression",()=>{
  const archive=zipSync({"mimetype":strToU8("application/epub+zip"),"META-INF/container.xml":strToU8("<container/>")});
  assert.doesNotThrow(()=>checkEpubZip(archive));
  assert.throws(()=>checkEpubZip(strToU8("not a zip")),/ZIP hợp lệ/);
});

test("rejects oversized EPUB files before allocating decompression buffers",()=>{
  const big=new Uint8Array(35*1024*1024+1);
  assert.throws(()=>checkEpubZip(big),/35MB/);
});
