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

## Test chức năng khi chưa cấu hình Supabase

Mở `/demo` trên website (ví dụ `https://ten-project.vercel.app/demo`). Chế độ này chạy **100% trong trình duyệt**:

- Upload một hoặc nhiều PDF vào IndexedDB của thiết bị đang dùng (tối đa 50MB/file).
- Đọc ebook (reflow), chuyển PDF gốc, tăng giảm cỡ chữ, đổi nền, giãn dòng.
- Highlight, thêm/xóa/sửa ghi chú, bookmark trang, tìm kiếm trong sách.
- Xuất ghi chú Markdown, đọc tiếp từ trang đã lưu trên cùng trình duyệt.
- Chế độ tập trung: phím `F`; tìm kiếm nhanh: phím `/`; chuyển trang demo: `Alt+←/→`.

Dữ liệu ở `/demo` **không đồng bộ** với tài khoản cloud và có thể mất khi xóa dữ liệu trình duyệt. Đây là sandbox thử các chức năng, không thay thế thư viện online. Khi bạn nhập biến môi trường Supabase, trang `/` sẽ sử dụng kho lưu trữ cloud đúng như thiết kế.

## Các tiện ích mới trong Reader cloud

- Tìm kiếm nội dung PDF văn bản và nhảy tới đoạn khớp (phím `/`).
- Chế độ đọc tập trung (phím `F`, `Esc` để thoát).
- Đi tới phần trước/tiếp theo với `Alt+←/→`.
- Ghi nhớ chủ đề, cỡ chữ và giãn dòng trên trình duyệt.
- Xuất ghi chú, trích đoạn và bookmark thành Markdown.
- Sao chép đoạn văn được chọn.

## Bổ sung: nghe đọc, nhảy trang và sao lưu sách

### Nghe đọc bằng giọng trình duyệt

Trong Reader cloud và `/demo`, bấm biểu tượng **loa** để đọc nội dung văn bản của trang hiện tại.
Có thể **tạm dừng/tiếp tục**, **dừng hẳn** và chỉnh tốc độ `0.8× – 1.5×`. Đoạn đang được đọc được đánh dấu trong ebook.
Chức năng dùng Web Speech API tích hợp sẵn, không tốn OpenAI token; giọng đọc và hỗ trợ tiếng Việt phụ thuộc trình duyệt/hệ điều hành. Không dùng được với PDF scan chưa trích xuất văn bản.

### Chuyển tới trang cụ thể

Reader cloud có thanh chuyển trang trực tiếp; `/demo` có ô nhập số trang ở thanh công cụ dưới.
Nhập số trang và nhấn **Enter** hoặc dùng nút trước/sau. Số trang tính theo PDF gốc (khác trang in ở đầu sách).
Chế độ ebook và PDF gốc có thể chuyển qua lại.

### Sao lưu dữ liệu /demo mà không cần cloud

Ở danh sách sách `/demo`, bấm biểu tượng **tải xuống** trên bìa sách để xuất file `.dswm.zip` chứa:

- PDF gốc.
- Văn bản đã trích xuất / metadata.
- Trang đang đọc, highlight, bookmark và ghi chú.

Dùng nút **Khôi phục sao lưu** để tải lại ZIP trên máy khác. Nhập lại sẽ tạo bản sao sách mới, không ghi đè bản đã có.
Nên tự lưu ZIP ở chỗ an toàn vì xóa dữ liệu trình duyệt có thể làm mất thư viện local.
Mỗi bản sao lưu hỗ trợ PDF tối đa 50MB, ZIP nhập lại không quá 100MB.

**Lưu ý:** tính năng sao lưu ZIP này dành cho `/demo`, không tự chuyển dữ liệu sang Supabase. Sau khi cấu hình cloud, dùng thư viện chính tại `/`.

## PDF → ebook: xử lý cấu trúc v2

