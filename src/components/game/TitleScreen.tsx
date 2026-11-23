import React, { useEffect } from 'react';
import { WORLD_BACKDROP_URL, GRADES } from '../../shared/curriculum';
import { SessionRole } from '../../context/AuthContext';
import { Volume2, VolumeX, Play, ShieldCheck, GraduationCap, Users, Sparkles, LogOut } from 'lucide-react';
import { soundEngine } from '../../lib/sound';

interface TitleScreenProps {
  isAuthenticated: boolean;
  sessionRole: SessionRole | null;
  userDisplayName?: string;
  authError: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onContinueSession: () => void;
  onSignOut: () => void;
  onOpenPortalLogin: (portal: SessionRole) => void;
  onEnterDemo: (gradeId: number) => void;
}

const ROLE_CONTINUE_LABELS: Record<SessionRole, string> = {
  student: 'ادامه ماجراجویی در سرزمین‌ها',
  parent: 'ورود به پنل مدیریت والدین',
  teacher: 'ورود به پنل اختصاصی معلمان',
  admin: 'ورود به پنل مدیریت مرکزی',
};

export function TitleScreen({
  isAuthenticated,
  sessionRole,
  userDisplayName,
  authError,
  muted,
  onToggleMute,
  onContinueSession,
  onSignOut,
  onOpenPortalLogin,
  onEnterDemo,
}: TitleScreenProps) {
  const [demoGrade, setDemoGrade] = React.useState<number>(3);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
        e.preventDefault();
        soundEngine.playClick();
        if (isAuthenticated && sessionRole) {
          onContinueSession();
        } else {
          onOpenPortalLogin('student');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isAuthenticated, sessionRole, onContinueSession, onOpenPortalLogin]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#131B2E] flex flex-col justify-between select-none">
      {/* Full-viewport atmospheric world key-art backdrop */}
      <div className="absolute inset-0">
        <img
          src={WORLD_BACKDROP_URL}
          alt="نقشه سرزمین دانش‌آموزان قهرمان"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover object-center scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#101828]/80 via-[#101828]/35 to-[#101828]/92" />
      </div>

      {/* Perimeter top-corner audio toggle & signed-in label */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-5">
        <div className="text-sm font-medium text-amber-100/90">
          {isAuthenticated && userDisplayName ? (
            <span>خوش آمدی، {userDisplayName}</span>
          ) : (
            <span>دوره ابتدایی ایران · پایه اول تا ششم · ۱۱ نوع بازی آموزشی</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onToggleMute();
            soundEngine.playClick();
          }}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-200/30 bg-[#131B2E]/70 text-amber-100 hover:bg-[#1E293B] transition-colors cursor-pointer"
          aria-label={muted ? 'روشن کردن صدا' : 'قطع کردن صدا'}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>

      {/* Hero Centerpiece Title Lockup */}
      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-5 text-center">
        <div className="animate-float-slow mb-3">
          <svg
            width="82"
            height="82"
            viewBox="0 0 96 96"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M48 6L82 22V48C82 69 66 84 48 90C30 84 14 69 14 48V22L48 6Z"
              fill="#1E293B"
              stroke="#F59E0B"
              strokeWidth="4"
            />
            <path
              d="M48 14L74 26V47C74 63 62 76 48 81C34 76 22 63 22 47V26L48 14Z"
              fill="#0F766E"
              stroke="#FDE68A"
              strokeWidth="2"
            />
            <polygon
              points="48,25 53,39 68,39 56,48 60,62 48,54 36,62 40,48 28,39 43,39"
              fill="#FBBF24"
              stroke="#78350F"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h1
          className="font-display text-4xl sm:text-5xl md:text-6xl text-amber-50 tracking-normal drop-shadow-[0_4px_14px_rgba(0,0,0,0.65)] leading-tight"
          style={{ fontFamily: '"Lalezar", "Vazirmatn", sans-serif' }}
        >
          سرزمین دانش‌آموزان قهرمان
        </h1>

        <p className="mt-2.5 max-w-2xl text-sm sm:text-base font-medium text-amber-100/95 leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
          پنج سرزمین درسی، یازده سبک بازی آموزشی متنوع و درگاه‌های کاملاً مجزا برای دانش‌آموز، والدین، معلم و مدیر سامانه
        </p>

        {/* Primary Action Cluster */}
        <div className="mt-6 flex flex-col items-center gap-4 w-full max-w-2xl">
          {isAuthenticated && sessionRole ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onContinueSession();
                }}
                className="w-full sm:w-auto min-w-[280px] inline-flex items-center justify-center gap-3 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] px-8 py-4 text-lg font-extrabold text-stone-950 shadow-[0_10px_28px_rgba(245,158,11,0.45)] border-2 border-amber-200 transition-transform duration-150 cursor-pointer whitespace-nowrap"
              >
                <Play className="h-5 w-5 fill-stone-950" />
                <span>{ROLE_CONTINUE_LABELS[sessionRole]}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onSignOut();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-200/35 bg-[#131B2E]/85 hover:bg-[#1E293B] px-5 py-4 text-sm font-bold text-amber-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="h-4 w-4 text-amber-300" />
                <span>خروج و تغییر حساب</span>
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onOpenPortalLogin('student');
                }}
                className="w-full sm:w-auto min-w-[300px] inline-flex items-center justify-center gap-3 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] px-8 py-4 text-lg font-extrabold text-stone-950 shadow-[0_10px_28px_rgba(245,158,11,0.45)] border-2 border-amber-200 transition-transform duration-150 cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="h-5 w-5" />
                <span>ورود دانش‌آموز به دنیای بازی</span>
              </button>

              {/* Strictly Separated Role Portals Row */}
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onOpenPortalLogin('parent');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-100/25 bg-[#131B2E]/80 hover:bg-[#1E293B] px-4 py-2.5 text-sm font-bold text-amber-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Users className="h-4 w-4 text-amber-400" />
                  <span>ورود / ثبت‌نام والدین</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onOpenPortalLogin('teacher');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-100/25 bg-[#131B2E]/80 hover:bg-[#1E293B] px-4 py-2.5 text-sm font-bold text-amber-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <GraduationCap className="h-4 w-4 text-teal-400" />
                  <span>ورود / ثبت‌نام معلم</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onOpenPortalLogin('admin');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-100/25 bg-[#131B2E]/80 hover:bg-[#1E293B] px-4 py-2.5 text-sm font-bold text-amber-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ShieldCheck className="h-4 w-4 text-indigo-300" />
                  <span>ورود مدیر سامانه</span>
                </button>
              </div>
            </>
          )}

          {authError && (
            <p className="rounded-xl bg-red-950/85 border border-red-400/50 px-4 py-2 text-sm text-red-100">
              {authError}
            </p>
          )}

          {/* Quick Play Preview Bar (instant access to all 11 mini-games per grade) */}
          {!isAuthenticated && (
            <div className="mt-1 flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-amber-200/25 bg-[#131B2E]/82 px-5 py-3">
              <label htmlFor="demo-grade-select" className="text-sm text-amber-100/90 whitespace-nowrap">
                آزمایش سریع بازی‌ها بدون حساب:
              </label>
              <select
                id="demo-grade-select"
                value={demoGrade}
                onChange={(e) => setDemoGrade(Number(e.target.value))}
                className="rounded-xl border border-amber-200/30 bg-[#1E293B] px-3 py-2 text-sm font-semibold text-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {GRADES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onEnterDemo(demoGrade);
                }}
                className="rounded-xl bg-teal-600 hover:bg-teal-500 px-4 py-2 text-sm font-bold text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                شروع آزمایشی
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Single flat control-hint line at bottom */}
      <div className="relative z-10 pb-5 px-6 text-center">
        <p className="text-xs sm:text-sm font-medium text-amber-100/80">
          ورود با نام کاربری و رمز عبور یا حساب گوگل · کلیدهای ۱ تا ۴ پاسخ سریع · Esc بازگشت
        </p>
      </div>
    </div>
  );
}
