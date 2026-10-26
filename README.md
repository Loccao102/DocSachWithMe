# DocSachWithMe 📚

Một **personal cloud reading workspace**: tải PDF lên, đọc trong giao diện ebook tùy chỉnh, ghi chú theo đoạn, lưu tiến độ và hỏi AI về nội dung sách. Thiết kế riêng cho người đọc bằng tiếng Việt.

## Có gì trong phiên bản đầu?

- 📚 Thư viện sách riêng tư trên Supabase Storage, tải PDF tối đa 50MB.
- 🪴 Giao diện web responsive, phù hợp desktop lẫn mobile.
- 📖 **Sách điện tử**: trích xuất văn bản PDF để đọc trong bố cục co giãn, chọn nền giấy ấm/trắng/tối, cỡ chữ và giãn dòng.
- 📄 **PDF gốc**: giữ nguyên trang gốc để đối chiếu hình ảnh, bảng biểu, công thức và sách scan.
- ✍️ Bôi đen đoạn văn để highlight ba màu, ghi chú; bookmark trang.
- ☁️ Lưu tiến độ đọc, highlight, bookmark và note trên cloud theo tài khoản.
- ✨ AI trả lời câu hỏi theo nội dung sách, tóm tắt phần hiện tại, giải thích đoạn được chọn và dẫn trang nguồn.
- 🔒 File ở bucket private, dữ liệu phân quyền RLS; AI endpoint xác minh Supabase access token.
- 🔑 Đăng nhập email magic link, không cần xây dựng hệ thống password.

> **Lưu ý bản đầu:** PDF có văn bản chọn được sẽ cho trải nghiệm ebook tốt hơn. PDF ảnh/scan, tài liệu nhiều cột hoặc bảng biểu có thể không trích xuất đúng thứ tự; hãy dùng PDF gốc. OCR nâng cao và tìm kiếm vector semantic là những phần có thể phát triển sau. Tìm kiếm AI hiện sử dụng trích đoạn từ sách, xếp hạng theo từ khóa và trang đang đọc — chưa dùng embeddings. AI có thể trả lời chưa chính xác nên hãy đối chiếu số trang nguồn.

## Deploy lên Vercel + Supabase

### Bước 1: Supabase

