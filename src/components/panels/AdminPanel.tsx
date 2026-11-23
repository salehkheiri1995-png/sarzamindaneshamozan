import React, { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import {
  GRADES,
  QUESTION_TYPE_LABELS,
  QuestionType,
  formatPersianDigits,
} from '../../shared/curriculum';
import { soundEngine } from '../../lib/sound';
import { ManualQuestionBuilder } from './ManualQuestionBuilder';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  BarChart3,
  ShieldAlert,
  Users,
  GraduationCap,
  Layers,
  Trash2,
  Image as ImageIcon,
  Power,
} from 'lucide-react';

interface AdminOverviewData {
  stats: {
    usersCount: number;
    studentCount: number;
    classCount: number;
    attemptCount: number;
    examAttemptCount: number;
    contentCount: number;
    pendingReviewCount: number;
  };
  adReport: {
    rewardedCompleted: number;
    rewardedSkipped: number;
    completionRate: number;
    totalCoinsPaid: number;
    estimatedTomanRevenue: number;
    confirmedTapsellRevenue: number;
    tapsellConfigured: boolean;
  };
  users: Array<{
    uid: string;
    email: string;
    username?: string | null;
    displayName: string;
    role: string;
    teacherApproved: boolean;
    schoolName: string | null;
  }>;
  students: Array<{
    id: number;
    nickname: string;
    username?: string | null;
    gradeId: number;
    xp: number;
    coins: number;
    allowOptionalAds: boolean;
  }>;
  classrooms: Array<{
    id: number;
    name: string;
    gradeId: number;
    joinCode: string;
    isActive: boolean;
    academicYear: string;
  }>;
  allContent: Array<{
    id: number;
    gradeId: number;
    bookId: string;
    chapterId: string;
    topicId: string;
    questionType: string;
    promptText: string;
    correctAnswer: string;
    hasImage: boolean;
    contentSource: string;
    reviewStatus: string;
  }>;
  pendingContent: Array<{
    id: number;
    gradeId: number;
    bookId: string;
    topicId: string;
    promptText: string;
    contentSource: string;
  }>;
  contentByGrade: Array<{ gradeId: number; total: number }>;
}

