export type Book = {
  id: string;
  owner_id: string;
  title: string;
  author: string | null;
  file_path: string;
  text_path: string | null;
  total_pages: number;
  word_count: number;
  cover_color: string;
  created_at: string;
  last_opened_at: string | null;
};
export type BookBlock = {
  id: string;
  page: number;
  text: string;
  kind: "heading" | "paragraph";
};
export type BookPage = { page: number; blocks: BookBlock[] };
export type BookChapter = { title: string; page: number; blockId: string };
export type BookDocument = {
  version: 1;
  totalPages: number;
  wordCount: number;
  pages: BookPage[];
  toc: BookChapter[];
  analysis?: {
    scannedPages: number[];
    twoColumnPages: number[];
    tocSource: "pdf-outline" | "detected-headings" | "manual";
    warnings: string[];
  };
};
export type ReaderNote = {
  id: string;
  book_id: string;
  owner_id: string;
  block_id: string;
  quote: string;
  note: string;
  color: string;
  created_at: string;
};
export type ReadingProgress = {
  book_id: string;
  owner_id: string;
  block_id: string | null;
  page: number;
  percent: number;
  updated_at: string;
};
export type ReaderBookmark = {
  id: string;
  book_id: string;
  owner_id: string;
  block_id: string;
  page: number;
  created_at: string;
};
