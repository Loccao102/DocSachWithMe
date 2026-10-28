"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { ArrowRight, BookHeart, Check, Cloud, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { configured, supabase } from "@/lib/supabase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const client = supabase;
    client.auth.getUser().then(({ data }) => { setUser(data.user); setLoading(false); }).catch(() => setLoading(false));
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => subscription.unsubscribe();
  }, []);
  return { user, loading };
}

export function AuthGate({ children }: { children: (user: User) => React.ReactNode }) {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  if (!configured) return <div className="onboarding-screen"><div className="onboarding-card">
    <div className="brand-emblem"><BookHeart size={30}/></div>
    <span className="eyebrow">DOCSACHWITHME · SETUP</span>
    <h1>Một không gian dành riêng cho những trang sách.</h1>
    <p>Dự án đã sẵn sàng. Để bật thư viện cloud, hãy tạo Supabase project và cấu hình 2 biến môi trường trên Vercel.</p>
    <div className="setup-code"><code>NEXT_PUBLIC_SUPABASE_URL</code><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></div>
    <p className="muted small">Sau đó chạy <strong>supabase/schema.sql</strong> trong SQL Editor. Các bước đầy đủ nằm trong README trên GitHub.</p>
    <div className="onboarding-actions"><a href="/knowledge" className="outline-button">Sổ tay ghi chú</a><a href="/discover" className="outline-button">Khám phá sách miễn phí</a><a href="/demo" className="primary-button">Dùng thử Reader không cần tài khoản <ArrowRight size={16}/></a><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="outline-button">Thiết lập cloud</a></div><p className="small muted">Chế độ thử lưu sách vào bộ nhớ của trình duyệt trên thiết bị này; chưa đồng bộ cloud.</p>
  </div></div>;

  if (loading) return <div className="loading-screen"><div className="loader" /><p>Đang mở thư viện của bạn…</p></div>;
  if (user) return <>{children(user)}</>;

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSending(true); setError("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      setSent(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Không thể gửi email đăng nhập"); }
    finally { setSending(false); }
  }

  return <div className="auth-screen">
    <div className="auth-side">
      <div className="auth-logo"><BookHeart size={24}/><strong>DocSach<span>WithMe</span></strong></div>
      <div className="auth-story"><span className="eyebrow light">YOUR PRIVATE READING UNIVERSE</span>
        <h1>Mỗi trang sách,<br/><em>một thế giới mới.</em></h1>
        <p>Đọc chậm hơn. Hiểu sâu hơn. Lưu giữ những ý tưởng xứng đáng được nhớ.</p>
        <div className="auth-features"><span><Cloud size={16}/> Đồng bộ trên mọi thiết bị</span><span><Sparkles size={16}/> AI đồng hành cùng sách</span><span><LockKeyhole size={16}/> Thư viện cá nhân bảo mật</span></div>
      </div>
      <span className="auth-corner">A little space for big ideas.</span>
    </div>
    <div className="auth-form-side"><div className="auth-form">
      <div className="auth-mobile-logo"><BookHeart size={22}/> DocSachWithMe</div>
      <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
      <h2>{sent ? "Kiểm tra hộp thư nhé!" : "Thư viện của riêng bạn."}</h2>
      <p>{sent ? "Chúng mình vừa gửi một đường dẫn đăng nhập đến email của bạn." : "Đăng nhập không cần mật khẩu. Chỉ cần email để bắt đầu đọc và ghi chú."}</p>
      {sent ? <div className="sent-box"><Check size={24}/><span>Đã gửi tới <strong>{email}</strong></span></div> : <form onSubmit={sendMagicLink}>
        <label htmlFor="email">Địa chỉ email</label>
        <div className="field-with-icon"><Mail size={18}/><input id="email" value={email} type="email" required placeholder="ban@example.com" onChange={e => setEmail(e.target.value)}/></div>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={sending} className="primary-button full">{sending ? "Đang gửi…" : "Tiếp tục với email"} <ArrowRight size={18}/></button>
      </form>}
      {sent && <button className="subtle-button" onClick={() => setSent(false)}>Sử dụng email khác</button>}
      <p className="auth-hint">Sách và ghi chú cloud chỉ hiển thị trong tài khoản của bạn. <a href="/discover">Khám phá sách miễn phí không cần đăng nhập.</a></p>
    </div></div>
  </div>;
}