export function AdminPanel() {
  const [tab, setTab] = useState<'overview' | 'users' | 'students_classes' | 'content_ads'>('overview');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Filters
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'parent' | 'teacher' | 'admin'>('all');
  const [contentGradeFilter, setContentGradeFilter] = useState<number>(0);
  const [contentStatusFilter, setContentStatusFilter] = useState<'all' | 'approved' | 'pending_review' | 'rejected'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<AdminOverviewData>('/api/admin/overview');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'دسترسی به پنل مدیریت امکان‌پذیر نیست.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleUserApproval = async (uid: string, approved: boolean, role: string) => {
    setStatusMsg(null);
    const isParent = role === 'parent';
    try {
      await apiFetch(`/api/admin/teachers/${uid}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ approved, role }),
      });
      soundEngine.playCorrect();
      if (isParent) {
        setStatusMsg(approved ? 'حساب والدین با موفقیت تأیید شد.' : 'تأیید حساب والدین لغو شد.');
      } else {
        setStatusMsg(approved ? 'حساب معلم با موفقیت تأیید شد.' : 'دسترسی معلمی لغو شد.');
      }
      load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isParent
            ? 'بروزرسانی وضعیت والدین ناموفق بود.'
            : 'بروزرسانی وضعیت معلم ناموفق بود.'
      );
    }
  };

  const toggleClassroomActive = async (id: number, isActive: boolean) => {
    setStatusMsg(null);
    try {
      await apiFetch(`/api/admin/classrooms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      soundEngine.playClick();
      setStatusMsg(isActive ? 'کلاس فعال شد.' : 'کلاس غیرفعال شد.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تغییر وضعیت کلاس ناموفق بود.');
    }
  };

  const moderateContent = async (id: number, reviewStatus: 'approved' | 'rejected') => {
    setStatusMsg(null);
    try {
      await apiFetch(`/api/teacher/questions/${id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewStatus }),
      });
      soundEngine.playClick();
      setStatusMsg(reviewStatus === 'approved' ? 'محتوا تأیید و منتشر شد.' : 'محتوا رد شد.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'بررسی محتوا ناموفق بود.');
    }
  };

  const deleteContent = async (id: number) => {
    setStatusMsg(null);
    try {
      await apiFetch(`/api/admin/content/${id}`, { method: 'DELETE' });
      soundEngine.playClick();
      setStatusMsg('آیتم از بانک محتوا حذف شد.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حذف محتوا ناموفق بود.');
    }
  };

  if (loading && !data) {
    return <p className="text-sm font-semibold text-stone-600">در حال بارگذاری پنل مدیریت مرکزی...</p>;
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-900">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const filteredUsers =
    userRoleFilter === 'all' ? data.users : data.users.filter((u) => u.role === userRoleFilter);

  const filteredContent = (data.allContent || []).filter((c) => {
    if (contentGradeFilter !== 0 && c.gradeId !== contentGradeFilter) return false;
    if (contentStatusFilter !== 'all' && c.reviewStatus !== contentStatusFilter) return false;
    return true;
  });

  const maxGradeContent = Math.max(1, ...data.contentByGrade.map((g) => g.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-indigo-700" />
          <div>
            <h2 className="text-2xl font-extrabold text-stone-900">پنل مدیریت مرکزی سامانه</h2>
            <p className="text-sm text-stone-600">
              کنترل کاربران، تأیید معلمان، نظارت بر کلاس‌ها و دانش‌آموزان، مدیریت کامل بانک محتوا و تبلیغات کودک‌ایمن
            </p>
          </div>
        </div>
      </div>

      {/* 4-Tab Navigation */}
      <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-[#EFE6D5] p-1.5">
        {(
          [
            ['overview', 'نمای کلی و آمار', BarChart3],
            ['users', `کاربران و معلمان (${formatPersianDigits(data.users.length)})`, Users],
            [
              'students_classes',
              `دانش‌آموزان و کلاس‌ها (${formatPersianDigits(data.students.length)})`,
              GraduationCap,
            ],
            [
              'content_ads',
              `بانک محتوا و تبلیغات (${formatPersianDigits(data.stats.contentCount)})`,
              Layers,
            ],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setTab(k);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
              tab === k ? 'bg-white text-stone-950 shadow-xs' : 'text-stone-700 hover:text-stone-950'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950">
          {statusMsg}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
          {error}
        </div>
      )}

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              ['کاربران کل', data.stats.usersCount],
              ['پروفایل دانش‌آموز', data.stats.studentCount],
              ['کلاس‌های ثبت‌شده', data.stats.classCount],
              ['مأموریت‌های حل‌شده', data.stats.attemptCount],
              ['آزمون‌های برگزارشده', data.stats.examAttemptCount],
              ['در صف تأیید محتوا', data.stats.pendingReviewCount],
            ].map(([label, val]) => (
              <div key={String(label)} className="rounded-2xl border border-[#E5DAC5] bg-white p-4">
                <p className="text-xs font-semibold text-stone-500">{label}</p>
                <p className="mt-1 text-2xl font-extrabold text-stone-900 tabular-nums">
                  {formatPersianDigits(val as number)}
                </p>
              </div>
            ))}
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
              <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-amber-600" />
                <span>پوشش محتوای تأییدشده به تفکیک پایه</span>
              </h3>
              <div className="space-y-3">
                {data.contentByGrade.map((g) => (
                  <div key={g.gradeId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-bold text-stone-800">
                        {GRADES.find((x) => x.id === g.gradeId)?.title}
                      </span>
                      <span className="font-extrabold text-teal-800 tabular-nums">
                        {formatPersianDigits(g.total)} مأموریت
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#EFE6D5] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-teal-700"
                        style={{ width: `${Math.round((g.total / maxGradeContent) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-teal-700" />
                  <span>گزارش تبلیغات تپسل و ایمنی کودک</span>
                </h3>
                <span className="text-xs font-bold text-stone-600">
                  وضعیت کلید تپسل:{' '}
                  {data.adReport.tapsellConfigured ? 'متصل به تنظیمات سرور' : 'حالت آزمایشی'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#FBF7EF] border border-[#EFE6D5] p-3">
                  <p className="text-xs text-stone-500">تکمیل ویدیو جایزه‌دار</p>
                  <p className="mt-1 text-lg font-extrabold text-stone-900 tabular-nums">
                    {formatPersianDigits(data.adReport.rewardedCompleted)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#FBF7EF] border border-[#EFE6D5] p-3">
                  <p className="text-xs text-stone-500">نرخ تکمیل</p>
                  <p className="mt-1 text-lg font-extrabold text-emerald-700 tabular-nums">
                    {formatPersianDigits(data.adReport.completionRate)}٪
                  </p>
                </div>
                <div className="rounded-xl bg-[#FBF7EF] border border-[#EFE6D5] p-3">
                  <p className="text-xs text-stone-500">درآمد تخمینی (تومان)</p>
                  <p className="mt-1 text-lg font-extrabold text-amber-800 tabular-nums">
                    {formatPersianDigits(data.adReport.estimatedTomanRevenue)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#FBF7EF] border border-[#EFE6D5] p-3">
                  <p className="text-xs text-stone-500">درآمد قطعی API تپسل</p>
                  <p className="mt-1 text-lg font-extrabold text-stone-700 tabular-nums">
                    {formatPersianDigits(data.adReport.confirmedTapsellRevenue)}
                  </p>
                </div>
              </div>

              <p className="text-xs text-stone-600 leading-relaxed">
                قوانین ایمنی فعال: نمایش تبلیغ در مأموریت‌ها، تکالیف و آزمون‌ها مسدود · کنترل کلید خاموش/روشن تبلیغات در اختیار والدین · تفکیک درآمد تخمینی از درآمد قطعی · پایگاه داده روی Google Cloud SQL (نسخه رایگان/مقیاس به صفر) ذخیره می‌شود.
              </p>
            </div>
          </section>

          {/* Pending Content Quick Moderation */}
          {data.pendingContent.length > 0 && (
            <section className="rounded-2xl border border-amber-300 bg-white p-6 space-y-3">
              <h3 className="text-base font-extrabold text-stone-900">
                صف فوری بازبینی محتوای هوش مصنوعی و معلمان ({formatPersianDigits(data.pendingContent.length)})
              </h3>
              <div className="divide-y divide-[#F1E8D8]">
                {data.pendingContent.map((item) => (
                  <div key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-stone-500">
                        پایه {formatPersianDigits(item.gradeId)} · {item.topicId} · منبع:{' '}
                        {item.contentSource === 'ai_generated' ? 'هوش مصنوعی' : 'معلم'}
                      </p>
                      <p className="text-sm font-bold text-stone-900 mt-0.5">{item.promptText}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => moderateContent(item.id, 'approved')}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        تأیید انتشار
                      </button>
                      <button
                        type="button"
                        onClick={() => moderateContent(item.id, 'rejected')}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 cursor-pointer"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        رد محتوا
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* TAB 2: USERS & TEACHERS */}
      {tab === 'users' && (
        <section className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-extrabold text-stone-900">
              مدیریت کاربران و تأیید حساب‌ها
            </h3>
            <div className="flex items-center gap-1 rounded-xl bg-[#EFE6D5] p-1">
              {(
                [
                  ['all', 'همه'],
                  ['teacher', 'معلمان'],
                  ['parent', 'والدین'],
                  ['admin', 'مدیران'],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setUserRoleFilter(k)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold cursor-pointer ${
                    userRoleFilter === k ? 'bg-white text-stone-950 shadow-xs' : 'text-stone-700'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-[#EFE6D5] text-xs text-stone-500">
                  <th className="py-2.5 font-bold">نام</th>
                  <th className="py-2.5 font-bold">نام کاربری / ایمیل</th>
                  <th className="py-2.5 font-bold">نقش</th>
                  <th className="py-2.5 font-bold">مدرسه</th>
                  <th className="py-2.5 font-bold">وضعیت تأیید</th>
                  <th className="py-2.5 font-bold">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5EFE2]">
                {filteredUsers.map((u) => {
                  const isParent = u.role === 'parent';
                  return (
                    <tr key={u.uid}>
                      <td className="py-3 font-bold text-stone-900">{u.displayName}</td>
                      <td className="py-3 text-stone-600 font-mono text-xs">
                        {u.username ? `@${u.username}` : u.email}
                      </td>
                      <td className="py-3 font-semibold text-stone-700">
                        {u.role === 'admin' ? 'مدیر کل' : u.role === 'teacher' ? 'معلم' : 'والدین'}
                      </td>
                      <td className="py-3 text-xs text-stone-600">{u.schoolName || '—'}</td>
                      <td className="py-3 text-xs font-bold">
                        {u.role === 'admin' || u.teacherApproved ? (
                          <span className="text-emerald-700">تأییدشده</span>
                        ) : (
                          <span className="text-amber-700">در انتظار تأیید</span>
                        )}
                      </td>
                      <td className="py-3">
                        {u.role !== 'admin' && (
                          <button
                            type="button"
                            onClick={() => toggleUserApproval(u.uid, !u.teacherApproved, u.role)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                              u.teacherApproved
                                ? 'border border-rose-300 text-rose-700 hover:bg-rose-50'
                                : 'bg-emerald-700 text-white hover:bg-emerald-800'
                            }`}
                          >
                            {isParent
                              ? u.teacherApproved
                                ? 'لغو تأیید والدین'
                                : 'تأیید به عنوان والدین'
                              : u.teacherApproved
                                ? 'لغو دسترسی معلم'
                                : 'تأیید به عنوان معلم'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: STUDENTS & CLASSROOMS */}
      {tab === 'students_classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
            <h3 className="text-base font-extrabold text-stone-900">
              پروفایل‌های دانش‌آموزان ({formatPersianDigits(data.students.length)})
            </h3>
            {data.students.length === 0 ? (
              <p className="text-sm text-stone-500">هنوز پروفایل دانش‌آموزی ثبت نشده است.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b border-[#EFE6D5] text-xs text-stone-500">
                      <th className="py-2 font-bold">نام قهرمان</th>
                      <th className="py-2 font-bold">نام کاربری</th>
                      <th className="py-2 font-bold">پایه</th>
                      <th className="py-2 font-bold">XP</th>
                      <th className="py-2 font-bold">سکه</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5EFE2]">
                    {data.students.map((st) => (
                      <tr key={st.id}>
                        <td className="py-2.5 font-bold text-stone-900">{st.nickname}</td>
                        <td className="py-2.5 font-mono text-xs text-stone-600">
                          {st.username ? `@${st.username}` : 'بدون رمز مستقل'}
                        </td>
                        <td className="py-2.5 text-xs font-bold text-stone-700">
                          پایه {formatPersianDigits(st.gradeId)}
                        </td>
                        <td className="py-2.5 font-bold text-teal-800 tabular-nums">
                          {formatPersianDigits(st.xp)}
                        </td>
                        <td className="py-2.5 font-bold text-amber-700 tabular-nums">
                          {formatPersianDigits(st.coins)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="lg:col-span-5 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
            <h3 className="text-base font-extrabold text-stone-900">
              مدیریت کلاس‌های درسی ({formatPersianDigits(data.classrooms.length)})
            </h3>
            {data.classrooms.length === 0 ? (
              <p className="text-sm text-stone-500">هنوز کلاسی ایجاد نشده است.</p>
            ) : (
              <div className="space-y-3">
                {data.classrooms.map((cls) => (
                  <div
                    key={cls.id}
                    className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-extrabold text-stone-900">{cls.name}</p>
                      <p className="text-xs text-stone-600">
                        پایه {formatPersianDigits(cls.gradeId)} · کد: <span className="font-mono">{cls.joinCode}</span> ·{' '}
                        {cls.isActive ? 'فعال' : 'غیرفعال'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleClassroomActive(cls.id, !cls.isActive)}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer ${
                        cls.isActive
                          ? 'border border-rose-300 text-rose-700 hover:bg-rose-50'
                          : 'bg-emerald-700 text-white hover:bg-emerald-800'
                      }`}
                    >
                      <Power className="h-3.5 w-3.5" />
                      <span>{cls.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: FULL CONTENT BANK + ADD OFFICIAL QUESTION + AD SAFETY */}
      {tab === 'content_ads' && (
        <div className="space-y-6">
          <ManualQuestionBuilder
            isAdmin
            onCreated={(msg) => {
              setStatusMsg(msg);
              load();
            }}
            onError={(err) => setError(err)}
          />

          <section className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-stone-900">
                بانک کامل سؤالات و بازی‌ها ({formatPersianDigits(filteredContent.length)} مورد)
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={contentGradeFilter}
                  onChange={(e) => setContentGradeFilter(Number(e.target.value))}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
                >
                  <option value={0}>همه پایه‌ها (اول تا ششم)</option>
                  {GRADES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
                <select
                  value={contentStatusFilter}
                  onChange={(e) =>
                    setContentStatusFilter(
                      e.target.value as 'all' | 'approved' | 'pending_review' | 'rejected'
                    )
                  }
                  className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
                >
                  <option value="all">همه وضعیت‌ها</option>
                  <option value="approved">تأیید و منتشرشده</option>
                  <option value="pending_review">در صف بررسی</option>
                  <option value="rejected">ردشده</option>
                </select>
              </div>
            </div>

            <div className="divide-y divide-[#F1E8D8] max-h-[540px] overflow-y-auto">
              {filteredContent.map((c) => (
                <div key={c.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 max-w-2xl">
                    <p className="text-xs font-semibold text-stone-500 flex flex-wrap items-center gap-1.5">
                      <span>پایه {formatPersianDigits(c.gradeId)}</span>
                      <span>·</span>
                      <span>{c.topicId}</span>
                      <span>·</span>
                      <span>{QUESTION_TYPE_LABELS[c.questionType as QuestionType] || c.questionType}</span>
                      <span>·</span>
                      <span>
                        {c.contentSource === 'official_curriculum'
                          ? 'محتوای رسمی'
                          : c.contentSource === 'ai_generated'
                            ? 'هوش مصنوعی'
                            : 'تألیف معلم'}
                      </span>
                      {c.hasImage && (
                        <span className="inline-flex items-center gap-0.5 text-teal-700 font-bold">
                          · <ImageIcon className="h-3 w-3" /> دارای تصویر
                        </span>
                      )}
                    </p>
                    <p className="text-sm font-bold text-stone-900">{c.promptText}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {c.reviewStatus !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => moderateContent(c.id, 'approved')}
                        className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                      >
                        تأیید
                      </button>
                    )}
                    {c.reviewStatus !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => moderateContent(c.id, 'rejected')}
                        className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-800 cursor-pointer"
                      >
                        توقف انتشار
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteContent(c.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
