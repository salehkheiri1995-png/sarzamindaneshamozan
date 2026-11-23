import React, { useState, useEffect } from 'react';
import { SessionRole, useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/api';
import { soundEngine } from '../../lib/sound';
import {
  X,
  LogIn,
  UserPlus,
  ShieldCheck,
  GraduationCap,
  Users,
  Sparkles,
  KeyRound,
  Lock,
} from 'lucide-react';

interface LoginPortalModalProps {
  portal: SessionRole;
  onClose: () => void;
  onSuccess: (role: SessionRole, studentCount: number) => void;
}

const PORTAL_META: Record<
  SessionRole,
  {
    title: string;
    subtitle: string;
    accentClass: string;
    btnClass: string;
    icon: typeof Users;
  }
> = {
  student: {
    title: 'ورود اختصاصی دانش‌آموز',
    subtitle: 'فقط دسترسی به دنیای بازی، مأموریت‌های پایه خودت، تکالیف، آزمون‌ها و قلعه قهرمان',
    accentClass: 'text-amber-700 bg-amber-100',
    btnClass: 'bg-amber-600 hover:bg-amber-700 text-white',
    icon: Sparkles,
  },
  parent: {
    title: 'درگاه اختصاصی والدین',
    subtitle: 'مدیریت پروفایل فرزندان، ساخت نام کاربری کودک، گزارش پیشرفت و کنترل زمان استفاده',
    accentClass: 'text-teal-800 bg-teal-100',
    btnClass: 'bg-teal-700 hover:bg-teal-800 text-white',
    icon: Users,
  },
  teacher: {
    title: 'درگاه اختصاصی معلمان',
    subtitle: 'مدیریت کلاس‌ها، طراحی دستی سؤال با تصویر و انواع بازی، تکالیف، فیلم و آزمون',
    accentClass: 'text-emerald-800 bg-emerald-100',
    btnClass: 'bg-emerald-700 hover:bg-emerald-800 text-white',
    icon: GraduationCap,
  },
  admin: {
    title: 'ورود مدیر مرکزی سامانه',
    subtitle: 'مدیریت کل کاربران، تأیید معلمان، نظارت بر بانک محتوا و گزارش تبلیغات ایمن کودک',
    accentClass: 'text-indigo-800 bg-indigo-100',
    btnClass: 'bg-indigo-700 hover:bg-indigo-800 text-white',
    icon: ShieldCheck,
  },
};

export function LoginPortalModal({ portal, onClose, onSuccess }: LoginPortalModalProps) {
  const {
    authError,
    clearAuthError,
    signInWithPassword,
    registerWithPassword,
    signInWithGoogle,
    bootstrapAdmin,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Admin first-run bootstrap check
  const [checkingBootstrap, setCheckingBootstrap] = useState(portal === 'admin');
  const [needsAdminBootstrap, setNeedsAdminBootstrap] = useState(false);

  useEffect(() => {
    clearAuthError();
    setLocalError(null);
    setMode('login');
    if (portal === 'admin') {
      setCheckingBootstrap(true);
      apiFetch<{ needsBootstrap: boolean }>('/api/auth/admin-bootstrap-status')
        .then((res) => setNeedsAdminBootstrap(Boolean(res.needsBootstrap)))
        .catch(() => setNeedsAdminBootstrap(false))
        .finally(() => setCheckingBootstrap(false));
    }
  }, [portal, clearAuthError]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = PORTAL_META[portal];
  const Icon = meta.icon;

  const toEnglishDigits = (s: string) =>
    s
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    const cleanUser = toEnglishDigits(username)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '');
    const cleanPass = toEnglishDigits(password);

    if (cleanUser.length < 3) {
      setLocalError('نام کاربری باید حداقل ۳ حرف یا عدد انگلیسی باشد (مثلاً ali123 — حروف فارسی مجاز نیست).');
      return;
    }

    setSubmitting(true);
    try {
      if (portal === 'admin' && needsAdminBootstrap) {
        if (cleanPass.length < 6) {
          setLocalError('رمز عبور مدیر باید حداقل ۶ کاراکتر باشد.');
          return;
        }
        const res = await bootstrapAdmin({
          username: cleanUser,
          password: cleanPass,
          displayName: displayName.trim() || 'مدیر سامانه',
        });
        if (res.ok) {
          soundEngine.playVictory();
          onSuccess('admin', 0);
        }
        return;
      }

      if (mode === 'register' && (portal === 'parent' || portal === 'teacher')) {
        if (!displayName.trim()) {
          setLocalError('وارد کردن نام و نام خانوادگی الزامی است.');
          return;
        }
        if (cleanPass.length < 6) {
          setLocalError('رمز عبور باید حداقل ۶ کاراکتر باشد.');
          return;
        }
        const res = await registerWithPassword({
          role: portal,
          username: cleanUser,
          password: cleanPass,
          displayName: displayName.trim(),
          schoolName: portal === 'teacher' ? schoolName.trim() : undefined,
        });
        if (res.ok && res.role) {
          soundEngine.playVictory();
          onSuccess(res.role, 0);
        }
        return;
      }

      const res = await signInWithPassword({
        portal,
        username: cleanUser,
        password: cleanPass,
      });
      if (res.ok && res.role) {
        soundEngine.playVictory();
        onSuccess(res.role, res.studentCount);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (portal === 'student') return;
    setLocalError(null);
    clearAuthError();
    setSubmitting(true);
    try {
      const res = await signInWithGoogle(portal);
      if (res.ok && res.role) {
        soundEngine.playVictory();
        onSuccess(res.role, res.studentCount);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const shownError = localError || authError;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-modal-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-[#E5DAC5] bg-white p-6 sm:p-7 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shrink-0 ${meta.accentClass}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h2 id="portal-modal-title" className="text-xl font-extrabold text-stone-900">
                {portal === 'admin' && needsAdminBootstrap
                  ? 'راه‌اندازی اولیه حساب مدیر سامانه'
                  : meta.title}
              </h2>
              <p className="mt-0.5 text-xs text-stone-600 leading-relaxed">{meta.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 cursor-pointer shrink-0"
            aria-label="بستن"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Login / Register Toggle for Parent & Teacher */}
        {(portal === 'parent' || portal === 'teacher') && (
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#F3ECE0] p-1">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setMode('login');
                setLocalError(null);
                clearAuthError();
              }}
              className={`rounded-lg py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                mode === 'login' ? 'bg-white text-stone-950 shadow-xs' : 'text-stone-600'
              }`}
            >
              ورود با نام کاربری
            </button>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setMode('register');
                setLocalError(null);
                clearAuthError();
              }}
              className={`rounded-lg py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                mode === 'register' ? 'bg-white text-stone-950 shadow-xs' : 'text-stone-600'
              }`}
            >
              ثبت‌نام بدون ایمیل
            </button>
          </div>
        )}

        {/* Student Helper Info */}
        {portal === 'student' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950 leading-relaxed">
            نام کاربری و رمز عبور دانش‌آموز را والدین در «پنل والدین» تعیین می‌کنند. با ورود در این بخش، فقط فضای بازی و درس‌های پایه خودت نمایش داده می‌شود.
          </div>
        )}

        {/* Admin Bootstrap Helper */}
        {portal === 'admin' && needsAdminBootstrap && !checkingBootstrap && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-950 leading-relaxed">
            هنوز حساب کاربری رمزدار برای مدیر سامانه ثبت نشده است. همین حالا نام کاربری و رمز عبور مدیر کل را برای نخستین بار تنظیم کنید.
          </div>
        )}

        {checkingBootstrap ? (
          <p className="py-6 text-center text-sm font-semibold text-stone-500">
            در حال بررسی وضعیت درگاه مدیریت...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {((mode === 'register' && (portal === 'parent' || portal === 'teacher')) ||
              (portal === 'admin' && needsAdminBootstrap)) && (
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  نام و نام خانوادگی
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={
                    portal === 'teacher'
                      ? 'مثلاً: خانم رضایی'
                      : portal === 'admin'
                        ? 'مثلاً: مدیر کل سامانه'
                        : 'مثلاً: مریم کریمی'
                  }
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  required
                />
              </div>
            )}

            {mode === 'register' && portal === 'teacher' && (
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  نام مدرسه یا دبستان (اختیاری)
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="مثلاً: دبستان دانش‌پژوهان"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                نام کاربری (حروف انگلیسی و عدد)
              </label>
              <div className="relative">
                <input
                  type="text"
                  dir="ltr"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={portal === 'student' ? 'aria_hero' : 'username123'}
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 pl-10 text-sm font-mono text-left text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  required
                />
                <KeyRound className="h-4 w-4 text-stone-400 absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                رمز عبور {portal === 'student' ? '(حداقل ۴ کاراکتر)' : '(حداقل ۶ کاراکتر)'}
              </label>
              <div className="relative">
                <input
                  type="password"
                  dir="ltr"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 pl-10 text-sm font-mono text-left text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  required
                />
                <Lock className="h-4 w-4 text-stone-400 absolute left-3 top-3" />
              </div>
            </div>

            {shownError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-800 leading-relaxed">
                {shownError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-extrabold transition-colors cursor-pointer disabled:opacity-60 ${meta.btnClass}`}
            >
              {mode === 'register' || (portal === 'admin' && needsAdminBootstrap) ? (
                <UserPlus className="h-4 w-4" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>
                {submitting
                  ? 'لطفاً صبر کنید...'
                  : portal === 'admin' && needsAdminBootstrap
                    ? 'ثبت حساب مدیر و ورود به پنل'
                    : mode === 'register'
                      ? portal === 'teacher'
                        ? 'ثبت‌نام معلم بدون ایمیل'
                        : 'ثبت‌نام والدین بدون ایمیل'
                      : 'ورود به حساب کاربری'}
              </span>
            </button>
          </form>
        )}

        {/* Optional Google Sign-In for Parent / Teacher / Admin */}
        {portal !== 'student' && (
          <div className="space-y-3 pt-2 border-t border-[#EFE6D5]">
            <p className="text-center text-xs font-semibold text-stone-500">یا ورود سریع با حساب گوگل</p>
            <button
              type="button"
              disabled={submitting}
              onClick={handleGoogleLogin}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 py-2.5 text-sm font-bold text-stone-800 transition-colors cursor-pointer disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                />
                <path
                  fill="#34A853"
                  d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z"
                />
                <path
                  fill="#EA4335"
                  d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
              <span>ورود با حساب گوگل (Gmail)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