Các file upload mới sẽ được phân tích thêm:
- Ưu tiên mục lục PDF có sẵn (outline / bookmarks) nếu có đủ mục hợp lệ, giữ số trang gốc.
- Thử phát hiện văn bản **hai cột** và sắp xếp thứ tự đọc từng cột, tránh trộn dòng hai bên.
- Phân nhóm dòng thành đoạn, nối các từ bị ngắt bởi dấu gạch nối cuối dòng.
- Loại các mẫu đầu/cuối trang lặp lại và số trang đơn giản ra khỏi bản ebook.
- Ghi nhận các trang thiếu text để thông báo khi cần xem PDF gốc hoặc OCR.
- Biểu tượng **bút chì cạnh Mục lục** mở trình chỉnh chương: thêm/xóa/đổi tên, đặt lại trang bắt đầu và lưu vào sách.
- Trình chỉnh mục lục hoạt động ở `/demo` và với sách trên Supabase Storage sau khi đăng nhập. Không làm thay đổi các đoạn văn hoặc ghi chú đã lưu.

**Giới hạn:** Các PDF đa cột phức tạp, hình ảnh, bảng biểu, footnote và sách scan chưa được chuyển đổi hoàn hảo. Phân tích layout là heuristic, bạn nên so lại PDF gốc. Các sách đã upload từ phiên bản trước không tự reprocess; có thể upload lại hoặc chỉnh mục lục thủ công để có cấu trúc tốt hơn.

## Sách miễn phí — Project Gutenberg + Gutendex

Vào **/discover** (hoặc mục **Sách miễn phí** trong thư viện). Tính năng **không cần Supabase hoặc OpenAI API key**:

