import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  GRADES,
  QUESTION_TYPE_LABELS,
  QuestionType,
  formatPersianDigits,
} from '../../shared/curriculum';
import { soundEngine } from '../../lib/sound';
import { SkeletonLoader } from '../common/SkeletonLoader';
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
  Search,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  UserX,
  UserCheck,
  Download,
  Megaphone,
  ChevronDown,
  ChevronUp,
  Database,
  Clock,
} from 'lucide-react';

interface AdminUserRow {
  uid: string;
  email: string;
  username?: string | null;
  displayName: string;
  role: string;
  teacherApproved: boolean;
  isActive?: boolean;
  schoolName: string | null;
}

interface AdminContentRow {
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
  rejectionReason?: string | null;
}

interface AdminAnnouncementRow {
  id: number;
  title?: string | null;
  senderName: string;
  targetAudience: string;
  message: string;
  scheduledDate?: string | null;
  createdAt: string;
}

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
  users: AdminUserRow[];
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
    teacherName?: string;
    members?: Array<{ studentId: number; nickname: string; gradeId: number }>;
  }>;
  globalAnnouncements?: AdminAnnouncementRow[];
  allContent: AdminContentRow[];
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

type ConfirmDialogState =
  | {
      kind: 'delete_content';
      item: AdminContentRow;
    }
  | {
      kind: 'delete_user';
      user: AdminUserRow;
    }
  | {
      kind: 'toggle_user_status';
      user: AdminUserRow;
      nextActive: boolean;
    }
  | {
      kind: 'delete_announcement';
      announcement: AdminAnnouncementRow;
    };

const USERS_PER_PAGE = 10;
const CONTENT_PER_PAGE = 15;

