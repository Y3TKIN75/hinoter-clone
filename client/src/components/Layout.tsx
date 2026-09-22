import { NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { HealthResponse } from '@shared/types';

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-1.5 text-sm font-medium transition ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`;

export default function Layout() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  useEffect(() => { api.health().then(setHealth).catch(() => setHealth(null)); }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </span>
            NotAsistan
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={linkCls}>Notlar</NavLink>
            <NavLink to="/record" className={linkCls}>Yeni Kayıt</NavLink>
            <NavLink to="/upload" className={linkCls}>Dosya Yükle</NavLink>
          </nav>
        </div>
        {health && !health.hasApiKey && (
          <div className="bg-amber-50 border-t border-amber-200 text-amber-900 text-sm px-4 py-2 text-center">
            <strong>GROQ_API_KEY tanımlı değil.</strong> <code>.env.example</code> dosyasını <code>.env</code> olarak kopyalayıp anahtarınızı girin ve sunucuyu yeniden başlatın.
          </div>
        )}
        {health?.hasApiKey && health.modelWarnings.length > 0 && (
          <div className="bg-amber-50 border-t border-amber-200 text-amber-900 text-sm px-4 py-2 text-center">
            {health.modelWarnings.join(' · ')}
          </div>
        )}
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        Ses kayıtları Groq API&apos;ye (ABD) gönderilir. Toplantıyı kaydetmeden önce katılımcılardan izin alın.
      </footer>
    </div>
  );
}
