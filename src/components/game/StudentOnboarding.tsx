import React, { useState } from 'react';
import { GRADES, HERO_CLASSES } from '../../shared/curriculum';
import { HeroAvatarSvg } from './HeroAvatarSvg';
import { apiFetch } from '../../lib/api';
import { StudentProfile } from '../../context/AuthContext';
import { soundEngine } from '../../lib/sound';
import { ArrowRight, Check, KeyRound } from 'lucide-react';

interface StudentOnboardingProps {
  onCreated: (student: StudentProfile) => void;
  onCancel?: () => void;
}

const AVATAR_COLORS = ['#D97706', '#0D9488', '#059669', '#4338CA', '#B45309', '#DC2626'];

export function StudentOnboarding({ onCreated, onCancel }: StudentOnboardingProps) {
  const [nickname, setNickname] = useState('');
  const [gradeId, setGradeId] = useState<number>(3);
  const [academicYear, setAcademicYear] = useState('1404-1405');
  const [age, setAge] = useState('');
  const [heroClass, setHeroClass] = useState<'explorer' | 'scholar' | 'inventor' | 'guardian'>('explorer');
  const [avatarColor, setAvatarColor] = useState('#D97706');
  const [studentUsername, setStudentUsername] = useState('');
  const [studentPassword, setStudentPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('لطفاً نام کوچک یا نام مستعار دانش‌آموز را وارد کنید.');
      return;
    }
    if (studentUsername.trim() && studentPassword.length < 4) {
      setError('برای فعال‌سازی حساب مستقل دانش‌آموز، رمز عبور باید حداقل ۴ کاراکتر باشد.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ student: StudentProfile }>('/api/students', {
        method: 'POST',
        body: JSON.stringify({
          nickname: nickname.trim(),
          gradeId,
          academicYear,
          age: age ? Number(age) : undefined,
          heroClass,
          avatarColor,
          username: studentUsername.trim() || undefined,
          password: studentUsername.trim() ? studentPassword : undefined,
        }),
      });
      soundEngine.playVictory();
      onCreated(res.student);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت پروفایل انجام نشد.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF7EF] py-8 px-4 sm:px-8 flex items-center justify-center">
      <div className="w-full max-w-4xl rounded-3xl bg-white border border-[#E2D6BE] p-6 sm:p-10 shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-[#EFE6D5] pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900">
              ساخت پروفایل دانش‌آموز قهرمان
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              پس از انتخاب پایه، فقط کتاب‌ها، مأموریت‌ها و آزمون‌های رسمی همان پایه نمایش داده می‌شوند.
            </p>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer whitespace-nowrap"
            >
              <ArrowRight className="h-4 w-4" />
              <span>بازگشت</span>
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-7 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Live Character Preview Column */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center rounded-2xl bg-[#FBF7EF] border border-[#E7DCC7] p-6 text-center">
            <HeroAvatarSvg
              heroClass={heroClass}
              equippedOutfit="cloak_default"
              avatarColor={avatarColor}
              size={148}
            />
            <p className="mt-4 text-xl font-extrabold text-stone-900">
              {nickname.trim() || 'قهرمان کوچک'}
            </p>
            <p className="mt-1 text-sm font-medium text-amber-800">
              {GRADES.find((g) => g.id === gradeId)?.title} · سال {academicYear}
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              {AVATAR_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setAvatarColor(hex);
                  }}
                  style={{ backgroundColor: hex }}
                  className={`h-8 w-8 rounded-full border-2 transition-transform cursor-pointer ${
                    avatarColor === hex ? 'border-stone-900 scale-110' : 'border-white'
                  }`}
                  aria-label="انتخاب رنگ شنل"
                />
              ))}
            </div>
          </div>

          {/* Form Fields Column */}
          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-bold text-stone-800 mb-1.5">
                  نام کوچک یا نام مستعار دانش‌آموز
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="مثلاً: آریا، سارا، پرهام..."
                  maxLength={40}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-stone-800 mb-1.5">
                  سن (اختیاری)
                </label>
                <input
                  type="number"
                  min={6}
                  max={13}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="مثلاً ۹"
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            </div>

            {/* Grade Selector (1 to 6) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-bold text-stone-800">
                  انتخاب پایه تحصیلی (تعیین‌کننده محتوای درسی)
                </label>
                <span className="text-xs text-stone-500">سال تحصیلی {academicYear}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {GRADES.map((g) => {
                  const selected = gradeId === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        setGradeId(g.id);
                      }}
                      className={`flex flex-col items-start rounded-xl border px-4 py-3 text-right transition-colors cursor-pointer ${
                        selected
                          ? 'border-amber-600 bg-amber-50 text-stone-950'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      <span className="text-sm font-bold">{g.title}</span>
                      <span className="mt-0.5 text-xs text-stone-500">سن تقریبی {g.ageHint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hero Class Selector */}
            <div>
              <label className="block text-sm font-bold text-stone-800 mb-2">
                انتخاب شخصیت بازی
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {HERO_CLASSES.map((hc) => {
                  const selected = heroClass === hc.id;
                  return (
                    <button
                      key={hc.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        setHeroClass(hc.id);
                      }}
                      className={`flex items-start justify-between gap-2 rounded-xl border px-4 py-3 text-right transition-colors cursor-pointer ${
                        selected
                          ? 'border-teal-700 bg-teal-50/70 text-stone-950'
                          : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-bold">{hc.name}</p>
                        <p className="mt-0.5 text-xs text-stone-600">{hc.desc}</p>
                      </div>
                      {selected && <Check className="h-4 w-4 text-teal-700 shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dedicated Student Login Credentials (Isolated Student Portal) */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-amber-800" />
                <p className="text-sm font-extrabold text-stone-900">
                  حساب ورود مستقل دانش‌آموز (پیشنهادی)
                </p>
              </div>
              <p className="text-xs text-stone-600 leading-relaxed">
                با تعیین نام کاربری و رمز عبور، فرزند شما از درگاه «ورود دانش‌آموز» مستقیم وارد بازی می‌شود و به پنل والدین یا سایر بخش‌ها دسترسی نخواهد داشت.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    نام کاربری دانش‌آموز (انگلیسی)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={studentUsername}
                    onChange={(e) => setStudentUsername(e.target.value)}
                    placeholder="مثلاً: aria_hero"
                    className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-mono text-left"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    رمز عبور دانش‌آموز (حداقل ۴ کاراکتر)
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    placeholder="••••"
                    className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-mono text-left"
                  />
                </div>
              </div>
            </div>

            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <select
                aria-label="سال تحصیلی"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm font-semibold text-stone-700"
              >
                <option value="1404-1405">سال تحصیلی ۱۴۰۴-۱۴۰۵</option>
                <option value="1405-1406">سال تحصیلی ۱۴۰۵-۱۴۰۶</option>
              </select>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 px-7 py-3 text-base font-bold text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                {submitting ? 'در حال ثبت...' : 'ذخیره پروفایل فرزند'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
