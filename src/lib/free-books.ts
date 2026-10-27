import type { BookDocument } from "./types";

export type GutenbergBook = {
  id: number;
  title: string;
  authors: { name: string; birth_year?: number|null; death_year?: number|null }[];
  summaries?: string[];
  subjects: string[];
  languages: string[];
  copyright: boolean|null;
  formats: Record<string,string>;
  download_count: number;
};
export type GutenbergList = { count: number; next: string|null; previous: string|null; results: GutenbergBook[] };
export type PublicNote = {
  id: string; blockId: string; quote: string; page: number;
  color: "yellow"|"green"|"pink"; content: string; createdAt: string;
};
export type SavedPublicBook = {
  id: number; title: string; author: string; language: string; cover: string|null;
  updatedAt: string; page: number; bookmarks: number[];
  notes: PublicNote[]; document: BookDocument;
};
export const gutenbergPage=(id:number)=>`https://www.gutenberg.org/ebooks/${id}`;

export function findFormat(book:GutenbergBook, prefix:string):string|null {
  const formats=Object.entries(book.formats||{});
  const found=formats.find(([mime,url])=>mime.startsWith(prefix) && /^https:\/\//.test(url));
  return found?.[1]||null;
}
export function plaintextUrl(book:GutenbergBook):string|null {
  const items=Object.entries(book.formats||{}).filter(([mime])=>mime.startsWith("text/plain"));
  const preferred=items.find(([mime])=>mime.includes("utf-8"))||items[0];
  return preferred?.[1]||null;
}
export function coverUrl(book:GutenbergBook):string|null {
  return book.formats?.["image/jpeg"]||null;
}
export function epubUrl(book:GutenbergBook):string|null {
  const files=Object.entries(book.formats||{});
  return files.find(([mime,url])=>mime.startsWith("application/epub+zip") && !/noimages/i.test(url))?.[1]
    || files.find(([mime])=>mime.startsWith("application/epub+zip"))?.[1]||null;
}