export function AdminPanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'overview' | 'users' | 'students_classes' | 'content_ads'>('overview');
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [dbHealth, setDbHealth] = useState<{ ok: boolean; db: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Filters, search & pagination
  const [userRoleFilter, setUserRoleFilter] = useState<
    'all' | 'pending' | 'parent' | 'teacher' | 'admin'
  >('all');
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);

  const [contentGradeFilter, setContentGradeFilter] = useState<number>(0);
  const [contentStatusFilter, setContentStatusFilter] = useState<
    'all' | 'approved' | 'pending_review' | 'rejected'
  >('all');
  const [contentSearch, setContentSearch] = useState('');
  const [contentPage, setContentPage] = useState(1);

  // Confirm modal state
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Content Rejection Modal state
  const [rejectTarget, setRejectTarget] = useState<{ id: number; promptText: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectBusy, setRejectBusy] = useState(false);

  // Global Announcements form state
  const [annTitle, setAnnTitle] = useState('');
  const [annAudience, setAnnAudience] = useState<'all' | 'teachers' | 'parents'>('all');
  const [annDate, setAnnDate] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annBusy, setAnnBusy] = useState(false);

  // Selected classroom for detail member list
  const [expandedClassroomId, setExpandedClassroomId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, healthRes] = await Promise.all([
        apiFetch<AdminOverviewData>('/api/admin/overview'),
        apiFetch<{ ok: boolean; db: string }>('/api/health').catch(() => ({
          ok: false,
          db: 'disconnected',
        })),
      ]);
      setData(overviewRes);
      setDbHealth(healthRes);
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
    setError(null);
    const isParent = role === 'parent';
    try {
      await apiFetch(`/api/admin/teachers/${uid}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ approved }),
      });
      soundEngine.playCorrect();
      const msg = isParent
        ? approved
          ? 'حساب والدین با موفقیت تأیید شد.'
          : 'تأیید حساب والدین لغو شد.'
        : approved
          ? 'حساب معلم با موفقیت تأیید شد.'
          : 'دسترسی معلمی لغو شد.';
      setStatusMsg(msg);
      showToast(msg, 'success');
      load();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isParent
            ? 'بروزرسانی وضعیت والدین ناموفق بود.'
            : 'بروزرسانی وضعیت معلم ناموفق بود.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const changeUserRole = async (uid: string, nextRole: 'parent' | 'teacher', displayName: string) => {
    setStatusMsg(null);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${uid}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      soundEngine.playCorrect();
      const msg = `نقش کاربر «${displayName}» به «${nextRole === 'parent' ? 'والدین' : 'معلم'}» تغییر یافت.`;
      setStatusMsg(msg);
      showToast(msg, 'success');
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تغییر نقش کاربر ناموفق بود.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const toggleClassroomActive = async (id: number, isActive: boolean) => {
    setStatusMsg(null);
    setError(null);
    try {
      await apiFetch(`/api/admin/classrooms/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      soundEngine.playClick();
      const msg = isActive ? 'کلاس فعال شد.' : 'کلاس غیرفعال شد.';
      setStatusMsg(msg);
      showToast(msg, 'info');
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تغییر وضعیت کلاس ناموفق بود.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const moderateContent = async (
    id: number,
    reviewStatus: 'approved' | 'rejected',
    rejectionReason?: string
  ) => {
    setStatusMsg(null);
    setError(null);
    try {
      await apiFetch(`/api/teacher/questions/${id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewStatus, rejectionReason }),
      });
      soundEngine.playClick();
      const msg =
        reviewStatus === 'approved'
          ? 'محتوا تأیید و منتشر شد.'
          : 'محتوا رد شد و علت رد برای معلم ثبت گردید.';
      setStatusMsg(msg);
      showToast(msg, reviewStatus === 'approved' ? 'success' : 'info');
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'بررسی محتوا ناموفق بود.';
      setError(msg);
      showToast(msg, 'error');
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setRejectBusy(true);
    try {
      await moderateContent(
        rejectTarget.id,
        'rejected',
        rejectReason.trim() || 'نیازمند بازبینی و اصلاح محتوایی'
      );
      setRejectTarget(null);
      setRejectReason('');
    } finally {
      setRejectBusy(false);
    }
  };

  const handleSendGlobalAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annMessage.trim()) return;
    setAnnBusy(true);
    setStatusMsg(null);
    setError(null);
    try {
      await apiFetch('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title: annTitle.trim() || undefined,
          targetAudience: annAudience,
          scheduledDate: annDate.trim() || undefined,
          message: annMessage.trim(),
        }),
      });
      soundEngine.playVictory();
      setAnnTitle('');
      setAnnDate('');
      setAnnMessage('');
      const msg = 'اطلاعیه سراسری با موفقیت ثبت و در پنل مخاطبان منتشر شد.';
      setStatusMsg(msg);
      showToast(msg, 'success');
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ارسال اطلاعیه سراسری ناموفق بود.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setAnnBusy(false);
    }
  };

  const downloadCsv = (filename: string, headers: string[], rows: string[][]) => {
    const escapeCell = (cell: string) => `"${String(cell ?? '').replace(/"/g, '""')}"`;
    const csv =
      '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const executeConfirmedAction = async () => {
    if (!confirmState) return;
    setConfirmBusy(true);
    setStatusMsg(null);
    setError(null);

    try {
      if (confirmState.kind === 'delete_content') {
        await apiFetch(`/api/admin/content/${confirmState.item.id}`, { method: 'DELETE' });
        soundEngine.playClick();
        const msg = 'آیتم از بانک محتوا حذف شد.';
        setStatusMsg(msg);
        showToast(msg, 'info');
      } else if (confirmState.kind === 'delete_user') {
        await apiFetch(`/api/admin/users/${confirmState.user.uid}`, { method: 'DELETE' });
        soundEngine.playClick();
        const msg = `حساب کاربری «${confirmState.user.displayName}» حذف شد.`;
        setStatusMsg(msg);
        showToast(msg, 'info');
      } else if (confirmState.kind === 'toggle_user_status') {
        await apiFetch(`/api/admin/users/${confirmState.user.uid}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ isActive: confirmState.nextActive }),
        });
        soundEngine.playClick();
        const msg = confirmState.nextActive
          ? `حساب کاربری «${confirmState.user.displayName}» دوباره فعال شد.`
          : `حساب کاربری «${confirmState.user.displayName}» غیرفعال شد.`;
        setStatusMsg(msg);
        showToast(msg, 'info');
      } else if (confirmState.kind === 'delete_announcement') {
        await apiFetch(`/api/admin/announcements/${confirmState.announcement.id}`, {
          method: 'DELETE',
        });
        soundEngine.playClick();
        const msg = 'اطلاعیه سراسری حذف شد.';
        setStatusMsg(msg);
        showToast(msg, 'info');
      }
      setConfirmState(null);
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'اجرای عملیات با خطا مواجه شد.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = userSearch.trim().toLowerCase();
    return data.users.filter((u) => {
      if (userRoleFilter === 'pending') {
        if (u.role === 'admin' || u.teacherApproved) return false;
      } else if (userRoleFilter !== 'all' && u.role !== userRoleFilter) {
        return false;
      }
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.schoolName || '').toLowerCase().includes(q)
      );
    });
  }, [data, userRoleFilter, userSearch]);

  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const safeUserPage = Math.min(userPage, userTotalPages);
  const paginatedUsers = filteredUsers.slice(
    (safeUserPage - 1) * USERS_PER_PAGE,
    safeUserPage * USERS_PER_PAGE
  );

  const filteredContent = useMemo(() => {
    if (!data) return [];
    const q = contentSearch.trim().toLowerCase();
    return (data.allContent || []).filter((c) => {
      if (contentGradeFilter !== 0 && c.gradeId !== contentGradeFilter) return false;
      if (contentStatusFilter !== 'all' && c.reviewStatus !== contentStatusFilter) return false;
      if (!q) return true;
      return (
        c.promptText.toLowerCase().includes(q) ||
        c.topicId.toLowerCase().includes(q) ||
        c.chapterId.toLowerCase().includes(q) ||
        c.bookId.toLowerCase().includes(q)
      );
    });
  }, [data, contentGradeFilter, contentStatusFilter, contentSearch]);

  const contentTotalPages = Math.max(1, Math.ceil(filteredContent.length / CONTENT_PER_PAGE));
  const safeContentPage = Math.min(contentPage, contentTotalPages);
  const paginatedContent = filteredContent.slice(
    (safeContentPage - 1) * CONTENT_PER_PAGE,
    safeContentPage * CONTENT_PER_PAGE
  );

  if (loading && !data) {
    return <SkeletonLoader variant="panel" />;
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-900">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const pendingUsersCount = data.users.filter((u) => u.role !== 'admin' && !u.teacherApproved).length;

  const maxGradeContent = Math.max(1, ...data.contentByGrade.map((g) => g.total));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-indigo-700" />
          <div>
            <h2 className="text-2xl font-extrabold text-stone-900">پنل مدیریت مرکزی سامانه</h2>
            <p className="text-sm text-stone-600">
              کنترل کاربران، تأیید والدین و معلمان، تغییر نقش، مدیریت کلاس‌ها، بانک محتوا و تبلیغات کودک‌ایمن
            </p>
          </div>
        </div>

        {/* Live PostgreSQL Health Status */}
        <div
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-extrabold whitespace-nowrap ${
            dbHealth?.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <Database className={`h-4 w-4 ${dbHealth?.ok ? 'text-emerald-700' : 'text-rose-700'}`} />
          <span>
            {dbHealth?.ok
              ? 'متصل به پایگاه داده PostgreSQL (Cloud SQL)'
              : 'وضعیت اتصال پایگاه داده نامشخص'}
          </span>
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
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3.5">
            <button
              type="button"
              onClick={() => {
                setTab('users');
                setUserRoleFilter('all');
                setUserPage(1);
              }}
              className="rounded-2xl border border-[#E5DAC5] bg-white hover:border-amber-400 p-4 text-right transition-colors cursor-pointer"
            >
              <p className="text-xs font-semibold text-stone-500">کاربران کل</p>
              <p className="mt-1 text-2xl font-extrabold text-stone-900 tabular-nums">
                {formatPersianDigits(data.stats.usersCount)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setTab('users');
                setUserRoleFilter('pending');
                setUserPage(1);
              }}
              className={`rounded-2xl border p-4 text-right transition-colors cursor-pointer ${
                pendingUsersCount > 0
                  ? 'border-amber-300 bg-amber-50/70 hover:bg-amber-50'
                  : 'border-[#E5DAC5] bg-white hover:border-amber-400'
              }`}
            >
              <p className="text-xs font-bold text-amber-900 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>در انتظار تأیید حساب</span>
              </p>
              <p className="mt-1 text-2xl font-extrabold text-amber-800 tabular-nums">
                {formatPersianDigits(pendingUsersCount)}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-amber-700">کلیک برای بررسی فوری</p>
            </button>

            <button
              type="button"
              onClick={() => setTab('students_classes')}
              className="rounded-2xl border border-[#E5DAC5] bg-white hover:border-amber-400 p-4 text-right transition-colors cursor-pointer"
            >
              <p className="text-xs font-semibold text-stone-500">پروفایل دانش‌آموز</p>
              <p className="mt-1 text-2xl font-extrabold text-stone-900 tabular-nums">
                {formatPersianDigits(data.stats.studentCount)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setTab('students_classes')}
              className="rounded-2xl border border-[#E5DAC5] bg-white hover:border-amber-400 p-4 text-right transition-colors cursor-pointer"
            >
              <p className="text-xs font-semibold text-stone-500">کلاس‌های ثبت‌شده</p>
              <p className="mt-1 text-2xl font-extrabold text-stone-900 tabular-nums">
                {formatPersianDigits(data.stats.classCount)}
              </p>
            </button>

            <div className="rounded-2xl border border-[#E5DAC5] bg-white p-4">
              <p className="text-xs font-semibold text-stone-500">مأموریت‌های حل‌شده</p>
              <p className="mt-1 text-2xl font-extrabold text-stone-900 tabular-nums">
                {formatPersianDigits(data.stats.attemptCount)}
              </p>
            </div>

            <div className="rounded-2xl border border-[#E5DAC5] bg-white p-4">
              <p className="text-xs font-semibold text-stone-500">آزمون‌های برگزارشده</p>
              <p className="mt-1 text-2xl font-extrabold text-stone-900 tabular-nums">
                {formatPersianDigits(data.stats.examAttemptCount)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setTab('content_ads');
                setContentStatusFilter('pending_review');
                setContentPage(1);
              }}
              className={`rounded-2xl border p-4 text-right transition-colors cursor-pointer ${
                data.stats.pendingReviewCount > 0
                  ? 'border-indigo-300 bg-indigo-50/70 hover:bg-indigo-50'
                  : 'border-[#E5DAC5] bg-white hover:border-indigo-400'
              }`}
            >
              <p className="text-xs font-bold text-indigo-900">در صف تأیید محتوا</p>
              <p className="mt-1 text-2xl font-extrabold text-indigo-800 tabular-nums">
                {formatPersianDigits(data.stats.pendingReviewCount)}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-indigo-700">کلیک برای بازبینی</p>
            </button>
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-stone-600">
                    وضعیت کلید تپسل:{' '}
                    {data.adReport.tapsellConfigured ? 'متصل به تنظیمات سرور' : 'حالت آزمایشی'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        'ad-safety-report.csv',
                        [
                          'تکمیل ویدیو جایزه‌دار',
                          'ردشده',
                          'نرخ تکمیل (٪)',
                          'مجموع سکه پرداختی',
                          'درآمد تخمینی (تومان)',
                          'درآمد قطعی تپسل',
                        ],
                        [
                          [
                            String(data.adReport.rewardedCompleted),
                            String(data.adReport.rewardedSkipped),
                            String(data.adReport.completionRate),
                            String(data.adReport.totalCoinsPaid),
                            String(data.adReport.estimatedTomanRevenue),
                            String(data.adReport.confirmedTapsellRevenue),
                          ],
                        ]
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-800 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5 text-teal-700" />
                    <span>خروجی CSV</span>
                  </button>
                </div>
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

          {/* Global Announcements Manager */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleSendGlobalAnnouncement}
              className="lg:col-span-5 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-3.5"
            >
              <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-indigo-700" />
                <span>ارسال اطلاعیه سراسری مدیریت</span>
              </h3>
              <input
                type="text"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="عنوان اطلاعیه (اختیاری)"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={annAudience}
                  onChange={(e) => setAnnAudience(e.target.value as 'all' | 'teachers' | 'parents')}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold"
                >
                  <option value="all">همه کاربران (والدین، معلمان و دانش‌آموزان)</option>
                  <option value="teachers">فقط معلمان</option>
                  <option value="parents">فقط والدین</option>
                </select>
                <input
                  type="text"
                  value={annDate}
                  onChange={(e) => setAnnDate(e.target.value)}
                  placeholder="تاریخ / رویداد (مثلاً ۱۴۰۴/۰۹/۲۰)"
                  className="rounded-xl border border-stone-300 px-3 py-2 text-xs"
                />
              </div>
              <textarea
                rows={3}
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                placeholder="متن اطلاعیه سراسری برای نمایش در بالای پنل مقصد..."
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm"
                required
              />
              <button
                type="submit"
                disabled={annBusy}
                className="w-full rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 py-2.5 text-xs font-extrabold text-white cursor-pointer"
              >
                {annBusy ? 'در حال انتشار...' : 'انتشار اطلاعیه سراسری'}
              </button>
            </form>

            <div className="lg:col-span-7 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-3.5">
              <h3 className="text-base font-extrabold text-stone-900">
                اطلاعیه‌های سراسری منتشرشده ({formatPersianDigits(data.globalAnnouncements?.length || 0)})
              </h3>
              {(data.globalAnnouncements || []).length === 0 ? (
                <p className="text-sm text-stone-500">هنوز اطلاعیه سراسری ثبت نشده است.</p>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto">
                  {data.globalAnnouncements!.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                          <span className="text-indigo-800">
                            {a.targetAudience === 'teachers'
                              ? 'فقط معلمان'
                              : a.targetAudience === 'parents'
                                ? 'فقط والدین'
                                : 'همه کاربران'}
                          </span>
                          {a.title && <span className="text-stone-900">· {a.title}</span>}
                          {a.scheduledDate && (
                            <span className="text-stone-500">· {a.scheduledDate}</span>
                          )}
                        </div>
                        <p className="text-sm text-stone-800">{a.message}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfirmState({ kind: 'delete_announcement', announcement: a })}
                        className="rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                        onClick={() => {
                          setRejectTarget({ id: item.id, promptText: item.promptText });
                          setRejectReason('');
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
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
              مدیریت کاربران، نقش‌ها و تأیید حساب‌ها ({formatPersianDigits(filteredUsers.length)})
            </h3>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    'users-report.csv',
                    ['نام', 'نام کاربری / ایمیل', 'نقش', 'مدرسه', 'وضعیت تأیید', 'وضعیت حساب'],
                    filteredUsers.map((u) => [
                      u.displayName,
                      u.username ? `@${u.username}` : u.email,
                      u.role === 'admin' ? 'مدیر کل' : u.role === 'teacher' ? 'معلم' : 'والدین',
                      u.schoolName || '',
                      u.role === 'admin' || u.teacherApproved ? 'تأییدشده' : 'در انتظار تأیید',
                      u.isActive !== false ? 'فعال' : 'غیرفعال',
                    ])
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-800 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-teal-700" />
                <span>خروجی CSV کاربران</span>
              </button>

              <div className="relative">
                <Search className="h-4 w-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setUserPage(1);
                  }}
                  placeholder="جستجو نام، نام کاربری یا ایمیل..."
                  className="w-60 sm:w-64 rounded-xl border border-stone-300 bg-white pr-9 pl-3 py-1.5 text-xs font-medium text-stone-900"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#EFE6D5] p-1">
                {(
                  [
                    ['all', 'همه'],
                    ['pending', 'در انتظار تأیید'],
                    ['teacher', 'معلمان'],
                    ['parent', 'والدین'],
                    ['admin', 'مدیران'],
                  ] as const
                ).map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setUserRoleFilter(k);
                      setUserPage(1);
                    }}
                    className={`rounded-lg px-3 py-1 text-xs font-bold cursor-pointer whitespace-nowrap ${
                      userRoleFilter === k ? 'bg-white text-stone-950 shadow-xs' : 'text-stone-700'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {paginatedUsers.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500">
              کاربری مطابق جستجو یا فیلتر انتخاب‌شده یافت نشد.
            </p>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {paginatedUsers.map((u) => {
                  const isParent = u.role === 'parent';
                  const isUserActive = u.isActive !== false;
                  return (
                    <div
                      key={u.uid}
                      className={`rounded-2xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-3 ${
                        !isUserActive ? 'opacity-75' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-extrabold text-sm text-stone-900">{u.displayName}</p>
                          <p className="text-xs font-mono text-stone-600 mt-0.5">
                            {u.username ? `@${u.username}` : u.email}
                          </p>
                          {u.schoolName && (
                            <p className="text-[11px] text-stone-500 mt-0.5">مدرسه: {u.schoolName}</p>
                          )}
                        </div>
                        <div className="text-left text-xs font-bold">
                          {u.role === 'admin' || u.teacherApproved ? (
                            <span className="text-emerald-700">تأییدشده</span>
                          ) : (
                            <span className="text-amber-700">در انتظار تأیید</span>
                          )}
                          {!isUserActive && <div className="text-rose-700">غیرفعال</div>}
                        </div>
                      </div>

                      {u.role === 'admin' ? (
                        <span className="inline-block text-xs font-extrabold text-indigo-800">مدیر کل</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E5DAC5]">
                          <select
                            aria-label={`تغییر نقش ${u.displayName}`}
                            value={u.role === 'teacher' ? 'teacher' : 'parent'}
                            onChange={(e) =>
                              changeUserRole(u.uid, e.target.value as 'parent' | 'teacher', u.displayName)
                            }
                            className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800 cursor-pointer"
                          >
                            <option value="parent">والدین</option>
                            <option value="teacher">معلم</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => toggleUserApproval(u.uid, !u.teacherApproved, u.role)}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap ${
                              u.teacherApproved
                                ? 'border border-amber-300 bg-white text-amber-800'
                                : 'bg-emerald-700 text-white'
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

                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                kind: 'toggle_user_status',
                                user: u,
                                nextActive: !isUserActive,
                              })
                            }
                            className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-700 cursor-pointer"
                          >
                            {isUserActive ? 'غیرفعال' : 'فعال‌سازی'}
                          </button>

                          <button
                            type="button"
                            onClick={() => setConfirmState({ kind: 'delete_user', user: u })}
                            className="rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 cursor-pointer"
                          >
                            حذف
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Sticky-Header Table View */}
              <div className="hidden md:block overflow-x-auto max-h-[540px] overflow-y-auto">
                <table className="w-full text-right text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-[#EFE6D5] text-xs text-stone-500">
                      <th className="py-2.5 font-bold">نام</th>
                      <th className="py-2.5 font-bold">نام کاربری / ایمیل</th>
                      <th className="py-2.5 font-bold">نقش</th>
                      <th className="py-2.5 font-bold">مدرسه</th>
                      <th className="py-2.5 font-bold">وضعیت تأیید و حساب</th>
                      <th className="py-2.5 font-bold">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5EFE2]">
                    {paginatedUsers.map((u) => {
                      const isParent = u.role === 'parent';
                      const isUserActive = u.isActive !== false;
                      return (
                        <tr key={u.uid} className={!isUserActive ? 'bg-stone-50/70 opacity-75' : ''}>
                          <td className="py-3 font-bold text-stone-900">{u.displayName}</td>
                          <td className="py-3 text-stone-600 font-mono text-xs">
                            {u.username ? `@${u.username}` : u.email}
                          </td>
                          <td className="py-3">
                            {u.role === 'admin' ? (
                              <span className="font-bold text-indigo-800 text-xs">مدیر کل</span>
                            ) : (
                              <select
                                aria-label={`تغییر نقش ${u.displayName}`}
                                value={u.role === 'teacher' ? 'teacher' : 'parent'}
                                onChange={(e) =>
                                  changeUserRole(
                                    u.uid,
                                    e.target.value as 'parent' | 'teacher',
                                    u.displayName
                                  )
                                }
                                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-800 cursor-pointer"
                              >
                                <option value="parent">والدین</option>
                                <option value="teacher">معلم</option>
                              </select>
                            )}
                          </td>
                          <td className="py-3 text-xs text-stone-600">{u.schoolName || '—'}</td>
                          <td className="py-3 text-xs font-bold space-y-0.5">
                            <div>
                              {u.role === 'admin' || u.teacherApproved ? (
                                <span className="text-emerald-700">تأییدشده</span>
                              ) : (
                                <span className="text-amber-700">در انتظار تأیید</span>
                              )}
                            </div>
                            {!isUserActive && (
                              <div className="text-rose-700 font-extrabold">حساب غیرفعال</div>
                            )}
                          </td>
                          <td className="py-3">
                            {u.role !== 'admin' && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleUserApproval(u.uid, !u.teacherApproved, u.role)}
                                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap ${
                                    u.teacherApproved
                                      ? 'border border-amber-300 text-amber-800 hover:bg-amber-50'
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

                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmState({
                                      kind: 'toggle_user_status',
                                      user: u,
                                      nextActive: !isUserActive,
                                    })
                                  }
                                  className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap ${
                                    isUserActive
                                      ? 'border-stone-300 text-stone-700 hover:bg-stone-100'
                                      : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                  }`}
                                >
                                  {isUserActive ? (
                                    <>
                                      <UserX className="h-3.5 w-3.5" />
                                      <span>غیرفعال</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="h-3.5 w-3.5" />
                                      <span>فعال‌سازی</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setConfirmState({ kind: 'delete_user', user: u })}
                                  className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer whitespace-nowrap"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>حذف</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {userTotalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F1E8D8] text-xs">
              <span className="font-semibold text-stone-600 tabular-nums">
                صفحه {formatPersianDigits(safeUserPage)} از {formatPersianDigits(userTotalPages)} (مجموع{' '}
                {formatPersianDigits(filteredUsers.length)} کاربر)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safeUserPage <= 1}
                  onClick={() => setUserPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                  <span>صفحه قبل</span>
                </button>
                <button
                  type="button"
                  disabled={safeUserPage >= userTotalPages}
                  onClick={() => setUserPage((p) => Math.min(userTotalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-40 cursor-pointer"
                >
                  <span>صفحه بعد</span>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: STUDENTS & CLASSROOMS */}
      {tab === 'students_classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-extrabold text-stone-900">
                پروفایل‌های دانش‌آموزان ({formatPersianDigits(data.students.length)})
              </h3>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    'students-report.csv',
                    ['نام قهرمان', 'نام کاربری', 'پایه', 'XP', 'سکه', 'تبلیغ اختیاری'],
                    data.students.map((st) => [
                      st.nickname,
                      st.username ? `@${st.username}` : 'بدون رمز مستقل',
                      String(st.gradeId),
                      String(st.xp),
                      String(st.coins),
                      st.allowOptionalAds ? 'روشن' : 'خاموش',
                    ])
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-800 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-teal-700" />
                <span>خروجی CSV دانش‌آموزان</span>
              </button>
            </div>
            {data.students.length === 0 ? (
              <p className="text-sm text-stone-500">هنوز پروفایل دانش‌آموزی ثبت نشده است.</p>
            ) : (
              <>
                <div className="md:hidden space-y-2.5">
                  {data.students.map((st) => (
                    <div
                      key={st.id}
                      className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="font-extrabold text-sm text-stone-900">{st.nickname}</p>
                        <p className="text-xs text-stone-600 mt-0.5">
                          پایه {formatPersianDigits(st.gradeId)} ·{' '}
                          <span className="font-mono">{st.username ? `@${st.username}` : 'بدون رمز مستقل'}</span>
                        </p>
                      </div>
                      <div className="text-left text-xs tabular-nums">
                        <p className="font-extrabold text-teal-800">{formatPersianDigits(st.xp)} XP</p>
                        <p className="font-bold text-amber-700">{formatPersianDigits(st.coins)} سکه</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="sticky top-0 bg-white z-10">
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
              </>
            )}
          </section>

          <section className="lg:col-span-5 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-stone-900">
                مدیریت کلاس‌های درسی ({formatPersianDigits(data.classrooms.length)})
              </h3>
              <p className="text-xs text-stone-500">برای مشاهده نام معلم و فهرست دانش‌آموزان عضو، روی کلاس کلیک کنید.</p>
            </div>
            {data.classrooms.length === 0 ? (
              <p className="text-sm text-stone-500">هنوز کلاسی ایجاد نشده است.</p>
            ) : (
              <div className="space-y-3">
                {data.classrooms.map((cls) => {
                  const isExpanded = expandedClassroomId === cls.id;
                  const members = cls.members || [];
                  return (
                    <div
                      key={cls.id}
                      className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setExpandedClassroomId(isExpanded ? null : cls.id)}
                          className="text-right flex-1 cursor-pointer group"
                        >
                          <p className="text-sm font-extrabold text-stone-900 flex items-center gap-1.5 group-hover:text-indigo-800">
                            <span>{cls.name}</span>
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-stone-500" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-stone-500" />
                            )}
                          </p>
                          <p className="text-xs text-stone-600 mt-0.5">
                            پایه {formatPersianDigits(cls.gradeId)} · معلم: {cls.teacherName || 'نامشخص'} · کد:{' '}
                            <span className="font-mono">{cls.joinCode}</span> ·{' '}
                            <span className={cls.isActive ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                              {cls.isActive ? 'فعال' : 'بسته‌شده'}
                            </span>{' '}
                            ({formatPersianDigits(members.length)} عضو)
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleClassroomActive(cls.id, !cls.isActive)}
                          className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold cursor-pointer shrink-0 ${
                            cls.isActive
                              ? 'border border-rose-300 text-rose-700 hover:bg-rose-50'
                              : 'bg-emerald-700 text-white hover:bg-emerald-800'
                          }`}
                        >
                          <Power className="h-3.5 w-3.5" />
                          <span>{cls.isActive ? 'بستن کلاس' : 'فعال‌سازی'}</span>
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="rounded-lg border border-[#E5DAC5] bg-white p-3 space-y-1.5">
                          <p className="text-xs font-bold text-stone-700">
                            اعضای کلاس ({formatPersianDigits(members.length)} دانش‌آموز):
                          </p>
                          {members.length === 0 ? (
                            <p className="text-xs text-stone-500">هنوز دانش‌آموزی با کد عضویت وارد این کلاس نشده است.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {members.map((m) => (
                                <span
                                  key={m.studentId}
                                  className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-[#FBF7EF] px-2.5 py-1 text-xs font-bold text-stone-800"
                                >
                                  {m.nickname} (پایه {formatPersianDigits(m.gradeId)})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                <div className="relative">
                  <Search className="h-4 w-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={contentSearch}
                    onChange={(e) => {
                      setContentSearch(e.target.value);
                      setContentPage(1);
                    }}
                    placeholder="جستجو در متن سؤال، مبحث یا فصل..."
                    className="w-56 sm:w-64 rounded-xl border border-stone-300 bg-white pr-9 pl-3 py-1.5 text-xs font-medium text-stone-900"
                  />
                </div>
                <select
                  value={contentGradeFilter}
                  onChange={(e) => {
                    setContentGradeFilter(Number(e.target.value));
                    setContentPage(1);
                  }}
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
                  onChange={(e) => {
                    setContentStatusFilter(
                      e.target.value as 'all' | 'approved' | 'pending_review' | 'rejected'
                    );
                    setContentPage(1);
                  }}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
                >
                  <option value="all">همه وضعیت‌ها</option>
                  <option value="approved">تأیید و منتشرشده</option>
                  <option value="pending_review">در صف بررسی</option>
                  <option value="rejected">ردشده</option>
                </select>
              </div>
            </div>

            {paginatedContent.length === 0 ? (
              <p className="py-8 text-center text-sm text-stone-500">
                موردی در بانک محتوا با این فیلتر یافت نشد.
              </p>
            ) : (
              <div className="divide-y divide-[#F1E8D8]">
                {paginatedContent.map((c) => (
                  <div key={c.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 max-w-2xl">
                      <p className="text-xs font-semibold text-stone-500 flex flex-wrap items-center gap-1.5">
                        <span>پایه {formatPersianDigits(c.gradeId)}</span>
                        <span>·</span>
                        <span>{c.chapterId}</span>
                        <span>·</span>
                        <span>{c.topicId}</span>
                        <span>·</span>
                        <span>
                          {QUESTION_TYPE_LABELS[c.questionType as QuestionType] || c.questionType}
                        </span>
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
                      {c.reviewStatus === 'rejected' && c.rejectionReason && (
                        <p className="text-xs font-semibold text-rose-700">
                          علت رد: {c.rejectionReason}
                        </p>
                      )}
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
                          onClick={() => {
                            setRejectTarget({ id: c.id, promptText: c.promptText });
                            setRejectReason('');
                          }}
                          className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50 cursor-pointer"
                        >
                          توقف انتشار
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmState({ kind: 'delete_content', item: c })}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {contentTotalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#F1E8D8] text-xs">
                <span className="font-semibold text-stone-600 tabular-nums">
                  صفحه {formatPersianDigits(safeContentPage)} از{' '}
                  {formatPersianDigits(contentTotalPages)} (مجموع{' '}
                  {formatPersianDigits(filteredContent.length)} سؤال)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safeContentPage <= 1}
                    onClick={() => setContentPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="h-4 w-4" />
                    <span>صفحه قبل</span>
                  </button>
                  <button
                    type="button"
                    disabled={safeContentPage >= contentTotalPages}
                    onClick={() => setContentPage((p) => Math.min(contentTotalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-40 cursor-pointer"
                  >
                    <span>صفحه بعد</span>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR DESTRUCTIVE / SENSITIVE ACTIONS */}
      {confirmState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E5DAC5] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 id="admin-confirm-title" className="text-base font-extrabold text-stone-900">
                  {confirmState.kind === 'delete_content'
                    ? 'تأیید حذف سؤال از بانک محتوا'
                    : confirmState.kind === 'delete_user'
                      ? 'تأیید حذف دائمی حساب کاربری'
                      : confirmState.kind === 'delete_announcement'
                        ? 'تأیید حذف اطلاعیه سراسری'
                        : confirmState.nextActive
                          ? 'تأیید فعال‌سازی حساب کاربری'
                          : 'تأیید غیرفعال‌سازی حساب کاربری'}
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {confirmState.kind === 'delete_content' && (
                    <>
                      آیا مطمئن هستید که می‌خواهید سؤال «{confirmState.item.promptText.slice(0, 80)}
                      » را برای همیشه از بانک محتوا حذف کنید؟ این عملیات قابل بازگشت نیست.
                    </>
                  )}
                  {confirmState.kind === 'delete_user' && (
                    <>
                      آیا مطمئن هستید که می‌خواهید حساب «{confirmState.user.displayName}» (
                      {confirmState.user.username ? `@${confirmState.user.username}` : confirmState.user.email}
                      ) و پروفایل‌های دانش‌آموز وابسته به آن را حذف کنید؟ این عملیات قابل بازگشت نیست.
                    </>
                  )}
                  {confirmState.kind === 'delete_announcement' && (
                    <>
                      آیا از حذف اطلاعیه سراسری «{confirmState.announcement.message.slice(0, 70)}» مطمئن هستید؟
                    </>
                  )}
                  {confirmState.kind === 'toggle_user_status' &&
                    (confirmState.nextActive
                      ? `آیا حساب «${confirmState.user.displayName}» دوباره فعال شود تا امکان ورود داشته باشد؟`
                      : `با غیرفعال‌سازی، کاربر «${confirmState.user.displayName}» دیگر امکان ورود و استفاده از سامانه را نخواهد داشت.`)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmState(null)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={executeConfirmedAction}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-60 ${
                  confirmState.kind === 'toggle_user_status' && confirmState.nextActive
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : 'bg-rose-700 hover:bg-rose-800'
                }`}
              >
                {confirmBusy
                  ? 'در حال انجام...'
                  : confirmState.kind === 'toggle_user_status' && confirmState.nextActive
                    ? 'بله، فعال شود'
                    : 'بله، تأیید و اجرا'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {rejectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
        >
          <form
            onSubmit={handleConfirmReject}
            className="w-full max-w-md rounded-2xl border border-[#E5DAC5] bg-white p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-extrabold text-stone-900">ثبت علت رد یا توقف انتشار سؤال</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              سؤال: «{rejectTarget.promptText.slice(0, 100)}»
            </p>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                علت رد (این پیام در پنل معلم نمایش داده می‌شود تا سؤال را اصلاح کند):
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="مثلاً: صورت سؤال مبهم است یا گزینه صحیح با پایه تحصیلی همخوانی ندارد."
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm"
                required
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={rejectBusy}
                onClick={() => setRejectTarget(null)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={rejectBusy}
                className="rounded-xl bg-rose-700 hover:bg-rose-800 px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
              >
                {rejectBusy ? 'در حال ثبت...' : 'تأیید رد و ثبت علت'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
