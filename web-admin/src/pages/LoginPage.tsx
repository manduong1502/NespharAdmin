import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ArrowRight, Boxes, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const QUICK_ROLES = [
  { label: "Giám đốc", email: "admin@nesphar.vn", pass: "Nesphar@2026" },
  { label: "Dược sĩ", email: "sales@nesphar.vn", pass: "Nesphar@2026" },
  { label: "Thủ kho", email: "kho@nesphar.vn", pass: "Nesphar@2026" },
];

interface HealthState {
  status: string;
  products: number;
  orders: number;
}

export const LoginPage: React.FC = () => {
  const { staff, login } = useAuth();
  const [email, setEmail] = useState("admin@nesphar.vn");
  const [password, setPassword] = useState("Nesphar@2026");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [health, setHealth] = useState<HealthState | null>(null);

  useEffect(() => {
    fetch("/api/v1/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.status === "ok") setHealth(d);
      })
      .catch(() => {});
  }, []);

  if (staff) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Đăng nhập thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  const quickLogin = async (accEmail: string, accPass: string) => {
    setEmail(accEmail);
    setPassword(accPass);
    setErrorMsg("");
    setSubmitting(true);
    try {
      await login(accEmail, accPass);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Đăng nhập thất bại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-8">
      <div className="anim-modal-pop grid w-full max-w-[940px] overflow-hidden rounded-2xl border border-[#DFE5F2] bg-white shadow-[0_24px_60px_-24px_rgba(24,32,79,0.22)] lg:grid-cols-12">
        {/* Left Brand Panel */}
        <section className="sidebar-surface relative flex flex-col justify-between overflow-hidden p-8 text-white sm:p-9 lg:col-span-5">
          {/* Subtle Architectural Ring Accent */}
          <div
            className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full border border-white/[0.07]"
            style={{
              background:
                "radial-gradient(circle, rgba(99, 102, 241, 0.22) 0%, rgba(99, 102, 241, 0) 70%)",
            }}
          />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white p-1.5 shadow-md">
                <img
                  src="/nesphar-logo.png"
                  alt="NESPHAR"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <div className="text-[17px] font-bold leading-tight tracking-tight">NESPHAR</div>
                <div className="text-[10.5px] font-medium tracking-wider text-[#9099B8]">
                  PHARMA CORE
                </div>
              </div>
            </div>

            <h1 className="mt-9 text-[24px] font-bold leading-snug tracking-tight text-white">
              Quản trị bán hàng &amp; kho dược phẩm
            </h1>
            <p className="mt-2 text-[13px] text-[#98A1BF]">
              CÔNG TY TNHH DƯỢC PHẨM NESPHAR · Hà Tĩnh
            </p>

            {/* 3 Compact Capability Tiles */}
            <div className="mt-7 space-y-2.5">
              <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#4F52C6]/35 text-[#C7D2FE]">
                  <Boxes className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-white">
                    {health ? `${health.products} sản phẩm & lô hạn FEFO` : "Kho lô hạn chuẩn FEFO"}
                  </div>
                  <div className="text-[11px] text-[#8E97B4]">Xuất lô cận hạn trước, chuẩn GSP</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0D9488]/30 text-[#99F6E4]">
                  <Smartphone className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-white">
                    Đồng bộ Zalo Mini App
                  </div>
                  <div className="text-[11px] text-[#8E97B4]">Đơn hàng, giá sỉ B2B &amp; tích điểm</div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.04] px-3.5 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-[#E2E8F0]">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-white">
                    Phân quyền Dược sĩ &amp; Thủ kho
                  </div>
                  <div className="text-[11px] text-[#8E97B4]">Lưu vết toàn bộ thao tác kho &amp; giá</div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 mt-8 flex items-center justify-between border-t border-white/10 pt-4 text-[12px] text-[#8E97B4] tabular-nums">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#22C55E] ring-4 ring-[#22C55E]/20" />
              <span>Hệ thống sẵn sàng</span>
            </span>
            <span>0926.090.668</span>
          </div>
        </section>

        {/* Right Form Panel */}
        <section className="flex flex-col justify-center p-8 sm:p-11 lg:col-span-7">
          <h2 className="text-[22px] font-bold tracking-tight text-ink-primary">Đăng nhập</h2>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            Nhập tài khoản quản trị để tiếp tục làm việc
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-[13px] font-medium text-ink-secondary"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 h-11 w-full px-3.5"
                placeholder="admin@nesphar.vn"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[13px] font-medium text-ink-secondary"
              >
                Mật khẩu
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 h-11 w-full px-3.5"
                placeholder="••••••••"
              />
            </div>

            {errorMsg && (
              <div className="rounded-xl bg-[#FFECEB] px-3.5 py-2.5 text-[13px] font-medium text-[#B42318]">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-press flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3E4095] to-[#2F317B] px-4 text-[14px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(62,64,149,0.65)] hover:from-[#363887] hover:to-[#272969] disabled:opacity-60"
            >
              <span>{submitting ? "Đang đăng nhập..." : "Vào trang quản trị"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <div className="mt-7 border-t border-[#EEF1F8] pt-5">
            <div className="text-[12px] font-medium text-ink-muted">
              Đăng nhập nhanh theo vai trò:
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {QUICK_ROLES.map((r) => (
                <button
                  key={r.email}
                  type="button"
                  disabled={submitting}
                  onClick={() => quickLogin(r.email, r.pass)}
                  className="btn-press rounded-xl border border-[#DFE5F2] bg-[#F6F8FD] px-3.5 py-2 text-[12.5px] font-semibold text-ink-primary hover:border-pharma-600 hover:bg-[#EEF0FD] hover:text-pharma-600"
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