- Dùng [Gutendex](https://github.com/garethbjohnson/gutendex) để tìm sách theo tác giả, tên, ngôn ngữ, chủ đề, mức phổ biến. Trình lọc dùng `copyright=false`, tức tác phẩm được ghi nhận thuộc public domain tại Hoa Kỳ.
- Hiển thị bìa, tác giả, ngôn ngữ, trạng thái đã lưu, phân trang tìm kiếm.
- Chọn **Đọc ngay** để nạp bản văn thuần (plain text) từ Project Gutenberg vào Reader của DocSachWithMe. Việc tải chỉ xảy ra khi người dùng chủ động mở sách, không tải hàng loạt.
- Trình đọc có tùy chọn typography, chủ đề giấy ấm/trắng/tối, tìm trong sách, mục lục trích từ text, bookmark, highlight, ghi chú, giọng đọc và xuất ghi chú Markdown.
- Lưu nội dung và tiến độ trong IndexedDB để đọc lại trên cùng trình duyệt, không cần gọi API lần nữa nếu đã lưu.
- Bấm biểu tượng **EPUB** để tải bản gốc từ nguồn; có nút mở sách trực tiếp tại website Project Gutenberg.
- Nếu sách không có bản TXT phù hợp, nhà cung cấp từ chối kết nối hoặc dung lượng vượt giới hạn đọc online, có đường dẫn mở **nguồn gốc**. Sách quá lớn không được tải qua server.

**Bản quyền:** Project Gutenberg và Gutendex phân loại public domain theo luật Hoa Kỳ. Nội dung *không mặc nhiên* tự do sử dụng ở Việt Nam hoặc quốc gia khác; tự kiểm tra trước khi tải, lưu, chia sẻ hay phân phối. Đọc thêm https://www.gutenberg.org/policy/terms_of_use.html.

**Tài nguyên và riêng tư:** API catalog được cache (1 giờ); metadata từng sách cache (1 ngày). Trên Vercel, server chỉ tải tài nguyên `text/plain` qua URL HTTPS thuộc Project Gutenberg, với giới hạn 2,5 MB và chỉ khi người dùng chủ động mở sách. Dữ liệu đọc đã tải về sẽ được lưu trên thiết bị, không tự nhập vào Supabase; sách tải về không được commit lên GitHub. Kho này khác với PDF cloud và `/demo`.

**Ghi chú API:** Gutendex là dịch vụ cộng đồng, không phải API chính thức của Project Gutenberg. Nếu Gutendex gián đoạn, có thể dùng trang Gutenberg trực tiếp; việc tải văn bản từ Gutenberg có thể bị giới hạn tùy chính sách nguồn. Đọc sách online qua Gutendex **chỉ** dùng metadata; văn bản đến từ Gutenberg.

## EPUB trực tiếp — thư viện đọc được PDF và EPUB

Từ phiên bản mới, bạn có thể kéo thả **EPUB (tối đa 35MB)** vào `/demo` hoặc thư viện cloud khi đã cấu hình Supabase. Đây là sách có thể đọc kiểu *reflow*: trang, đoạn văn và chương được dàn lại phù hợp độ rộng màn hình, highlight, ghi chú, tìm kiếm, nghe sách và chỉnh typography.

- `src/lib/epub.ts` đọc EPUB3/EPUB2 với OPF spine và các tệp XHTML; nhận diện tên sách, tác giả và mục lục theo thứ tự chương.
- HTML của EPUB chỉ được **đọc textContent**, không nhúng JavaScript, CSS hay iframe từ EPUB vào website.
- Trước khi giải nén, trình đọc kiểm tra ZIP central directory và giới hạn tổng dung lượng giải nén nhằm giảm rủi ro từ file nén bất thường.
- Trên `/demo`, file gốc và ghi chú được lưu trong IndexedDB; chức năng ZIP backup sẽ giữ đúng định dạng `book.epub`, và các bản sao lưu PDF cũ vẫn có thể khôi phục.
- Trên cloud, EPUB được lưu ở bucket `books` private, metadata đọc ở dạng JSON như PDF. Có nút tải lại EPUB gốc ở Reader.
- Nếu project Supabase đã tạo bucket từ phiên bản trước, **chạy** `supabase/migrations/20261028_add_epub.sql` trong SQL Editor trước khi upload EPUB. Project mới chỉ cần chạy `supabase/schema.sql`.
- File EPUB mở ở **Ebook Mode**, không có trình PDF gốc. Phần hình ảnh, footnote, bảng, CSS đặc biệt, công thức và mục lục EPUB nhiều cấp có thể chưa giữ được đầy đủ. Với sách có bản quyền, chỉ tải và xử lý bản sao mà bạn được phép sử dụng.

Để dùng ngay mà không cần cloud: mở `/demo` → **Thêm sách PDF / EPUB** → chọn file → đọc và ghi chú. File được lưu trên thiết bị hiện tại; không tự đồng bộ giữa các thiết bị.

## Không gian tri thức chung — /knowledge

Mở `/knowledge` từ thư viện chính, `/demo` hoặc mục **Sổ tay** trên thanh điều hướng. Tính năng này **không cần AI API key**.

- Tự tổng hợp các highlight/ghi chú đang lưu trên trình duyệt từ PDF & EPUB (`/demo`) và sách Gutenberg (`/discover`).
- Nếu bạn đã cấu hình Supabase và đăng nhập, trang cũng đọc ghi chú trong `reader_notes` và tên sách từ `books` bằng quyền RLS hiện có (chỉ sách của chủ tài khoản).
- Tìm kiếm không dấu tiếng Việt trong tiêu đề, tác giả, đoạn trích và nội dung note; lọc nguồn.
- Xuất một bản Markdown của toàn bộ ghi chú đang lọc, nhóm theo từng cuốn sách.
- **Về đoạn sách:** từ mỗi note, nhấn mở lại đúng cuốn và trang/đoạn được đánh dấu (dữ liệu phải còn trên trình duyệt hoặc tài khoản cloud).
- Tạo flashcard từ ghi chú đã có, hoặc tự viết câu hỏi và câu trả lời. AI không cần tham gia.
- Học theo lịch giãn cách (spaced repetition): chọn Học lại, Khó, Nhớ được hoặc Dễ; hệ thống tính lại ngày ôn. Nếu quên, thẻ trở lại sau 10 phút.
- Flashcard lưu qua IndexedDB trên thiết bị hiện tại, **không đồng bộ với Supabase**. Bạn không nên xóa dữ liệu trình duyệt nếu chưa có bản sao riêng.

Cụ thể, có thể dùng `/demo` → highlight → viết ghi chú → mở `/knowledge` → **Tạo flashcard** → ôn tập.

Giới hạn: sổ tay từ sách local và Gutenberg chỉ xuất hiện trên **đúng trình duyệt/thiết bị** nơi đã lưu chúng. Trong tương lai có thể bổ sung sync và backup riêng cho flashcard. Đường dẫn tới đoạn sách trong bản EPUB/PDF được neo theo mã đoạn tại thời điểm import; nếu upload lại sách và hệ thống trích xuất khác, neo cũ có thể không còn tương ứng.

### Sao lưu flashcard

Trong tab **Flashcard & ôn tập** của `/knowledge`, dùng nút **Sao lưu** để tải file `docsachwithme-flashcards.json`; dùng **Khôi phục** để nhập lại ở một trình duyệt khác.

Bản sao lưu giữ câu hỏi/đáp án, nguồn tham khảo, ngày ôn, số lần ôn và độ dễ. Khi khôi phục, thẻ được nhập thành bản sao mới để tránh ghi đè. Dữ liệu JSON tối đa 2MB, tối đa 5.000 thẻ/lần nhập. Đây là bản sao lưu flashcard riêng biệt; nó **không** chứa PDF, EPUB hoặc nội dung sách gốc.


## OCR PDF scan ngay trên thiết bị

Trong trang /demo, mở PDF có trang scan và nhấn **Nhận dạng OCR** (biểu tượng quét chữ ở thanh công cụ hoặc sidebar). Trình duyệt render trang bằng PDF.js, nhận dạng tiếng Việt và tiếng Anh bằng Tesseract.js. Chạy tối đa 8 trang mỗi lượt.

- Tính năng chỉ chạy khi người dùng xác nhận, không tự nhận dạng toàn bộ sách.
- Lần đầu cần tải WebAssembly và dữ liệu ngôn ngữ từ mạng; nội dung PDF không gửi tới API OCR.
- Text OCR được lưu với sách trong IndexedDB và dùng trong ebook, tìm kiếm, nghe đọc và highlight. Bản sao lưu ZIP cũng bao gồm nội dung mới.
- PDF gốc được giữ nguyên; kết quả có thể không chuẩn với scan mờ, nhiều cột hay bảng.
- Nếu còn trang thiếu chữ, tiếp tục OCR theo từng nhóm; hiện chỉ hỗ trợ /demo, chưa tự cập nhật PDF trên cloud.


## Sao lưu flashcard riêng tư lên Supabase

Trong /knowledge → Flashcard & ôn tập, khi đã cấu hình Supabase và đăng nhập vào tài khoản, sử dụng:

- **Lưu cloud**: xuất toàn bộ thẻ hiện có trên thiết bị thành bản sao lưu JSON riêng tư ở đường dẫn `<user-id>/flashcards-v1.json` trong bucket books, có xác nhận trước khi ghi đè.
- **Tải cloud**: khôi phục bản sao lưu về IndexedDB trên thiết bị. ID thẻ được giữ nguyên; thẻ cùng ID sẽ chọn lần ôn cập nhật gần nhất, vì vậy khôi phục lặp lại không nhân bản thẻ.

Tính năng dùng chính bucket Storage private đã khai báo trong supabase/schema.sql, không cần migration mới, không cần OpenAI API key. Chỉ tài khoản có quyền theo RLS mới truy cập được. **Đây là sao lưu/khôi phục chủ động, không phải đồng bộ tự động hoặc cộng tác.** Xóa một thẻ trên thiết bị không tự xóa bản cloud cũ; muốn bản cloud phản ánh các thao tác xóa, hãy bấm Lưu cloud lần nữa.

Trước khi đăng nhập tài khoản khác trên cùng một trình duyệt, hãy cân nhắc tách dữ liệu local hoặc dùng profile trình duyệt riêng: bộ flashcard trên IndexedDB là của thiết bị, không tự phân vùng theo người dùng Supabase.


## OCR cho sách PDF lưu trên Supabase (cloud reader)

Khi đã đăng nhập, mở một cuốn PDF từ thư viện cloud. Nếu sách là PDF scan hoặc còn trang thiếu text, nút **Nhận dạng văn bản OCR** xuất hiện ở thanh công cụ và sidebar.

- Người đọc chủ động xác nhận mỗi lượt; OCR xử lý tối đa 8 trang thiếu chữ trên trình duyệt. Bộ ngôn ngữ Tesseract.js (vie/eng) có thể cần tải từ Internet lần đầu, nhưng ảnh trang PDF không được gửi tới dịch vụ OCR.
- PDF gốc được tải từ Supabase Storage private bằng phiên đăng nhập hiện tại và **giữ nguyên**. Chỉ JSON văn bản OCR cập nhật trong cùng bucket private, theo thư mục chủ tài khoản.
- Từ trang đã nhận dạng, người đọc có thể tìm kiếm, nghe đọc, highlight, ghi chú hoặc hỏi AI theo trích đoạn (khi có đủ từ).
- Các trang PDF không trích xuất được text ở thời điểm upload cũng có thể nhận dạng, vì trình đọc có thể dựng cấu trúc trang từ PDF gốc. Không cần chạy SQL migration mới.
- Khi lưu, hệ thống đọc lại bản JSON mới nhất để giữ mục lục và các trang đã OCR từ thiết bị khác; những đoạn đã có neo ghi chú OCR không bị ghi đè. **Không phải collaborative editing với khóa phiên bản tuyệt đối**: tránh xử lý cùng một cuốn ở hai thiết bị cùng lúc.
- Nếu OCR không đọc được chữ, thử scan có độ phân giải tốt hơn; PDF có bảng, chữ viết tay hoặc scan mờ vẫn có thể cho kết quả sai. Bản gốc luôn dùng được để đối chiếu.
- OCR chưa hỗ trợ EPUB vì EPUB có sẵn nội dung văn bản. Tệp sách 50 MB cần được tải xuống trình duyệt để xử lý OCR, nên kết nối và bộ nhớ thiết bị có thể ảnh hưởng tốc độ.

## Sổ tay tri thức — lọc theo sách và xuất Excel

Tại `/knowledge`, bạn có thể tìm bằng nhiều từ tiếng Việt, không phân biệt dấu hay chữ hoa/thường (ví dụ `dao duc`, `tu duy sach`). Các từ khóa cách nhau được tìm cùng lúc; đặt trong dấu ngoặc kép để giữ nguyên một cụm chính xác. Sổ tay có bộ lọc theo nguồn và từng cuốn sách (không trộn các bản sách local/cloud trùng tên).

Hai định dạng xuất dữ liệu:
- **Markdown:** văn bản ghi chú theo từng cuốn sách như trước.
- **CSV:** chứa nguồn, sách, tác giả, trang, trích dẫn, ghi chú, ngày lưu, đường dẫn gốc để nhập vào Excel/Google Sheets. File có BOM UTF-8 để hạn chế lỗi tiếng Việt. Giá trị bắt đầu bằng cú pháp bảng tính nguy hiểm sẽ được chuyển thành text để tránh thực thi công thức khi mở file.

Việc xuất chỉ lấy các ghi chú đang khớp bộ lọc, thực hiện trên trình duyệt; không tải dữ liệu lên bên thứ ba.


## OCR nhiều lượt cho sách scan dài

Đối với PDF có trên 8 trang cần OCR, mỗi lần bấm **Nhận dạng OCR** xử lý tối đa 8 trang, rồi lưu vị trí trang cuối đã thử. Lần tiếp theo ưu tiên nhóm trang **sau** vị trí đó, kể cả khi nhóm trước có trang trắng hoặc scan quá mờ nên nhận dạng không thành công. Khi đến cuối sách, hệ thống quay vòng tới các trang còn thiếu. Chuyển sang cuốn khác sẽ đặt lại vị trí OCR. Điều này giúp hoàn thành từng phần của sách dài mà không bị mắc kẹt ở trang đầu; không phải xử lý tự động liên tục trong nền.

## Sao chép sách từ cloud về thư viện trên thiết bị

Trong Reader đã đăng nhập (`/books/[id]`), chọn biểu tượng tải về thiết bị hoặc nút **Lưu bản offline** ở thanh bên trái. Ứng dụng tải PDF/EPUB gốc từ bucket `books` private theo phiên đăng nhập, cùng nội dung ebook/OCR, ghi chú, highlight, trang đánh dấu và trang đang đọc, rồi lưu một bản độc lập vào IndexedDB trong `/demo`. Không cần schema Supabase mới.

- Một cuốn cloud có ID ổn định `cloud-<book-id>` ở thư viện thiết bị. Nếu đã có bản sao, hệ thống **yêu cầu xác nhận trước khi ghi đè**, vì thay đổi local sẽ bị thay thế. Có thể sao lưu ZIP từ `/demo` trước.
- Chỉ nhận sách thuộc tài khoản hiện tại; ghi chú và bookmark lạc sang tài khoản khác không được sao chép. Note đã được OCR giữ nguyên neo trang/chữ.
- PDF chưa có văn bản vẫn lưu được và mở ở chế độ PDF gốc. EPUB phải có bản văn đã trích xuất để sử dụng ebook mode.
- Bản cloud và bản trên thiết bị **không đồng bộ tự động hai chiều**. Xóa bản offline không xóa sách cloud và ngược lại. Xóa dữ liệu trình duyệt sẽ mất bản sao nếu chưa có file ZIP.
- Dữ liệu tài liệu lưu trong IndexedDB, vì vậy không phải tải lại sách từ cloud sau khi mở `/demo`. **Hạn chế:** nếu ứng dụng chưa được cache hoặc cài như PWA, khi mất Internet hoàn toàn trang web `/demo` có thể không tải được. Hãy mở `/demo` khi còn Internet trước; đây là bản snapshot local, chưa cam kết chế độ web ngoại tuyến hoàn chỉnh.

## Đọc sách trên /demo khi mất Internet (cache ứng dụng giới hạn)

Trang `/demo` tự đăng ký service worker phạm vi **chỉ `/demo`** trên HTTPS/localhost. Service worker cache riêng bản HTML của Reader local và các CSS/JS/font trong `/_next/static/` đã tải. Khi điều hướng lại `/demo?book=...` mà mất kết nối, trang có thể mở bằng bản giao diện cache và lấy sách từ IndexedDB mà không gọi lại Supabase.

- Mở `/demo` khi có Internet ít nhất một lần để cài service worker và lưu tài nguyên. Nên mở sẵn sách PDF/EPUB muốn dùng, đặc biệt lần đầu, để tải các JS worker và tệp thực thi cần thiết.
- Service worker **không cache API, nội dung tài khoản cloud, signed URL, tệp cá nhân hoặc request có Authorization/Range**. Chế độ cloud `/books` không được đưa vào cache.
- Lần đầu tải ngôn ngữ OCR Tesseract vẫn cần mạng. Một số thư viện hoặc tài nguyên chưa được nạp có thể thiếu khi offline. Dùng ZIP backup để bảo vệ dữ liệu; trình duyệt có thể dọn IndexedDB/Cache Storage khi thiếu dung lượng.
- Khi triển khai phiên bản mới, file `/sw.js` không được cache bởi CDN; cache cũ chỉ được xóa trong namespace `docsach-demo-` khi service worker kích hoạt. Xóa dữ liệu trang trong browser sẽ xóa cả sách local và shell.
- Đây là cache offline có giới hạn cho Reader local, không phải PWA bao trọn các luồng cloud hoặc đồng bộ hai chiều.

## Nhập ghi chú offline lên cloud (append-only, thủ công)

Khi đọc sách đã đăng nhập tại `/books/[id]`, mở thanh bên trái và chọn **Nhập ghi chú offline**. Ứng dụng tìm bản sao cuốn sách từ IndexedDB `/demo`, đọc ghi chú/bookmark cloud mới nhất và hiển thị số lượng sắp thêm trước khi yêu cầu xác nhận.

- Chỉ ghi **ghi chú có UUID, neo đoạn văn còn tồn tại trong bản văn cloud** và các trang bookmark chưa có trên cloud. Không cập nhật tiến độ đọc, không ghi đè ghi chú, không xóa bất kỳ dữ liệu cloud nào.
- Nếu cùng ID ghi chú nhưng hai nơi có nội dung khác nhau, hệ thống **bỏ qua ghi chú offline đó** và đếm xung đột; ghi chú cloud giữ nguyên. Những đoạn OCR mới chỉ có ở bản offline mà chưa xuất hiện trong ebook cloud cũng được bỏ qua để tránh tạo neo hỏng.
- Dùng `upsert(..., ignoreDuplicates: true)` cho note ID và bookmark block ID nên thao tác lặp lại không tạo bản ghi trùng cùng khóa. Nếu lỗi giữa hai bước, một phần dữ liệu có thể đã lên cloud; tải lại trang để đối chiếu trước khi thử lại.
- Bản offline được giữ nguyên. Đây là đồng bộ **một chiều, thủ công và chỉ thêm** ghi chú/bookmark; không phải đồng bộ hai chiều tự động, và không tự giải quyết nội dung xung đột.
- Quyền lưu trên Supabase do RLS kiểm tra theo chủ sở hữu sách và tài khoản đăng nhập. Không có service role key trong frontend.

## Tối ưu tra cứu AI trên sách dài

Truy xuất bằng chứng giờ chỉ giữ tối đa 3–4 đoạn có điểm cao nhất **trên mỗi trang** trước khi xếp hạng cuối cùng. Điều này tránh sắp xếp toàn bộ hàng nghìn đoạn trùng khớp trong sách PDF dài/OCR, trong khi vẫn duy trì giới hạn 12–18 trích đoạn, điểm ưu tiên, khoảng cách trang và thứ tự gốc.

Luồng fallback chỉ chạy khi không có bằng chứng phù hợp; truy vấn toàn stopword không cần tách từ toàn bộ văn bản. Không thêm embedding/API call, không thay đổi định dạng câu trả lời hoặc quyền sách cloud. Độ trễ thực tế vẫn phụ thuộc tải file JSON từ Storage và thời gian phản hồi mô hình AI.

## Tối ưu trích xuất PDF và EPUB trong trình duyệt

- Khi nhập PDF, PDF.js nay xử lý tối đa **3 trang song song theo từng batch**, vẫn đưa kết quả vào đúng thứ tự trang để phân tích header/footer và mục lục không sai. Mỗi trang được gọi `page.cleanup()` ngay sau khi lấy văn bản.
- Thanh tiến độ dùng số trang **đã hoàn thành** (không còn giả định trang được xử lý theo thứ tự). Nếu một trang lỗi, batch đang chạy có thể hoàn tất, nhưng không khởi chạy các batch tiếp theo.
- Tạo mục lục EPUB ghi nhớ trang của neo chương ngay khi phát hiện; không duyệt lại toàn bộ khối văn bản từ đầu cho từng chương EPUB. Không thay đổi định dạng lưu sách hay ID của neo văn bản.
- Có regression test cho giới hạn đồng thời, thứ tự, lỗi và kích thước đầu vào. Mức tăng tốc thực tế phụ thuộc PDF.js worker, CPU, cấu trúc file và thiết bị; chưa có benchmark browser đầy đủ.
