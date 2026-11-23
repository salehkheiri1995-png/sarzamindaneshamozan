import React, { useState, useEffect } from 'react';
import { StudentProfile } from '../../context/AuthContext';
import { StudentWorldData } from '../../types/game';
import { BookId, GRADES, REALMS, formatPersianDigits } from '../../shared/curriculum';
import { apiFetch } from '../../lib/api';
import { soundEngine } from '../../lib/sound';
import { HeroAvatarSvg } from '../game/HeroAvatarSvg';
import {
  UserPlus,
  Clock,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Link2,
  KeyRound,
  Shield,
  ClipboardCheck,
  PlusCircle,
} from 'lucide-react';

interface ParentPanelProps {
  students: StudentProfile[];
  activeStudent: StudentProfile | null;
  world: StudentWorldData | null;
  onSelectStudent: (id: number) => void;
  onAddStudent: () => void;
  onRefresh: () => void;
  onStudentUpdate: (s: StudentProfile) => void;
}

export function ParentPanel({
  students,
  activeStudent,
  world,
  onSelectStudent,
  onAddStudent,
  onRefresh,
  onStudentUpdate,
}: ParentPanelProps) {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [joinCode, setJoinCode] = useState('');
  const [joinMsg, setJoinMsg] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  // Child login credentials form
  const [childUsername, setChildUsername] = useState(activeStudent?.username || '');
  const [childPassword, setChildPassword] = useState('');
  const [credMsg, setCredMsg] = useState<string | null>(null);
  const [savingCreds, setSavingCreds] = useState(false);

  // Parent quick home-practice homework creator
  const [hwTitle, setHwTitle] = useState('');
  const [hwBook, setHwBook] = useState<BookId>('math');
  const [hwDesc, setHwDesc] = useState('');
  const [hwDueDate, setHwDueDate] = useState('۱۴۰۴/۰۹/۱۵');
  const [hwMsg, setHwMsg] = useState<string | null>(null);

  // AI Progress Analyzer
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    setChildUsername(activeStudent?.username || '');
    setChildPassword('');
    setCredMsg(null);
    setSettingsMsg(null);
    setAiAnalysis(null);
  }, [activeStudent?.id, activeStudent?.username]);

  if (!activeStudent) {
    return (
      <div className="rounded-3xl border border-[#E5DAC5] bg-white p-10 text-center space-y-4">
        <h2 className="text-2xl font-extrabold text-stone-900">هنوز پروفایل فرزندی ثبت نشده است</h2>
        <p className="text-sm text-stone-600 max-w-lg mx-auto leading-relaxed">
          ابتدا پروفایل فرزند خود را بسازید و نام کاربری و رمز عبور اختصاصی برای او تعیین کنید تا از درگاه «ورود دانش‌آموز» مستقیم وارد دنیای بازی پایه خود شود.
        </p>
        <button
          type="button"
          onClick={onAddStudent}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-6 py-3 text-sm font-bold text-white cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          <span>ساخت پروفایل دانش‌آموز جدید</span>
        </button>
      </div>
    );
  }

  const handleUpdateStudentField = async (patch: {
    gradeId?: number;
    dailyLimitMinutes?: number;
    allowOptionalAds?: boolean;
    allowClassJoin?: boolean;
  }) => {
    setSavingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await apiFetch<{ student: StudentProfile }>(`/api/students/${activeStudent.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      soundEngine.playCorrect();
      onStudentUpdate(res.student);
      onRefresh();
      setSettingsMsg('تنظیمات پروفایل دانش‌آموز ذخیره شد.');
    } catch (err) {
      setSettingsMsg(err instanceof Error ? err.message : 'بروزرسانی تنظیمات ناموفق بود.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveChildCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childUsername.trim() && !childPassword.trim()) return;
    setSavingCreds(true);
    setCredMsg(null);
    try {
      const res = await apiFetch<{ student: StudentProfile }>(`/api/students/${activeStudent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          username: childUsername.trim() || undefined,
          password: childPassword.trim() || undefined,
        }),
      });
      soundEngine.playVictory();
      onStudentUpdate(res.student);
      setChildPassword('');
      setCredMsg(
        `اطلاعات ورود مستقل «${res.student.nickname}» با نام کاربری ${res.student.username || childUsername} ذخیره شد.`
      );
    } catch (err) {
      setCredMsg(err instanceof Error ? err.message : 'ذخیره اطلاعات ورود فرزند ناموفق بود.');
    } finally {
      setSavingCreds(false);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoinMsg(null);
    try {
      const res = await apiFetch<{ classroom: { name: string }; alreadyJoined: boolean }>(
        `/api/students/${activeStudent.id}/join-class`,
        {
          method: 'POST',
          body: JSON.stringify({ joinCode: joinCode.trim() }),
        }
      );
      soundEngine.playVictory();
      setJoinCode('');
      setJoinMsg(
        res.alreadyJoined
          ? `فرزند شما قبلاً عضو کلاس «${res.classroom.name}» است.`
          : `عضویت در کلاس «${res.classroom.name}» با تأیید والدین انجام شد!`
      );
      onRefresh();
    } catch (err) {
      setJoinMsg(err instanceof Error ? err.message : 'اتصال به کلاس ناموفق بود.');
    }
  };

  const handleCreateHomeHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hwTitle.trim()) return;
    setHwMsg(null);
    try {
      await apiFetch('/api/homeworks', {
        method: 'POST',
        body: JSON.stringify({
          gradeId: activeStudent.gradeId,
          bookId: hwBook,
          title: hwTitle.trim(),
          description: hwDesc.trim() || 'تمرین پیشنهادی والدین در خانه',
          dueDate: hwDueDate,
        }),
      });
      soundEngine.playVictory();
      setHwTitle('');
      setHwDesc('');
      setHwMsg('تکلیف خانگی ثبت شد و در دفتر مأموریت‌های فرزند شما نمایش داده می‌شود.');
      onRefresh();
    } catch (err) {
      setHwMsg(err instanceof Error ? err.message : 'ثبت تکلیف خانگی ناموفق بود.');
    }
  };

  const handleAnalyzeWithAI = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch<{ analysis: string }>('/api/ai/analyze-progress', {
        method: 'POST',
        body: JSON.stringify({ studentId: activeStudent.id }),
      });
      setAiAnalysis(res.analysis);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'دریافت تحلیل هوشمند ناموفق بود.');
    } finally {
      setAiLoading(false);
    }
  };

  // Time-period filtered report
  const nowMs = Date.now();
  const windowMs =
    period === 'daily'
      ? 24 * 3600 * 1000
      : period === 'weekly'
        ? 7 * 24 * 3600 * 1000
        : 30 * 24 * 3600 * 1000;

  const allAttempts = world?.attempts || [];
  const filteredAttempts = allAttempts.filter((a) => {
    const t = new Date(a.createdAt).getTime();
    return Number.isNaN(t) ? true : nowMs - t <= windowMs;
  });

  const periodTotal = filteredAttempts.length;
  const periodCorrect = filteredAttempts.filter((a) => a.isCorrect).length;
  const periodAccuracy = periodTotal > 0 ? Math.round((periodCorrect / periodTotal) * 100) : 0;
  const periodMinutes = Math.max(
    0,
    Math.round(filteredAttempts.reduce((s, a) => s + (a.durationSeconds || 0), 0) / 60)
  );
  const periodXp = filteredAttempts.reduce((s, a) => s + (a.scoreEarned || 0), 0);

  const homeworks = world?.homeworks || [];
  const completedHomeworks = homeworks.filter((h) => Boolean(h.submission)).length;
  const pendingHomeworks = homeworks.length - completedHomeworks;
  const examAttempts = world?.examAttempts || [];

  const weakTopics = [...new Set(allAttempts.filter((a) => !a.isCorrect).map((a) => a.topicId))].slice(0, 5);
  const strongTopics = [...new Set(allAttempts.filter((a) => a.isCorrect).map((a) => a.topicId))].slice(0, 5);

  return (
    <div className="space-y-7">
      {/* Multi-Child Selector Header */}
      <section className="rounded-3xl border border-[#E5DAC5] bg-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <HeroAvatarSvg
            heroClass={activeStudent.heroClass}
            equippedOutfit={activeStudent.equippedOutfit}
            equippedPet={activeStudent.equippedPet}
            avatarColor={activeStudent.avatarColor}
            size={68}
          />
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900">
              پنل جامع گزارش و مدیریت والدین
            </h2>
            <p className="text-sm text-stone-600">
              فرزند انتخاب‌شده: <span className="font-bold text-stone-900">{activeStudent.nickname}</span> ·{' '}
              {GRADES.find((g) => g.id === activeStudent.gradeId)?.title}
              {activeStudent.username && ` · نام کاربری کودک: ${activeStudent.username}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {students.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectStudent(s.id)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors cursor-pointer ${
                s.id === activeStudent.id
                  ? 'bg-stone-900 text-white'
                  : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              {s.nickname} (پایه {formatPersianDigits(s.gradeId)})
            </button>
          ))}
          <button
            type="button"
            onClick={onAddStudent}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-bold text-white cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="h-4 w-4" />
            <span>افزودن فرزند دیگر</span>
          </button>
        </div>
      </section>

      {/* Timeframe Segmented Filter + 4-Column KPI Strip */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-stone-900">گزارش عملکرد آموزشی</h3>
          <div className="flex items-center gap-1 rounded-xl bg-[#EFE6D5] p-1">
            {(
              [
                ['daily', 'گزارش روزانه'],
                ['weekly', 'گزارش هفتگی'],
                ['monthly', 'گزارش ماهانه'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setPeriod(k);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                  period === k ? 'bg-white text-stone-950 shadow-xs' : 'text-stone-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-5">
            <p className="text-xs font-semibold text-stone-500">مدت تمرین در بازه / سقف روزانه</p>
            <p className="mt-1 text-xl sm:text-2xl font-extrabold text-stone-900 tabular-nums">
              {formatPersianDigits(period === 'daily' ? activeStudent.minutesUsedToday : periodMinutes)} دقیقه · سقف{' '}
              {formatPersianDigits(activeStudent.dailyLimitMinutes)}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-5">
            <p className="text-xs font-semibold text-stone-500">دقت پاسخ و امتیاز بازه</p>
            <p className="mt-1 text-xl sm:text-2xl font-extrabold text-emerald-700 tabular-nums">
              {formatPersianDigits(periodAccuracy)}٪ · +{formatPersianDigits(periodXp)} XP
            </p>
          </div>
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-5">
            <p className="text-xs font-semibold text-stone-500">وضعیت تکالیف</p>
            <p className="mt-1 text-xl sm:text-2xl font-extrabold text-amber-700 tabular-nums">
              {formatPersianDigits(completedHomeworks)} انجام‌شده · {formatPersianDigits(pendingHomeworks)} باقیمانده
            </p>
          </div>
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-5">
            <p className="text-xs font-semibold text-stone-500">آزمون‌های ثبت‌شده</p>
            <p className="mt-1 text-xl sm:text-2xl font-extrabold text-teal-800 tabular-nums">
              {formatPersianDigits(examAttempts.length)} آزمون · {formatPersianDigits(periodTotal)} مأموریت
            </p>
          </div>
        </div>
      </section>

      {/* Main Two-Column Grid: Progress + Controls */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Subject Progress + Homework & Exam History */}
        <div className="lg:col-span-7 space-y-6">
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-5">
            <h3 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-teal-700" />
              <span>میزان پیشرفت هر درس (پایه {formatPersianDigits(activeStudent.gradeId)})</span>
            </h3>

            <div className="space-y-4">
              {REALMS.map((realm) => {
                const realmMissions = (world?.missions || []).filter((m) => m.bookId === realm.bookId);
                const done = realmMissions.filter((m) => m.completed).length;
                const pct = realmMissions.length > 0 ? Math.round((done / realmMissions.length) * 100) : 0;
                return (
                  <div key={realm.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold text-stone-800">
                        {realm.bookTitle} ({realm.name})
                      </span>
                      <span className="font-bold text-stone-600 tabular-nums">
                        {formatPersianDigits(done)} از {formatPersianDigits(realmMissions.length)} ({formatPersianDigits(pct)}٪)
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-[#EFE6D5] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${pct}%`, backgroundColor: realm.accentHex }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#F1E8D8]">
              <div>
                <p className="text-xs font-extrabold text-emerald-800 flex items-center gap-1 mb-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  نقاط قوت ثبت‌شده
                </p>
                {strongTopics.length > 0 ? (
                  <ul className="text-xs text-stone-700 space-y-1 list-disc list-inside">
                    {strongTopics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-stone-500">پس از انجام چند مأموریت اینجا نمایش داده می‌شود.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-extrabold text-amber-800 flex items-center gap-1 mb-1.5">
                  <AlertCircle className="h-4 w-4" />
                  مباحث نیازمند مرور فاصله‌دار
                </p>
                {weakTopics.length > 0 ? (
                  <ul className="text-xs text-stone-700 space-y-1 list-disc list-inside">
                    {weakTopics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-stone-500">خطای نیازمند مرور ثبت نشده است.</p>
                )}
              </div>
            </div>
          </div>

          {/* Exam History & Homework Tracking */}
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-amber-700" />
              <span>کارنامه آزمون‌ها و وضعیت تکالیف فرزند</span>
            </h3>

            {examAttempts.length === 0 ? (
              <p className="text-xs text-stone-500">هنوز آزمونی توسط فرزند شما ثبت نشده است.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-[#EFE6D5] text-stone-500">
                      <th className="py-2 font-bold">شناسه آزمون</th>
                      <th className="py-2 font-bold">نمره</th>
                      <th className="py-2 font-bold">پاسخ درست</th>
                      <th className="py-2 font-bold">زمان</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5EFE2]">
                    {examAttempts.slice(0, 8).map((ea) => (
                      <tr key={ea.id}>
                        <td className="py-2.5 font-bold text-stone-800">آزمون #{formatPersianDigits(ea.examId)}</td>
                        <td className="py-2.5 font-extrabold text-emerald-700 tabular-nums">
                          {formatPersianDigits(ea.score)} از {formatPersianDigits(ea.maxScore)}
                        </td>
                        <td className="py-2.5 tabular-nums text-stone-700">
                          {formatPersianDigits(ea.correctCount)} از {formatPersianDigits(ea.totalQuestions)}
                        </td>
                        <td className="py-2.5 tabular-nums text-stone-500">
                          {formatPersianDigits(Math.round(ea.durationSeconds / 60))} دقیقه
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {homeworks.length > 0 && (
              <div className="pt-3 border-t border-[#F1E8D8] space-y-2">
                <p className="text-xs font-extrabold text-stone-700">فهرست تکالیف اخیر:</p>
                {homeworks.slice(0, 6).map((hw) => (
                  <div
                    key={hw.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#FBF7EF] px-3.5 py-2.5 text-xs"
                  >
                    <span className="font-bold text-stone-900">
                      {hw.title} · مهلت {hw.dueDate}
                    </span>
                    <span
                      className={`font-extrabold ${
                        hw.submission ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {hw.submission
                        ? `تحویل‌شده (${formatPersianDigits(hw.submission.autoScore)}٪)`
                        : 'در انتظار انجام'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Parent Home Homework Creator */}
          <form
            onSubmit={handleCreateHomeHomework}
            className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4"
          >
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-teal-700" />
              <span>ثبت تمرین یا تکلیف خانگی برای فرزند</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={hwTitle}
                onChange={(e) => setHwTitle(e.target.value)}
                placeholder="عنوان تمرین (مثلاً: تمرین ضرب جدول ۶)"
                className="sm:col-span-2 rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                required
              />
              <select
                value={hwBook}
                onChange={(e) => setHwBook(e.target.value as BookId)}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold"
              >
                {REALMS.map((r) => (
                  <option key={r.bookId} value={r.bookId}>
                    {r.bookTitle}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                value={hwDesc}
                onChange={(e) => setHwDesc(e.target.value)}
                placeholder="توضیح کوتاه برای فرزند..."
                className="sm:col-span-2 rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
              />
              <input
                type="text"
                value={hwDueDate}
                onChange={(e) => setHwDueDate(e.target.value)}
                placeholder="مهلت انجام"
                className="rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              {hwMsg ? (
                <p className="text-xs font-bold text-emerald-700">{hwMsg}</p>
              ) : (
                <span className="text-xs text-stone-500">به‌طور خودکار به مأموریت بازی در دفتر تکالیف کودک تبدیل می‌شود.</span>
              )}
              <button
                type="submit"
                className="rounded-xl bg-teal-700 hover:bg-teal-800 px-5 py-2.5 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
              >
                ثبت تکلیف خانگی
              </button>
            </div>
          </form>
        </div>

        {/* Right: Child Login Credentials + Parental Safety Controls + Classroom Join */}
        <div className="lg:col-span-5 space-y-5">
          {/* Child Independent Login Credentials */}
          <form
            onSubmit={handleSaveChildCredentials}
            className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4"
          >
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-amber-700" />
              <span>حساب ورود مستقل فرزند ({activeStudent.nickname})</span>
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              نام کاربری و رمز عبور فرزند را تنظیم کنید تا از بخش «ورود دانش‌آموز» وارد فضای بازی خودش شود (بدون دسترسی به پنل والدین).
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  نام کاربری دانش‌آموز (انگلیسی)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={childUsername}
                  onChange={(e) => setChildUsername(e.target.value)}
                  placeholder="مثلاً: aria_hero"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm font-mono text-left"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  {activeStudent.hasPassword
                    ? 'تغییر رمز عبور دانش‌آموز (خالی = بدون تغییر)'
                    : 'تعیین رمز عبور دانش‌آموز (حداقل ۴ کاراکتر)'}
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={childPassword}
                  onChange={(e) => setChildPassword(e.target.value)}
                  placeholder="••••"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm font-mono text-left"
                />
              </div>
            </div>
            {credMsg && <p className="text-xs font-bold text-emerald-700">{credMsg}</p>}
            <button
              type="submit"
              disabled={savingCreds}
              className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 py-2.5 text-sm font-bold text-white cursor-pointer"
            >
              {savingCreds ? 'در حال ذخیره...' : 'ذخیره نام کاربری و رمز عبور فرزند'}
            </button>
          </form>

          {/* Grade, Screen Time & Safety Switches */}
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-teal-700" />
              <span>تنظیمات پایه، زمان و امنیت کودک</span>
            </h3>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  پایه تحصیلی (تعیین‌کننده کتاب‌ها و آزمون‌ها)
                </label>
                <select
                  disabled={savingSettings}
                  value={activeStudent.gradeId}
                  onChange={(e) => handleUpdateStudentField({ gradeId: Number(e.target.value) })}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-bold"
                >
                  {GRADES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-amber-700" />
                  <span>سقف زمان پیشنهادی روزانه (دقیقه)</span>
                </label>
                <select
                  disabled={savingSettings}
                  value={activeStudent.dailyLimitMinutes}
                  onChange={(e) =>
                    handleUpdateStudentField({ dailyLimitMinutes: Number(e.target.value) })
                  }
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-bold"
                >
                  {[20, 30, 45, 60, 90, 120].map((min) => (
                    <option key={min} value={min}>
                      {formatPersianDigits(min)} دقیقه در روز
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] px-4 py-3 cursor-pointer">
                <div>
                  <p className="text-xs font-extrabold text-stone-900">صندوق جایزه اختیاری در فروشگاه</p>
                  <p className="text-[11px] text-stone-600">در صورت خاموش بودن، هیچ تبلیغی حتی در فروشگاه نمایش داده نمی‌شود.</p>
                </div>
                <input
                  type="checkbox"
                  checked={activeStudent.allowOptionalAds !== false}
                  disabled={savingSettings}
                  onChange={(e) =>
                    handleUpdateStudentField({ allowOptionalAds: e.target.checked })
                  }
                  className="h-5 w-5 accent-teal-700 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] px-4 py-3 cursor-pointer">
                <div>
                  <p className="text-xs font-extrabold text-stone-900">مجوز عضویت در کلاس مدرسه</p>
                  <p className="text-[11px] text-stone-600">اجازه اتصال به کلاس‌های تأییدشده معلمان</p>
                </div>
                <input
                  type="checkbox"
                  checked={activeStudent.allowClassJoin !== false}
                  disabled={savingSettings}
                  onChange={(e) =>
                    handleUpdateStudentField({ allowClassJoin: e.target.checked })
                  }
                  className="h-5 w-5 accent-teal-700 cursor-pointer"
                />
              </label>
            </div>
            {settingsMsg && <p className="text-xs font-bold text-emerald-700">{settingsMsg}</p>}
          </div>

          {/* Parent-Approved Classroom Join */}
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <Link2 className="h-5 w-5 text-teal-700" />
              <span>اتصال فرزند به کلاس معلم (با تأیید والدین)</span>
            </h3>

            <form onSubmit={handleJoinClass} className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="کد کلاس معلم (مثلاً HR3-A1B2)"
                className="flex-1 rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm font-mono uppercase"
              />
              <button
                type="submit"
                className="rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2.5 text-sm font-bold text-white cursor-pointer whitespace-nowrap"
              >
                اتصال
              </button>
            </form>
            {joinMsg && <p className="text-xs font-bold text-amber-900">{joinMsg}</p>}

            {(world?.enrollments || []).length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-[#F1E8D8]">
                <p className="text-xs font-bold text-stone-500">کلاس‌های متصل‌شده:</p>
                {world!.enrollments.map((en) => (
                  <div
                    key={en.enrollmentId}
                    className="flex items-center justify-between text-xs font-bold text-stone-800"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <GraduationCap className="h-4 w-4 text-teal-700" />
                      {en.classroomName}
                    </span>
                    <span className="font-mono text-stone-500">{en.joinCode}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* AI Smart Progress Analyzer for Parents */}
      <section className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-stone-900">تحلیل هوشمند پیشرفت و برنامه مرور هفتگی</h3>
            <p className="text-xs text-stone-600">
              بر اساس نتایج واقعی تمرین‌ها و آزمون‌های ثبت‌شده در پایگاه داده ابری گوگل
            </p>
          </div>
          <button
            type="button"
            disabled={aiLoading}
            onClick={handleAnalyzeWithAI}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 px-5 py-2.5 text-sm font-bold text-white cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4" />
            <span>{aiLoading ? 'در حال تحلیل هوشمند...' : 'دریافت گزارش تحلیلی هوشمند'}</span>
          </button>
        </div>

        {aiError && <p className="text-sm font-medium text-rose-700">{aiError}</p>}
        {aiAnalysis && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 text-sm text-indigo-950 leading-relaxed whitespace-pre-line">
            {aiAnalysis}
          </div>
        )}
      </section>
    </div>
  );
}