1. Tạo project tại [Supabase Dashboard](https://supabase.com/dashboard).
2. Vào **SQL Editor**, mở file `supabase/schema.sql` trong repository, dán toàn bộ SQL và **Run** một lần. Script tạo bốn bảng, RLS và bucket storage private tên `books`.
3. Vào **Project Settings → API** (hoặc **Connect → API Keys**) lấy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - **Publishable / anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Vào **Authentication → URL Configuration**:
   - Site URL: `https://<ten-project>.vercel.app`
   - Redirect URLs: thêm `https://<ten-project>.vercel.app/**` và `http://localhost:3000/**` khi phát triển local.
5. Email magic-link cần được bật trong **Authentication → Providers → Email**. Với dự án cá nhân, cân nhắc vô hiệu đăng ký công khai sau khi tạo tài khoản để tránh người lạ tự mở tài khoản.

Không bao giờ sử dụng Supabase **service_role** key trong trình duyệt hoặc đặt nó vào biến `NEXT_PUBLIC_*`.

### Bước 2: OpenAI (cho AI hỏi sách)

Lấy API key từ OpenAI Platform. Đặt vào biến môi trường `OPENAI_API_KEY` (chỉ phía server).
Có thể thay model bằng `OPENAI_MODEL`, mặc định `gpt-4.1-mini`.

Nếu chưa thêm `OPENAI_API_KEY`, thư viện và Reader vẫn hoạt động; nút hỏi AI sẽ báo cần cấu hình.

### Bước 3: Vercel

1. Vercel → **Add New → Project** → Import repo `Loccao102/DocSachWithMe`.
2. Framework Preset **Next.js**, Root Directory để mặc định, build command `npm run build`.
3. Thêm Environment Variables:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4.1-mini
   ```
4. Bấm **Deploy**. Nếu đã deploy trước khi thêm biến thì bấm **Redeploy** để áp dụng.
5. Mở URL Vercel, đăng nhập bằng email và thử tải một cuốn PDF văn bản.

Chỉ có `NEXT_PUBLIC_*` được gửi xuống client; `OPENAI_API_KEY` chỉ nằm trên server.

### Chạy local

```bash
npm install
cp .env.example .env.local
# Điền biến môi trường vào .env.local
npm run dev
```

Kiểm tra kiểu TypeScript: `npm run lint`. Kiểm tra build production: `npm run build`.

## Cách sử dụng

1. Chọn **Thêm một cuốn sách**, kéo thả PDF và nhập tên tác giả nếu muốn.
2. Hệ thống trích xuất và lưu nội dung đọc có cấu trúc cùng PDF gốc trong kho private của chính bạn.
3. Chọn **Sách điện tử** để đọc nội dung reflow; **PDF gốc** khi cần so với bản in.
4. Bôi đen một đoạn trong ebook → chọn màu highlight. Sidebar Ghi chú sẽ mở để bạn viết note.
5. Chọn **Hỏi AI** để tóm tắt, hỏi câu hỏi hoặc nhờ giải thích đoạn văn; chạm vào (trang N) trong câu trả lời để chuyển về nội dung tương ứng.
6. Tiến độ được tự lưu khi cuộn đọc/chuyển phần.

## Cấu trúc

```text
src/
  app/
    page.tsx                 # Thư viện và upload sách
    books/[id]/page.tsx      # Reader + note + AI
    api/ai/route.ts          # API AI xác thực người dùng, tra cứu tài liệu
    globals.css              # Giao diện responsive
  components/AuthGate.tsx    # Email magic link / auth
  lib/
    pdf.ts                   # Chuyển PDF thành các đoạn văn/trang
    retrieval.ts             # Tìm trích đoạn liên quan cho AI
    supabase.ts              # Supabase client
    types.ts                 # Dữ liệu book / note / progress
supabase/schema.sql          # Tables, policies, Storage
```

## Ghi chú kỹ thuật / hạn chế

- **Quyền riêng tư:** Mọi tệp đặt dưới `<user_id>/...` trong bucket `books`. Policies RLS chỉ cho chủ tài khoản xem/sửa/xóa. API AI xác minh người dùng và tải bản sách thông qua quyền chính người dùng, không dùng service key.
- **AI sử dụng nội dung sách:** Nội dung PDF được tải vào server trong lúc hỏi AI; chỉ trích đoạn phù hợp được gửi tới OpenAI. Tránh tải tài liệu không có quyền xử lý qua API bên thứ ba.
- **Hiệu năng:** Trích xuất PDF thực hiện ở trình duyệt lúc upload; sách cực dài có thể cần nhiều thời gian. Hiện chưa có queue hoặc background worker. Dữ liệu PDF vẫn được giữ nguyên để đọc gốc.
- **Ghi chú:** Anchor theo mã đoạn + trích đoạn chính xác; nhiều trường hợp văn bản có thể sai lệch nếu cấu trúc PDF quá phức tạp. Tính năng highlight hiện tối ưu cho đoạn chọn trong **một paragraph**.
- **Trích dẫn:** Các câu trả lời AI có số trang tham chiếu tới đoạn được trích xuất. Nên kiểm tra lại với bản PDF gốc ở những nội dung quan trọng.
- **Miễn phí:** Supabase, Vercel và OpenAI có giới hạn/quy định phí riêng. OpenAI API không miễn phí theo gói ChatGPT Plus.
- Repository có thể public, nhưng tuyệt đối không commit file `.env.local`, API key hoặc sách thuộc bản quyền lên GitHub. Tệp PDF được upload thẳng vào Supabase, không commit vào repo.

## Hướng phát triển

OCR cho PDF scan; ảnh minh họa, footnote và bảng trong reflow; embeddings/pgvector để tìm ý nghĩa sâu hơn; export Markdown; flashcard; đánh dấu và chú thích trên PDF gốc; liên kết ghi chú giữa nhiều sách; virtual rendering cho sách dài; quản lý phiên bản và sao lưu dữ liệu.
