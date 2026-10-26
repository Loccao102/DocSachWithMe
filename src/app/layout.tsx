import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocSachWithMe — Không gian đọc của bạn",
  description: "Thư viện sách cloud, đọc như ebook, ghi chú và trò chuyện cùng AI."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
