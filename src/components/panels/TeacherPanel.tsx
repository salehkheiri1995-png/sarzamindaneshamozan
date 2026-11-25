import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DbUser, useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { StructuredAiReport } from '../../types/game';
import {
  BookId,
  DIFFICULTY_LABELS,
  DifficultyLevel,
  GRADES,
  REALMS,
  QUESTION_TYPE_LABELS,
  formatPersianDigits,
} from '../../shared/curriculum';
import { apiFetch } from '../../lib/api';
import { soundEngine } from '../../lib/sound';
import { SkeletonLoader } from '../common/SkeletonLoader';
import { ManualQuestionBuilder } from './ManualQuestionBuilder';
import { ChangePasswordCard } from './ChangePasswordCard';
import { TeacherExamBuilder } from './teacher/TeacherExamBuilder';
import { TeacherHomeworkTab } from './teacher/TeacherHomeworkTab';
import {
  TeacherClassroomRow,
  TeacherDashboardData,
  TeacherDeleteTarget,
  TeacherQuestionRow,
} from './teacher/types';
import {
  GraduationCap,
  Plus,
  Sparkles,
  CheckCircle2,
  Video,
  Download,
  Send,
  Clock,
  Image as ImageIcon,
  Power,
  Pencil,
  Trash2,
  AlertTriangle,
  Megaphone,
  Lock,
  XCircle,
  Copy,
  BarChart3,
  AlertCircle,
  RefreshCw,
  X,
  Search,
  Users,
  UserMinus,
  Flame,
  KeyRound,
  ChevronDown,
  ChevronUp,
  UserCheck,
} from 'lucide-react';

interface TeacherPanelProps {
  dbUser: DbUser;
  onUserRefreshed: () => void;
}

const QUESTION_PAGE_SIZE = 10;

export function TeacherPanel({ dbUser, onUserRefreshed }: TeacherPanelProps) {
  const { globalAnnouncements: authGlobalAnnouncements } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'classes' | 'questions' | 'homework' | 'media_exams' | 'account'>('classes');
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Teacher registration / profile form
  const [teacherName, setTeacherName] = useState(dbUser.displayName || '');
  const [schoolName, setSchoolName] = useState(dbUser.schoolName || '');
  const [applying, setApplying] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // New Classroom form & Classroom Management
  const [className, setClassName] = useState('');
  const [classGrade, setClassGrade] = useState(3);
  const [expandedClassMembers, setExpandedClassMembers] = useState<Record<number, boolean>>({});
  const [editingClassroom, setEditingClassroom] = useState<TeacherClassroomRow | null>(null);
  const [editClassName, setEditClassName] = useState('');
  const [editClassGrade, setEditClassGrade] = useState(3);
  const [savingClassEdit, setSavingClassEdit] = useState(false);

  // Student Progress Dashboard Filters
  const [studentClassFilter, setStudentClassFilter] = useState<number | 'all'>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentSort, setStudentSort] = useState<'xp' | 'correctRate' | 'homeworks' | 'streak'>('xp');

  // New Question + AI Assistant
  const [qClassId, setQClassId] = useState<number | ''>('');
  const [qGrade, setQGrade] = useState(3);
  const [qBook, setQBook] = useState<BookId>('math');
  const [qChapter, setQChapter] = useState('فصل ۲');
  const [qTopic, setQTopic] = useState('ضرب و تقسیم');
  const [qDifficulty, setQDifficulty] = useState<DifficultyLevel>('medium');
  const [qType, setQType] = useState<'mcq' | 'true_false' | 'fill_blank' | 'pattern_puzzle'>('mcq');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Question Bank Search, Filters & Student Response Expansion
  const [qSearch, setQSearch] = useState('');
  const [qStatusFilter, setQStatusFilter] = useState<'all' | 'pending_review' | 'approved' | 'rejected'>('all');
  const [qGradeFilter, setQGradeFilter] = useState<number | 'all'>('all');
  const [qBookFilter, setQBookFilter] = useState<string>('all');
  const [qVisibleCount, setQVisibleCount] = useState(QUESTION_PAGE_SIZE);
  const [expandedResponseQIds, setExpandedResponseQIds] = useState<Record<number, boolean>>({});

  // Edit Question modal
  const [editingQuestion, setEditingQuestion] = useState<TeacherQuestionRow | null>(null);
  const [editQClassId, setEditQClassId] = useState<number | ''>('');
  const [editQGrade, setEditQGrade] = useState(3);
  const [editQBook, setEditQBook] = useState<BookId>('math');
  const [editQDifficulty, setEditQDifficulty] = useState<DifficultyLevel>('medium');
  const [editPrompt, setEditPrompt] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editChapter, setEditChapter] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  // Unified Confirm Modal (deletions + code regeneration)
  const [confirmAction, setConfirmAction] = useState<
    | TeacherDeleteTarget
    | { kind: 'regen_code'; id: number; label: string }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // New Video & Announcement
  const [vidClassId, setVidClassId] = useState<number | ''>('');
  const [vidBook, setVidBook] = useState<BookId>('math');
  const [vidTitle, setVidTitle] = useState('');
  const [vidUrl, setVidUrl] = useState('');
  const [vidChapter, setVidChapter] = useState('فصل ۱');
  const [vidDuration, setVidDuration] = useState('05:00');
  const [vidFollowUpPrompt, setVidFollowUpPrompt] = useState('');
  const [vidFollowUpOpt1, setVidFollowUpOpt1] = useState('');
  const [vidFollowUpOpt2, setVidFollowUpOpt2] = useState('');

  const [annClassId, setAnnClassId] = useState<number | ''>('');
  const [annKind, setAnnKind] = useState<'schedule' | 'encouragement' | 'homework'>('schedule');
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annDate, setAnnDate] = useState('۱۴۰۴/۰۹/۱۵');

  // Per-student Structured AI Report Modal
  const [aiModalStudent, setAiModalStudent] = useState<{ studentId: number; nickname: string } | null>(null);
  const [aiReport, setAiReport] = useState<StructuredAiReport | null>(null);
  const [aiCached, setAiCached] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const isApprovedTeacher =
    dbUser.role === 'admin' || (dbUser.role === 'teacher' && dbUser.teacherApproved);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<TeacherDashboardData>('/api/teacher/dashboard');
      setData(res);
      if (res.classrooms.length > 0) {
        setVidClassId((prev) => (prev === '' ? res.classrooms[0].id : prev));
        setAnnClassId((prev) => (prev === '' ? res.classrooms[0].id : prev));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'خطا در بارگذاری پنل معلم.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    setTeacherName(dbUser.displayName || '');
    setSchoolName(dbUser.schoolName || '');
  }, [dbUser.displayName, dbUser.schoolName]);

  const globalNotices = data?.globalAnnouncements || authGlobalAnnouncements || [];

  const handleApplyTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setApplying(true);
    setErrorMsg(null);
    try {
      await apiFetch('/api/teacher/apply', {
        method: 'POST',
        body: JSON.stringify({
          displayName: teacherName,
          schoolName,
          teachingGrades: [1, 2, 3, 4, 5, 6],
          teachingSubjects: ['math', 'persian', 'science', 'social', 'quran_hedyeh'],
        }),
      });
      soundEngine.playCorrect();
      setStatusMsg('درخواست حساب معلم شما ثبت شد. پس از تأیید مدیر سامانه، تمام امکانات معلم فعال می‌شود.');
      onUserRefreshed();
      await loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ثبت درخواست ناموفق بود.');
    } finally {
      setApplying(false);
    }
  };

  // LOCKED UNAPPROVED TEACHER VIEW: Only profile + clear banner + password card + global announcements
  if (!isApprovedTeacher) {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        {globalNotices.length > 0 && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 space-y-2">
            <p className="text-xs font-extrabold text-indigo-900 flex items-center gap-1.5">
              <Megaphone className="h-4 w-4" />
              <span>اطلاعیه‌های سراسری مدیریت سامانه</span>
            </p>
            {globalNotices.slice(0, 3).map((a) => (
              <div key={a.id} className="rounded-xl bg-white border border-indigo-100 px-3.5 py-2 text-xs text-stone-800">
                {a.title && <span className="font-extrabold text-indigo-900 ml-1.5">{a.title}:</span>}
                <span>{a.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-3xl border border-[#E5DAC5] bg-white p-7 space-y-6">
          <div className="flex items-start gap-3">
            <GraduationCap className="h-8 w-8 text-teal-700 shrink-0" />
            <div>
              <h2 className="text-2xl font-extrabold text-stone-900">پروفایل و وضعیت تأیید حساب معلم</h2>
              <p className="mt-1 text-sm text-stone-600">
                تا زمان تأیید حساب توسط مدیر کل، فقط مشاهده پروفایل و ویرایش مشخصات فعال است.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-950 flex items-start gap-2.5">
            <Lock className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>در انتظار تأیید مدیر سامانه</p>
              <p className="text-xs font-medium text-amber-900 leading-relaxed">
                امکان ساخت کلاس، تعریف تکلیف، برگزاری آزمون و طراحی سؤال پس از تأیید حساب شما در «پنل مدیریت مرکزی» به‌صورت خودکار باز می‌شود.
              </p>
            </div>
          </div>

          <form onSubmit={handleApplyTeacher} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">نام و نام خانوادگی معلم</label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">نام مدرسه (اختیاری)</label>
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="مثلاً: دبستان دانش‌پژوهان"
                className="w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm"
              />
            </div>
            {statusMsg && <p className="text-sm font-bold text-emerald-800">{statusMsg}</p>}
            {errorMsg && <p className="text-sm font-bold text-rose-700">{errorMsg}</p>}
            <button
              type="submit"
              disabled={applying}
              className="rounded-xl bg-teal-700 hover:bg-teal-800 px-6 py-3 text-sm font-bold text-white cursor-pointer"
            >
              {applying ? 'در حال ثبت...' : 'بروزرسانی مشخصات و ارسال درخواست تأیید'}
            </button>
          </form>

          <div className="pt-4 border-t border-[#F1E8D8]">
            <ChangePasswordCard hasPassword={dbUser.hasPassword} onChanged={onUserRefreshed} />
          </div>
        </div>
      </div>
    );
  }

  // Computed summary metrics
  const activeClassCount = (data?.classrooms || []).filter((c) => c.isActive).length;
  const totalUniqueStudents = new Set((data?.enrollments || []).map((e) => e.studentId)).size;
  const pendingSubmissionsCount = (data?.submissions || []).filter((s) => s.status === 'submitted').length;
  const reviewQueueCount = (data?.questions || []).filter((q) => q.reviewStatus !== 'approved').length;

  // Filtered & sorted student stats
  const filteredStudentStats = useMemo(() => {
    const raw = data?.classStudentStats || [];
    const term = studentSearch.trim().toLowerCase();
    const filtered = raw.filter((st) => {
      if (studentClassFilter !== 'all' && st.classroomId !== studentClassFilter) return false;
      if (term && !st.nickname.toLowerCase().includes(term)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (studentSort === 'correctRate') return b.correctRate - a.correctRate;
      if (studentSort === 'homeworks') return b.submittedHomeworksCount - a.submittedHomeworksCount;
      if (studentSort === 'streak') return (b.currentStreak || 0) - (a.currentStreak || 0);
      return b.xp - a.xp;
    });
  }, [data?.classStudentStats, studentClassFilter, studentSearch, studentSort]);

  // Filtered teacher question bank
  const filteredQuestions = useMemo(() => {
    const raw = data?.questions || [];
    const term = qSearch.trim().toLowerCase();
    return raw.filter((q) => {
      if (qStatusFilter !== 'all' && q.reviewStatus !== qStatusFilter) return false;
      if (qGradeFilter !== 'all' && q.gradeId !== qGradeFilter) return false;
      if (qBookFilter !== 'all' && q.bookId !== qBookFilter) return false;
      if (
        term &&
        !q.promptText.toLowerCase().includes(term) &&
        !q.topicId.toLowerCase().includes(term) &&
        !q.chapterId.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [data?.questions, qSearch, qStatusFilter, qGradeFilter, qBookFilter]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherName.trim()) return;
    setSavingProfile(true);
    try {
      await apiFetch('/api/teacher/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: teacherName.trim(),
          schoolName: schoolName.trim(),
        }),
      });
      soundEngine.playCorrect();
      showToast('مشخصات پروفایل معلم با موفقیت ذخیره شد.', 'success');
      onUserRefreshed();
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ذخیره پروفایل ناموفق بود.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch<{ classroom: { name: string; joinCode: string } }>(
        '/api/teacher/classrooms',
        {
          method: 'POST',
          body: JSON.stringify({ name: className.trim(), gradeId: classGrade }),
        }
      );
      soundEngine.playVictory();
      setClassName('');
      const msg = `کلاس «${res.classroom.name}» ساخته شد! کد عضویت دانش‌آموزان: ${res.classroom.joinCode}`;
      setStatusMsg(msg);
      showToast(msg, 'success');
      loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ساخت کلاس ناموفق بود.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    }
  };

  const openEditClassroom = (cls: TeacherClassroomRow) => {
    setEditingClassroom(cls);
    setEditClassName(cls.name);
    setEditClassGrade(cls.gradeId);
  };

  const handleSaveClassroomEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClassroom || !editClassName.trim()) return;
    setSavingClassEdit(true);
    try {
      await apiFetch(`/api/teacher/classrooms/${editingClassroom.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editClassName.trim(),
          gradeId: editClassGrade,
        }),
      });
      soundEngine.playCorrect();
      setEditingClassroom(null);
      showToast('مشخصات کلاس بروزرسانی شد.', 'success');
      await loadDashboard();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ویرایش کلاس ناموفق بود.', 'error');
    } finally {
      setSavingClassEdit(false);
    }
  };

  const handleCopyJoinCode = async (joinCode: string) => {
    try {
      await navigator.clipboard.writeText(joinCode);
      soundEngine.playClick();
      showToast('کد کلاس کپی شد!', 'success');
    } catch {
      showToast(`کد عضویت کلاس: ${joinCode}`, 'info');
    }
  };

  const handleOpenStudentAiReport = async (
    student: { studentId: number; nickname: string },
    forceRefresh = false
  ) => {
    setAiModalStudent(student);
    setAiLoading(true);
    setAiError(null);
    if (!forceRefresh) {
      setAiReport(null);
    }
    try {
      const res = await apiFetch<{
        report: StructuredAiReport;
        cached: boolean;
      }>(`/api/students/${student.studentId}/ai-report`, {
        method: 'POST',
        body: JSON.stringify({ forceRefresh }),
      });
      setAiReport(res.report);
      setAiCached(res.cached);
      soundEngine.playCorrect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'دریافت تحلیل هوشمند پیشرفت ناموفق بود.';
      setAiError(msg);
      showToast(msg, 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggleClassroomStatus = async (id: number, nextActive: boolean) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiFetch(`/api/teacher/classrooms/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: nextActive }),
      });
      soundEngine.playClick();
      const msg = nextActive
        ? 'کلاس فعال شد و دانش‌آموزان می‌توانند با کد عضویت وارد شوند.'
        : 'کلاس بسته شد؛ عضویت دانش‌آموز جدید متوقف گردید و در پنل دانش‌آموز/والدین «بسته‌شده» نمایش داده می‌شود.';
      setStatusMsg(msg);
      showToast(nextActive ? 'کلاس فعال شد.' : 'کلاس بسته شد.', 'info');
      loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تغییر وضعیت کلاس ناموفق بود.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    }
  };

  const handleAiGenerateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiGenerating(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const targetClassId = qClassId ? Number(qClassId) : null;
      await apiFetch('/api/ai/generate-question', {
        method: 'POST',
        body: JSON.stringify({
          classroomId: targetClassId,
          gradeId: qGrade,
          bookId: qBook,
          chapterId: qChapter,
          topicId: qTopic,
          difficulty: qDifficulty,
          questionType: qType,
        }),
      });
      soundEngine.playCorrect();
      const msg = targetClassId
        ? 'سؤال هوشمند تولید شد و بلافاصله برای دانش‌آموزان کلاس منتشر گردید!'
        : 'سؤال پیشنهادی هوش مصنوعی تولید شد و با وضعیت «در صف بررسی مدیر» ثبت گردید. پس از تأیید مدیر کل در دنیای بازی دانش‌آموزان منتشر می‌شود.';
      setStatusMsg(msg);
      showToast(
        targetClassId ? 'سؤال هوشمند در کلاس منتشر شد.' : 'پیش‌نویس سؤال هوشمند با موفقیت ثبت شد.',
        'success'
      );
      loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'تولید سؤال هوشمند با خطا مواجه شد.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setAiGenerating(false);
    }
  };

  const openEditQuestion = (q: TeacherQuestionRow) => {
    setEditingQuestion(q);
    setEditQClassId(q.classroomId ?? '');
    setEditQGrade(q.gradeId);
    setEditQBook(q.bookId);
    setEditQDifficulty(q.difficulty || 'medium');
    setEditPrompt(q.promptText);
    setEditAnswer(q.correctAnswer);
    setEditTopic(q.topicId);
    setEditChapter(q.chapterId);
    setEditHint(q.hintText || '');
    setEditExplanation(q.explanation || '');

    const rawOpts = Array.isArray(q.payload?.options)
      ? (q.payload?.options as string[])
      : Array.isArray(q.payload?.choices)
        ? (q.payload?.choices as string[])
        : [];
    setEditOptions(rawOpts.map(String));
  };

  const handleSaveEditedQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !editPrompt.trim() || !editAnswer.trim()) return;
    setSavingEdit(true);
    setErrorMsg(null);
    try {
      const nextPayload = { ...(editingQuestion.payload || {}) };
      const cleanedOpts = editOptions.map((o) => o.trim()).filter(Boolean);
      if (cleanedOpts.length >= 2) {
        if (editingQuestion.questionType === 'fill_blank') {
          nextPayload.choices = cleanedOpts;
        } else {
          nextPayload.options = cleanedOpts;
        }
      }

      const targetClassId = editQClassId ? Number(editQClassId) : null;
      await apiFetch(`/api/teacher/questions/${editingQuestion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          classroomId: targetClassId,
          gradeId: editQGrade,
          bookId: editQBook,
          difficulty: editQDifficulty,
          promptText: editPrompt.trim(),
          correctAnswer: editAnswer.trim(),
          topicId: editTopic.trim(),
          chapterId: editChapter.trim(),
          hintText: editHint.trim(),
          explanation: editExplanation.trim(),
          payload: cleanedOpts.length >= 2 ? nextPayload : undefined,
        }),
      });
      soundEngine.playCorrect();
      setEditingQuestion(null);
      const msg = targetClassId
        ? 'سؤال ویرایش و در کلاس به‌روزرسانی شد.'
        : 'سؤال ویرایش شد و دوباره برای بررسی و تأیید مدیر کل ارسال گردید.';
      setStatusMsg(msg);
      showToast(msg, 'success');
      loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ویرایش سؤال ناموفق بود.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExecuteConfirm = async () => {
    if (!confirmAction) return;
    setConfirmBusy(true);
    setErrorMsg(null);
    try {
      if (confirmAction.kind === 'question') {
        await apiFetch(`/api/teacher/questions/${confirmAction.id}`, { method: 'DELETE' });
        showToast('سؤال از بانک سؤالات شما حذف شد.', 'info');
      } else if (confirmAction.kind === 'video') {
        await apiFetch(`/api/teacher/videos/${confirmAction.id}`, { method: 'DELETE' });
        showToast('فیلم آموزشی حذف شد.', 'info');
      } else if (confirmAction.kind === 'homework') {
        await apiFetch(`/api/teacher/homeworks/${confirmAction.id}`, { method: 'DELETE' });
        showToast('تکلیف با موفقیت حذف شد.', 'info');
      } else if (confirmAction.kind === 'exam') {
        await apiFetch(`/api/teacher/exams/${confirmAction.id}`, { method: 'DELETE' });
        showToast('آزمون حذف شد.', 'info');
      } else if (confirmAction.kind === 'announcement') {
        await apiFetch(`/api/teacher/announcements/${confirmAction.id}`, { method: 'DELETE' });
        showToast('اطلاعیه کلاسی حذف شد.', 'info');
      } else if (confirmAction.kind === 'member') {
        await apiFetch(
          `/api/teacher/classrooms/${confirmAction.classroomId}/members/${confirmAction.studentId}`,
          { method: 'DELETE' }
        );
        showToast('دانش‌آموز از کلاس خارج شد.', 'info');
      } else if (confirmAction.kind === 'regen_code') {
        const res = await apiFetch<{ classroom: TeacherClassroomRow }>(
          `/api/teacher/classrooms/${confirmAction.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ regenerateJoinCode: true }),
          }
        );
        showToast(`کد عضویت جدید کلاس: ${res.classroom.joinCode}`, 'success');
      }
      soundEngine.playClick();
      setConfirmAction(null);
      await loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'انجام عملیات با خطا مواجه شد.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const handlePublishVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cls = data?.classrooms.find((c) => c.id === Number(vidClassId));
    const followOpts = [vidFollowUpOpt1.trim(), vidFollowUpOpt2.trim()].filter(Boolean);
    const hasCustomFollowUp = Boolean(vidFollowUpPrompt.trim() && followOpts.length >= 2);
    try {
      await apiFetch('/api/teacher/videos', {
        method: 'POST',
        body: JSON.stringify({
          classroomId: cls?.id,
          gradeId: cls?.gradeId || 3,
          bookId: vidBook,
          chapterId: vidChapter.trim() || 'درس آموزشی',
          title: vidTitle.trim(),
          description: 'فیلم آموزشی اختصاصی کلاس',
          durationLabel: vidDuration.trim() || '05:00',
          videoUrl: vidUrl.trim(),
          followUpQuestion: hasCustomFollowUp
            ? {
                promptText: vidFollowUpPrompt.trim(),
                options: followOpts,
                correctAnswer: followOpts[0],
              }
            : undefined,
        }),
      });
      soundEngine.playVictory();
      setVidTitle('');
      setVidUrl('');
      setVidFollowUpPrompt('');
      setVidFollowUpOpt1('');
      setVidFollowUpOpt2('');
      const msg = 'فیلم آموزشی و پرسش سنجش پس از تماشا در کلاس منتشر شد.';
      setStatusMsg(msg);
      showToast(msg, 'success');
      loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'انتشار فیلم ناموفق بود.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    }
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annClassId || !annMessage.trim()) return;
    try {
      await apiFetch('/api/teacher/announcements', {
        method: 'POST',
        body: JSON.stringify({
          classroomId: Number(annClassId),
          kind: annKind,
          title: annTitle.trim() || undefined,
          message: annMessage.trim(),
          scheduledDate: annDate.trim() || undefined,
        }),
      });
      soundEngine.playClick();
      setAnnTitle('');
      setAnnMessage('');
      const msg = 'اعلان آموزشی و یادآور تقویم برای کلاس ارسال شد و اعلان آن برای دانش‌آموزان و والدین ثبت گردید.';
      setStatusMsg(msg);
      showToast('اطلاعیه کلاسی با موفقیت ارسال شد.', 'success');
      loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ارسال پیام ناموفق بود.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    }
  };

  const exportCsvReport = () => {
    if (!data) return;
    const stats = filteredStudentStats.length > 0 ? filteredStudentStats : data.classStudentStats || [];
    const headers = [
      'نام دانش‌آموز',
      'پایه',
      'استریک (روز)',
      'مأموریت حل‌شده',
      'درصد دقت',
      'تکالیف تحویلی',
      'میانگین آزمون (٪)',
      'امتیاز XP',
      'سکه',
    ];
    const rows =
      stats.length > 0
        ? stats.map((s) => [
            s.nickname,
            String(s.gradeId),
            String(s.currentStreak || 1),
            String(s.solvedMissionsCount),
            String(s.correctRate),
            `${s.submittedHomeworksCount}/${s.totalClassHomeworks}`,
            s.avgExamScorePct !== null ? String(s.avgExamScorePct) : '—',
            String(s.xp),
            String(s.coins),
          ])
        : data.enrollments.map((e) => [
            e.nickname,
            String(e.gradeId),
            String(e.currentStreak || 1),
            '0',
            '0',
            '0',
            '—',
            String(e.xp),
            String(e.coins),
          ]);
    const csv = '\uFEFF' + [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classroom-report.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('فایل گزارش CSV کلاس آماده و دانلود شد.', 'success');
  };

  const getConfirmTitle = () => {
    if (!confirmAction) return '';
    switch (confirmAction.kind) {
      case 'question':
        return 'تأیید حذف سؤال';
      case 'video':
        return 'تأیید حذف فیلم آموزشی';
      case 'homework':
        return 'تأیید حذف تکلیف';
      case 'exam':
        return 'تأیید حذف آزمون';
      case 'announcement':
        return 'تأیید حذف اطلاعیه کلاسی';
      case 'member':
        return 'تأیید خروج دانش‌آموز از کلاس';
      case 'regen_code':
        return 'تأیید ساخت کد عضویت جدید';
    }
  };

  const getConfirmBody = () => {
    if (!confirmAction) return '';
    if (confirmAction.kind === 'regen_code') {
      return `با صدور کد عضویت جدید برای «${confirmAction.label}»، کد قبلی برای دانش‌آموزان جدید غیرفعال می‌شود. آیا ادامه می‌دهید؟`;
    }
    if (confirmAction.kind === 'member') {
      return `آیا مطمئن هستید که می‌خواهید دانش‌آموز «${confirmAction.label}» را از این کلاس خارج کنید؟ دانش‌آموز و والدین اعلان دریافت می‌کنند.`;
    }
    return `آیا مطمئن هستید که می‌خواهید «${confirmAction.label}» را حذف کنید؟ این عملیات قابل بازگشت نیست.`;
  };

  return (
    <div className="space-y-6">
      {/* Global Admin Announcements Banner */}
      {globalNotices.length > 0 && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/75 p-4 space-y-2">
          <p className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
            <Megaphone className="h-4 w-4 text-indigo-700" />
            <span>اطلاعیه‌های سراسری مدیریت سامانه</span>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {globalNotices.slice(0, 4).map((a) => (
              <div key={a.id} className="rounded-xl border border-indigo-100 bg-white px-3.5 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-2 font-bold text-indigo-900">
                  <span>{a.title || `پیام از ${a.senderName}`}</span>
                  {a.scheduledDate && <span className="text-stone-500">{a.scheduledDate}</span>}
                </div>
                <p className="mt-1 text-stone-700 leading-relaxed">{a.message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-stone-900">
            پنل جامع معلمان {dbUser.schoolName ? `· ${dbUser.schoolName}` : ''}
          </h2>
          <p className="text-sm text-stone-600">
            مدیریت کلاس‌ها و اعضا، پایش پیشرفت دانش‌آموزان، بانک سؤال و هوش مصنوعی، تصحیح تکالیف و آزمون‌ساز
          </p>
        </div>

        <button
          type="button"
          onClick={exportCsvReport}
          className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 px-4 py-2 text-sm font-bold text-stone-800 cursor-pointer whitespace-nowrap"
        >
          <Download className="h-4 w-4 text-teal-700" />
          <span>خروجی Excel / CSV کلاس</span>
        </button>
      </div>

      {/* Top Interactive Summary KPI Strip */}
      {!loading && data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setTab('classes');
            }}
            className="rounded-2xl border border-[#E5DAC5] bg-white hover:border-teal-400 p-4 text-right transition-colors cursor-pointer"
          >
            <p className="text-xs font-semibold text-stone-500">کلاس‌های فعال</p>
            <p className="mt-1 text-2xl font-extrabold text-teal-800 tabular-nums">
              {formatPersianDigits(activeClassCount)} از {formatPersianDigits(data.classrooms.length)}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-stone-500">مشاهده و مدیریت کلاس‌ها</p>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setTab('classes');
            }}
            className="rounded-2xl border border-[#E5DAC5] bg-white hover:border-amber-400 p-4 text-right transition-colors cursor-pointer"
          >
            <p className="text-xs font-semibold text-stone-500">کل دانش‌آموزان عضو</p>
            <p className="mt-1 text-2xl font-extrabold text-stone-900 tabular-nums">
              {formatPersianDigits(totalUniqueStudents)} نفر
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-stone-500">پایش پیشرفت و گزارش هوشمند</p>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setTab('homework');
            }}
            className="rounded-2xl border border-[#E5DAC5] bg-white hover:border-emerald-400 p-4 text-right transition-colors cursor-pointer"
          >
            <p className="text-xs font-semibold text-stone-500">تکالیف منتظر بازخورد</p>
            <p
              className={`mt-1 text-2xl font-extrabold tabular-nums ${
                pendingSubmissionsCount > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {formatPersianDigits(pendingSubmissionsCount)} ارسال
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-stone-500">
              {pendingSubmissionsCount > 0 ? 'نیازمند بررسی و نمره معلم' : 'همه تکالیف تصحیح شده‌اند'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setTab('questions');
            }}
            className="rounded-2xl border border-[#E5DAC5] bg-white hover:border-indigo-400 p-4 text-right transition-colors cursor-pointer"
          >
            <p className="text-xs font-semibold text-stone-500">سؤالات در صف / نیازمند اصلاح</p>
            <p
              className={`mt-1 text-2xl font-extrabold tabular-nums ${
                reviewQueueCount > 0 ? 'text-indigo-700' : 'text-emerald-700'
              }`}
            >
              {formatPersianDigits(reviewQueueCount)} سؤال
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-stone-500">
              کل سؤالات من: {formatPersianDigits(data.questions.length)}
            </p>
          </button>
        </div>
      )}

      {/* Segmented Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-[#EFE6D5] p-1.5">
        {(
          [
            ['classes', 'کلاس‌ها و پیشرفت دانش‌آموزان'],
            ['questions', 'بانک سؤال و هوش مصنوعی'],
            ['homework', 'تکالیف، کارنامه و تصحیح'],
            ['media_exams', 'آزمون‌ساز، فیلم و تقویم'],
            ['account', 'پروفایل و امنیت حساب'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setTab(k);
            }}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
              tab === k ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-700 hover:text-stone-950'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950 flex items-center justify-between gap-2">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-emerald-800 hover:text-emerald-950 cursor-pointer"
            aria-label="بستن پیام"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900 flex items-center justify-between gap-2">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-800 hover:text-rose-950 cursor-pointer"
            aria-label="بستن خطا"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading ? (
        <SkeletonLoader variant="panel" />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {/* TAB 1: CLASSROOMS & STUDENT PROGRESS DASHBOARD */}
            {tab === 'classes' && (
              <div className="space-y-6">
                {/* Live Per-Class KPI Cards */}
                {(data?.classKpis || []).length > 0 && (
                  <section className="rounded-2xl border border-[#E5DAC5] bg-white p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-teal-700" />
                        <h3 className="text-base font-extrabold text-stone-900">
                          شاخص‌های زنده عملکرد کلاس‌ها
                        </h3>
                      </div>
                      <span className="text-xs text-stone-500">
                        روی کارت هر کلاس کلیک کنید تا جدول دانش‌آموزان همان کلاس فیلتر شود
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {data!.classKpis!.map((kpi) => {
                        const isSelected = studentClassFilter === kpi.classroomId;
                        return (
                          <button
                            key={kpi.classroomId}
                            type="button"
                            onClick={() => {
                              soundEngine.playClick();
                              setStudentClassFilter(isSelected ? 'all' : kpi.classroomId);
                            }}
                            className={`rounded-2xl border p-4 space-y-3 text-right transition-colors cursor-pointer ${
                              isSelected
                                ? 'border-teal-500 bg-teal-50/40'
                                : 'border-[#EFE6D5] bg-[#FBF7EF] hover:border-amber-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-sm font-extrabold text-stone-900">{kpi.classroomName}</h4>
                              <span className="text-xs font-bold text-stone-600 tabular-nums whitespace-nowrap">
                                {formatPersianDigits(kpi.memberCount)} دانش‌آموز
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-xl border border-[#E5DAC5] bg-white px-2 py-2">
                                <p className="text-[10px] font-semibold text-stone-500">میانگین آزمون</p>
                                <p className="mt-0.5 text-sm font-extrabold text-teal-800 tabular-nums">
                                  {kpi.avgExamScorePct !== null
                                    ? `${formatPersianDigits(kpi.avgExamScorePct)}٪`
                                    : '—'}
                                </p>
                              </div>
                              <div className="rounded-xl border border-[#E5DAC5] bg-white px-2 py-2">
                                <p className="text-[10px] font-semibold text-stone-500">تحویل تکالیف</p>
                                <p className="mt-0.5 text-sm font-extrabold text-emerald-700 tabular-nums">
                                  {kpi.homeworkDeliveryPct !== null
                                    ? `${formatPersianDigits(kpi.homeworkDeliveryPct)}٪`
                                    : '—'}
                                </p>
                              </div>
                              <div className="rounded-xl border border-[#E5DAC5] bg-white px-2 py-2">
                                <p className="text-[10px] font-semibold text-stone-500">نیازمند توجه</p>
                                <p
                                  className={`mt-0.5 text-sm font-extrabold tabular-nums ${
                                    kpi.needsAttentionCount > 0 ? 'text-amber-700' : 'text-stone-700'
                                  }`}
                                >
                                  {formatPersianDigits(kpi.needsAttentionCount)} نفر
                                </p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <form
                    onSubmit={handleCreateClassroom}
                    className="lg:col-span-5 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4 h-fit"
                  >
                    <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                      <Plus className="h-5 w-5 text-amber-600" />
                      <span>ساخت کلاس جدید</span>
                    </h3>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">نام کلاس</label>
                      <input
                        type="text"
                        value={className}
                        onChange={(e) => setClassName(e.target.value)}
                        placeholder="مثلاً: کلاس سوم الف - دبستان البرز"
                        className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-700 mb-1">پایه تحصیلی کلاس</label>
                      <select
                        value={classGrade}
                        onChange={(e) => setClassGrade(Number(e.target.value))}
                        className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-bold"
                      >
                        {GRADES.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 py-2.5 text-sm font-bold text-white cursor-pointer"
                    >
                      ایجاد کلاس و تولید کد عضویت
                    </button>
                  </form>

                  <div className="lg:col-span-7 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
                    <h3 className="text-base font-extrabold text-stone-900">
                      کلاس‌های من ({formatPersianDigits(data?.classrooms.length || 0)})
                    </h3>
                    {(data?.classrooms || []).length === 0 ? (
                      <p className="text-sm text-stone-500">
                        هنوز کلاسی ایجاد نکرده‌اید. اولین کلاس خود را بسازید.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {data!.classrooms.map((cls) => {
                          const members = data!.enrollments.filter((e) => e.classroomId === cls.id);
                          const isExpanded = Boolean(expandedClassMembers[cls.id]);
                          return (
                            <div
                              key={cls.id}
                              className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <span className="font-extrabold text-stone-900">
                                    {cls.name} · پایه {formatPersianDigits(cls.gradeId)}
                                  </span>
                                  <span
                                    className={`mr-2 text-xs font-extrabold ${
                                      cls.isActive ? 'text-emerald-700' : 'text-rose-700'
                                    }`}
                                  >
                                    ({cls.isActive ? 'فعال' : 'بسته‌شده'})
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-mono font-bold text-amber-300">
                                    {cls.joinCode}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleCopyJoinCode(cls.joinCode)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-800 cursor-pointer whitespace-nowrap"
                                  >
                                    <Copy className="h-3.5 w-3.5 text-teal-700" />
                                    <span>کپی کد</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setConfirmAction({
                                        kind: 'regen_code',
                                        id: cls.id,
                                        label: cls.name,
                                      })
                                    }
                                    title="ساخت کد عضویت جدید"
                                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-700 cursor-pointer whitespace-nowrap"
                                  >
                                    <KeyRound className="h-3.5 w-3.5 text-amber-700" />
                                    <span>کد جدید</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditClassroom(cls)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-800 cursor-pointer whitespace-nowrap"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    <span>ویرایش</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleClassroomStatus(cls.id, !cls.isActive)}
                                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer whitespace-nowrap ${
                                      cls.isActive
                                        ? 'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50'
                                        : 'bg-emerald-700 text-white hover:bg-emerald-800'
                                    }`}
                                  >
                                    <Power className="h-3.5 w-3.5" />
                                    <span>{cls.isActive ? 'بستن کلاس' : 'بازگشایی'}</span>
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600 tabular-nums">
                                <span>
                                  دانش‌آموزان عضو: {formatPersianDigits(members.length)} نفر
                                  {members.length > 0 && ` (${members.map((m) => m.nickname).join('، ')})`}
                                </span>
                                {members.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedClassMembers((prev) => ({
                                        ...prev,
                                        [cls.id]: !isExpanded,
                                      }))
                                    }
                                    className="inline-flex items-center gap-1 font-bold text-teal-700 hover:underline cursor-pointer whitespace-nowrap"
                                  >
                                    <Users className="h-3.5 w-3.5" />
                                    <span>{isExpanded ? 'بستن اعضا' : 'مدیریت اعضا'}</span>
                                    {isExpanded ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>

                              {isExpanded && members.length > 0 && (
                                <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
                                  {members.map((m) => (
                                    <div
                                      key={m.studentId}
                                      className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-stone-100 pb-2 last:border-0 last:pb-0"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-extrabold text-stone-900">{m.nickname}</span>
                                        <span className="text-stone-500 tabular-nums">
                                          · {formatPersianDigits(m.xp)} XP
                                        </span>
                                        <span className="text-amber-700 font-bold inline-flex items-center gap-0.5 tabular-nums">
                                          · <Flame className="h-3 w-3" /> {formatPersianDigits(m.currentStreak || 1)} روز
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleOpenStudentAiReport({
                                              studentId: m.studentId,
                                              nickname: m.nickname,
                                            })
                                          }
                                          className="text-indigo-700 font-bold hover:underline cursor-pointer whitespace-nowrap"
                                        >
                                          گزارش AI
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setConfirmAction({
                                              kind: 'member',
                                              classroomId: cls.id,
                                              studentId: m.studentId,
                                              label: m.nickname,
                                            })
                                          }
                                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer whitespace-nowrap"
                                        >
                                          <UserMinus className="h-3 w-3" />
                                          <span>حذف از کلاس</span>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Per-Student Academic Progress Dashboard Table + Mobile Cards */}
                <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-extrabold text-stone-900">
                        داشبورد پیشرفت تحصیلی دانش‌آموزان کلاس
                      </h3>
                      <p className="text-xs text-stone-500">
                        نمای زنده مأموریت‌های حل‌شده، استریک روزانه، تحویل تکالیف، میانگین آزمون و تحلیل هوشمند
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="h-4 w-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={studentSearch}
                          onChange={(e) => setStudentSearch(e.target.value)}
                          placeholder="جستجوی نام دانش‌آموز..."
                          className="rounded-xl border border-stone-300 pr-9 pl-3 py-1.5 text-xs w-44"
                        />
                      </div>
                      <select
                        value={studentClassFilter}
                        onChange={(e) =>
                          setStudentClassFilter(
                            e.target.value === 'all' ? 'all' : Number(e.target.value)
                          )
                        }
                        className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
                      >
                        <option value="all">همه کلاس‌ها</option>
                        {(data?.classrooms || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={studentSort}
                        onChange={(e) =>
                          setStudentSort(
                            e.target.value as 'xp' | 'correctRate' | 'homeworks' | 'streak'
                          )
                        }
                        className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
                      >
                        <option value="xp">مرتب‌سازی: بیشترین XP</option>
                        <option value="correctRate">بیشترین دقت</option>
                        <option value="homeworks">تحویل تکالیف</option>
                        <option value="streak">استریک فعال</option>
                      </select>
                    </div>
                  </div>

                  {filteredStudentStats.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      {(data?.classStudentStats || []).length === 0
                        ? 'پس از عضویت دانش‌آموزان با کد کلاس، گزارش پیشرفت آن‌ها اینجا نمایش داده می‌شود.'
                        : 'دانش‌آموزی با این فیلتر جستجو یافت نشد.'}
                    </p>
                  ) : (
                    <>
                      {/* Mobile Cards */}
                      <div className="grid grid-cols-1 gap-3 md:hidden">
                        {filteredStudentStats.map((st) => {
                          const cls = data!.classrooms.find((c) => c.id === st.classroomId);
                          return (
                            <div
                              key={`m_${st.classroomId}_${st.studentId}`}
                              className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-extrabold text-stone-900">{st.nickname}</p>
                                  <p className="text-stone-500">
                                    {cls?.name || `پایه ${formatPersianDigits(st.gradeId)}`} ·{' '}
                                    {formatPersianDigits(st.xp)} XP
                                  </p>
                                </div>
                                <span className="inline-flex items-center gap-1 font-bold text-amber-700 tabular-nums">
                                  <Flame className="h-3.5 w-3.5" />
                                  {formatPersianDigits(st.currentStreak || 1)} روز
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
                                <div className="rounded-lg bg-white border border-[#E5DAC5] p-2">
                                  <p className="text-[10px] text-stone-500">دقت</p>
                                  <p className="font-extrabold text-teal-800">
                                    {formatPersianDigits(st.correctRate)}٪
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white border border-[#E5DAC5] p-2">
                                  <p className="text-[10px] text-stone-500">تکالیف</p>
                                  <p className="font-extrabold text-amber-800">
                                    {formatPersianDigits(st.submittedHomeworksCount)}/
                                    {formatPersianDigits(st.totalClassHomeworks)}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white border border-[#E5DAC5] p-2">
                                  <p className="text-[10px] text-stone-500">آزمون</p>
                                  <p className="font-extrabold text-emerald-700">
                                    {st.avgExamScorePct !== null
                                      ? `${formatPersianDigits(st.avgExamScorePct)}٪`
                                      : '—'}
                                  </p>
                                </div>
                              </div>
                              {st.weakTopics.length > 0 && (
                                <p className="text-rose-700 font-semibold">
                                  مباحث ضعیف: {st.weakTopics.join('، ')}
                                </p>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenStudentAiReport({
                                    studentId: st.studentId,
                                    nickname: st.nickname,
                                  })
                                }
                                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 py-2 text-xs font-bold text-indigo-800 cursor-pointer"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>دریافت تحلیل هوشمند پیشرفت</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Sticky Table */}
                      <div className="hidden md:block overflow-x-auto max-h-[480px] overflow-y-auto">
                        <table className="w-full text-right text-xs sm:text-sm">
                          <thead className="sticky top-0 bg-white z-10">
                            <tr className="border-b border-[#EFE6D5] text-xs text-stone-500">
                              <th className="py-2.5 font-bold">دانش‌آموز</th>
                              <th className="py-2.5 font-bold">کلاس</th>
                              <th className="py-2.5 font-bold">استریک</th>
                              <th className="py-2.5 font-bold">مأموریت و دقت</th>
                              <th className="py-2.5 font-bold">تحویل تکلیف</th>
                              <th className="py-2.5 font-bold">میانگین آزمون</th>
                              <th className="py-2.5 font-bold">مباحث ضعیف</th>
                              <th className="py-2.5 font-bold">گزارش هوشمند</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F5EFE2]">
                            {filteredStudentStats.map((st) => {
                              const cls = data!.classrooms.find((c) => c.id === st.classroomId);
                              return (
                                <tr key={`${st.classroomId}_${st.studentId}`} className="hover:bg-[#FBF7EF]/60">
                                  <td className="py-3 font-extrabold text-stone-900">
                                    <div>{st.nickname}</div>
                                    <div className="text-[11px] font-semibold text-stone-500 tabular-nums">
                                      {formatPersianDigits(st.xp)} XP · امروز{' '}
                                      {formatPersianDigits(st.minutesUsedToday || 0)} دقیقه
                                    </div>
                                  </td>
                                  <td className="py-3 text-xs text-stone-600">
                                    {cls?.name || `پایه ${formatPersianDigits(st.gradeId)}`}
                                  </td>
                                  <td className="py-3 font-bold text-amber-700 tabular-nums">
                                    <span className="inline-flex items-center gap-1">
                                      <Flame className="h-3.5 w-3.5" />
                                      {formatPersianDigits(st.currentStreak || 1)} روز
                                    </span>
                                  </td>
                                  <td className="py-3 font-bold text-teal-800 tabular-nums">
                                    {formatPersianDigits(st.solvedMissionsCount)} درست (
                                    {formatPersianDigits(st.correctRate)}٪)
                                  </td>
                                  <td className="py-3 font-bold text-amber-800 tabular-nums">
                                    {formatPersianDigits(st.submittedHomeworksCount)} از{' '}
                                    {formatPersianDigits(st.totalClassHomeworks)}
                                  </td>
                                  <td className="py-3 font-bold text-emerald-700 tabular-nums">
                                    {st.avgExamScorePct !== null
                                      ? `${formatPersianDigits(st.avgExamScorePct)}٪ (${formatPersianDigits(st.examCount)})`
                                      : 'آزمونی نداده'}
                                  </td>
                                  <td className="py-3 text-xs text-rose-700 max-w-[180px]">
                                    {st.weakTopics.length > 0 ? st.weakTopics.join('، ') : 'نقطه ضعف ثبت نشده'}
                                  </td>
                                  <td className="py-3">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleOpenStudentAiReport({
                                          studentId: st.studentId,
                                          nickname: st.nickname,
                                        })
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 text-xs font-bold text-indigo-800 cursor-pointer whitespace-nowrap"
                                    >
                                      <Sparkles className="h-3.5 w-3.5" />
                                      <span>تحلیل هوشمند</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: QUESTION BANK, MANUAL GAME DESIGNER & AI TEACHER ASSISTANT */}
            {tab === 'questions' && (
              <div className="space-y-6">
                <ManualQuestionBuilder
                  isAdmin={dbUser.role === 'admin'}
                  classrooms={data?.classrooms || []}
                  onCreated={(msg) => {
                    setErrorMsg(null);
                    setStatusMsg(msg);
                    showToast(msg, 'success');
                    loadDashboard();
                  }}
                  onError={(err) => {
                    setStatusMsg(null);
                    setErrorMsg(err);
                    showToast(err, 'error');
                  }}
                />

                <form
                  onSubmit={handleAiGenerateQuestion}
                  className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-indigo-600" />
                      <h3 className="text-base font-extrabold text-stone-900">
                        دستیار هوش مصنوعی طراحی سؤال
                      </h3>
                    </div>
                    <span className="text-xs text-stone-500">
                      {qClassId
                        ? 'انتشار مستقیم برای دانش‌آموزان کلاس منتخب'
                        : 'سؤال عمومی در صف تأیید مدیر ثبت می‌شود'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    {(data?.classrooms || []).length > 0 && (
                      <select
                        value={qClassId}
                        onChange={(e) => {
                          const nextId = e.target.value ? Number(e.target.value) : '';
                          setQClassId(nextId);
                          if (nextId !== '') {
                            const cls = data?.classrooms.find((c) => c.id === nextId);
                            if (cls) setQGrade(cls.gradeId);
                          }
                        }}
                        className="rounded-xl border border-teal-300 bg-teal-50/40 px-3 py-2.5 text-sm font-bold"
                      >
                        <option value="">عمومی پایه (صف تأیید)</option>
                        {(data?.classrooms || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            کلاس {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      value={qGrade}
                      disabled={qClassId !== ''}
                      onChange={(e) => setQGrade(Number(e.target.value))}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold disabled:bg-stone-100"
                    >
                      {GRADES.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                    <select
                      value={qBook}
                      onChange={(e) => setQBook(e.target.value as BookId)}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold"
                    >
                      {REALMS.map((r) => (
                        <option key={r.bookId} value={r.bookId}>
                          {r.bookTitle}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={qTopic}
                      onChange={(e) => setQTopic(e.target.value)}
                      placeholder="نام مبحث درس"
                      className="rounded-xl border border-stone-300 px-3 py-2.5 text-sm"
                    />
                    <select
                      value={qType}
                      onChange={(e) =>
                        setQType(e.target.value as 'mcq' | 'true_false' | 'fill_blank' | 'pattern_puzzle')
                      }
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold"
                    >
                      <option value="mcq">چهارگزینه‌ای</option>
                      <option value="true_false">درست و نادرست</option>
                      <option value="fill_blank">جای خالی</option>
                      <option value="pattern_puzzle">الگوی عددی</option>
                    </select>
                    <select
                      value={qDifficulty}
                      onChange={(e) => setQDifficulty(e.target.value as DifficultyLevel)}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold"
                    >
                      {(['easy', 'medium', 'hard', 'challenge'] as DifficultyLevel[]).map((d) => (
                        <option key={d} value={d}>
                          سطح: {DIFFICULTY_LABELS[d]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <input
                      type="text"
                      value={qChapter}
                      onChange={(e) => setQChapter(e.target.value)}
                      placeholder="نام فصل کتاب"
                      className="rounded-xl border border-stone-300 px-3 py-2 text-sm w-56"
                    />
                    <button
                      type="submit"
                      disabled={aiGenerating}
                      className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 px-5 py-2.5 text-sm font-bold text-white cursor-pointer whitespace-nowrap"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span>{aiGenerating ? 'در حال طراحی سؤال...' : 'تولید پیش‌نویس سؤال هوشمند'}</span>
                    </button>
                  </div>
                </form>

                {/* Question Bank with Search, Status/Grade/Book Filters & Pagination */}
                <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-base font-extrabold text-stone-900">
                      بانک سؤال و بازی‌های طراحی‌شده توسط من ({formatPersianDigits(filteredQuestions.length)})
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="h-4 w-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={qSearch}
                          onChange={(e) => {
                            setQSearch(e.target.value);
                            setQVisibleCount(QUESTION_PAGE_SIZE);
                          }}
                          placeholder="جستجو در سؤال یا مبحث..."
                          className="rounded-xl border border-stone-300 pr-9 pl-3 py-1.5 text-xs w-48"
                        />
                      </div>
                      <select
                        value={qStatusFilter}
                        onChange={(e) => {
                          setQStatusFilter(
                            e.target.value as 'all' | 'pending_review' | 'approved' | 'rejected'
                          );
                          setQVisibleCount(QUESTION_PAGE_SIZE);
                        }}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
                      >
                        <option value="all">همه وضعیت‌ها</option>
                        <option value="pending_review">در صف بررسی مدیر</option>
                        <option value="approved">تأیید و منتشرشده</option>
                        <option value="rejected">ردشده (نیازمند اصلاح)</option>
                      </select>
                      <select
                        value={qGradeFilter}
                        onChange={(e) => {
                          setQGradeFilter(
                            e.target.value === 'all' ? 'all' : Number(e.target.value)
                          );
                          setQVisibleCount(QUESTION_PAGE_SIZE);
                        }}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
                      >
                        <option value="all">همه پایه‌ها</option>
                        {GRADES.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.shortTitle}
                          </option>
                        ))}
                      </select>
                      <select
                        value={qBookFilter}
                        onChange={(e) => {
                          setQBookFilter(e.target.value);
                          setQVisibleCount(QUESTION_PAGE_SIZE);
                        }}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
                      >
                        <option value="all">همه کتاب‌ها</option>
                        {REALMS.map((r) => (
                          <option key={r.bookId} value={r.bookId}>
                            {r.bookTitle}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {filteredQuestions.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      {(data?.questions || []).length === 0
                        ? 'هنوز سؤالی طراحی نکرده‌اید.'
                        : 'سؤالی با این فیلتر یافت نشد.'}
                    </p>
                  ) : (
                    <>
                      <div className="divide-y divide-[#F1E8D8]">
                        {filteredQuestions.slice(0, qVisibleCount).map((q) => {
                          const realm = REALMS.find((r) => r.bookId === q.bookId);
                          const responses = (data?.questionResponses || []).filter(
                            (r) => r.contentId === q.id
                          );
                          const isRespOpen = Boolean(expandedResponseQIds[q.id]);
                          const canDeleteQ =
                            q.reviewStatus !== 'approved' ||
                            q.classroomId !== null ||
                            dbUser.role === 'admin';
                          return (
                            <div key={q.id} className="py-4 space-y-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex items-start gap-3 max-w-2xl">
                                  {q.imageDataUrl && (
                                    <img
                                      src={q.imageDataUrl}
                                      alt="تصویر سؤال"
                                      referrerPolicy="no-referrer"
                                      className="h-14 w-14 rounded-xl border border-stone-200 object-cover shrink-0"
                                    />
                                  )}
                                  <div className="space-y-1">
                                    <p className="text-xs font-semibold text-stone-500 flex flex-wrap items-center gap-1.5">
                                      <span>پایه {formatPersianDigits(q.gradeId)}</span>
                                      <span>·</span>
                                      <span>{realm?.bookTitle || q.bookId}</span>
                                      {q.classroomName && (
                                        <>
                                          <span>·</span>
                                          <span className="font-bold text-teal-800">
                                            کلاس {q.classroomName}
                                          </span>
                                        </>
                                      )}
                                      <span>·</span>
                                      <span>{q.topicId}</span>
                                      <span>·</span>
                                      <span>
                                        {DIFFICULTY_LABELS[q.difficulty] || q.difficulty}
                                      </span>
                                      <span>·</span>
                                      <span>
                                        {QUESTION_TYPE_LABELS[
                                          q.questionType as keyof typeof QUESTION_TYPE_LABELS
                                        ] || q.questionType}
                                      </span>
                                      <span>·</span>
                                      <span>
                                        {q.contentSource === 'ai_generated' ? 'AI' : 'تألیف معلم'}
                                      </span>
                                      {q.imageDataUrl && (
                                        <span className="inline-flex items-center gap-0.5 text-teal-700 font-bold">
                                          · <ImageIcon className="h-3 w-3" /> تصویردار
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-sm font-bold text-stone-900">{q.promptText}</p>
                                    <p className="text-xs text-emerald-800 font-semibold">
                                      پاسخ صحیح: {q.correctAnswer}
                                    </p>
                                    {q.reviewStatus === 'rejected' && q.rejectionReason && (
                                      <div className="mt-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
                                        علت رد توسط مدیر کل: {q.rejectionReason}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {q.reviewStatus === 'approved' ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-extrabold text-emerald-700 whitespace-nowrap">
                                      <CheckCircle2 className="h-4 w-4" />
                                      {q.classroomId
                                        ? 'منتشرشده در کلاس'
                                        : 'تأیید و منتشرشده در بازی'}
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center gap-1 text-xs font-extrabold whitespace-nowrap ${
                                        q.reviewStatus === 'rejected'
                                          ? 'text-rose-700'
                                          : 'text-amber-800'
                                      }`}
                                    >
                                      {q.reviewStatus === 'rejected' ? (
                                        <>
                                          <XCircle className="h-4 w-4" />
                                          ردشده (قابل اصلاح)
                                        </>
                                      ) : (
                                        <>
                                          <Clock className="h-4 w-4" />
                                          در صف بررسی مدیر
                                        </>
                                      )}
                                    </span>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedResponseQIds((prev) => ({
                                        ...prev,
                                        [q.id]: !isRespOpen,
                                      }))
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-800 hover:bg-indigo-100 cursor-pointer whitespace-nowrap tabular-nums"
                                  >
                                    <Users className="h-3.5 w-3.5" />
                                    <span>پاسخ‌ها ({formatPersianDigits(responses.length)})</span>
                                    {isRespOpen ? (
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    )}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openEditQuestion(q)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-50 cursor-pointer whitespace-nowrap"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    <span>
                                      {q.reviewStatus === 'approved' ? 'ویرایش' : 'ویرایش و ارسال مجدد'}
                                    </span>
                                  </button>

                                  {canDeleteQ && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setConfirmAction({
                                          kind: 'question',
                                          id: q.id,
                                          label: q.promptText.slice(0, 60),
                                        })
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer whitespace-nowrap"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      <span>حذف</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              {isRespOpen && (
                                <div className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 space-y-2 text-xs">
                                  {responses.length === 0 ? (
                                    <p className="text-stone-500">
                                      هنوز هیچ دانش‌آموزی به این سؤال پاسخ نداده است.
                                    </p>
                                  ) : (
                                    responses.map((r) => (
                                      <div
                                        key={r.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2"
                                      >
                                        <div className="space-y-0.5">
                                          <p className="font-extrabold text-stone-900">
                                            {r.studentName}
                                            <span className="mr-2 font-normal text-stone-500 tabular-nums">
                                              ({new Date(r.createdAt).toLocaleDateString('fa-IR')})
                                            </span>
                                          </p>
                                          <p className="text-stone-700">
                                            پاسخ داده‌شده:{' '}
                                            <span className="font-bold text-stone-900">
                                              {r.studentAnswer || 'ثبت‌نشده'}
                                            </span>
                                          </p>
                                        </div>
                                        <span
                                          className={`inline-flex items-center gap-1 font-extrabold shrink-0 ${
                                            r.isCorrect ? 'text-emerald-700' : 'text-rose-700'
                                          }`}
                                        >
                                          {r.isCorrect ? (
                                            <>
                                              <CheckCircle2 className="h-3.5 w-3.5" />
                                              درست
                                            </>
                                          ) : (
                                            <>
                                              <XCircle className="h-3.5 w-3.5" />
                                              نادرست
                                            </>
                                          )}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {filteredQuestions.length > qVisibleCount && (
                        <div className="pt-2 text-center">
                          <button
                            type="button"
                            onClick={() => setQVisibleCount((c) => c + QUESTION_PAGE_SIZE)}
                            className="rounded-xl border border-stone-300 bg-[#FBF7EF] hover:bg-[#EFE6D5] px-5 py-2 text-xs font-bold text-stone-800 cursor-pointer"
                          >
                            نمایش بیشتر ({formatPersianDigits(filteredQuestions.length - qVisibleCount)} سؤال باقی‌مانده)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: HOMEWORK, AI CONVERTER & SUBMISSION / EXAM GRADING */}
            {tab === 'homework' && (
              <TeacherHomeworkTab
                classrooms={data?.classrooms || []}
                enrollments={data?.enrollments || []}
                homeworks={data?.homeworks || []}
                submissions={data?.submissions || []}
                exams={data?.exams || []}
                examAttempts={data?.examAttempts || []}
                onRefresh={loadDashboard}
                onRequestDelete={(target) => setConfirmAction(target)}
              />
            )}

            {/* TAB 4: CUSTOM EXAM BUILDER, VIDEOS & SCHEDULE ANNOUNCEMENTS */}
            {tab === 'media_exams' && (
              <div className="space-y-6">
                <TeacherExamBuilder
                  classrooms={data?.classrooms || []}
                  exams={data?.exams || []}
                  onRefresh={loadDashboard}
                  onRequestDelete={(target) => setConfirmAction(target)}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Video Publisher */}
                  <form
                    onSubmit={handlePublishVideo}
                    className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-3.5"
                  >
                    <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                      <Video className="h-5 w-5 text-teal-700" />
                      <span>انتشار فیلم آموزشی + پرسش سنجش</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select
                        value={vidClassId}
                        onChange={(e) => setVidClassId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
                      >
                        {(data?.classrooms || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={vidBook}
                        onChange={(e) => setVidBook(e.target.value as BookId)}
                        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
                      >
                        {REALMS.map((r) => (
                          <option key={r.bookId} value={r.bookId}>
                            {r.bookTitle}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="text"
                      value={vidTitle}
                      onChange={(e) => setVidTitle(e.target.value)}
                      placeholder="عنوان فیلم آموزشی"
                      className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                      required
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={vidChapter}
                        onChange={(e) => setVidChapter(e.target.value)}
                        placeholder="فصل و مبحث"
                        className="sm:col-span-2 rounded-xl border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={vidDuration}
                        onChange={(e) => setVidDuration(e.target.value)}
                        placeholder="مدت (مثلاً 05:00)"
                        className="rounded-xl border border-stone-300 px-3 py-2 text-sm tabular-nums"
                      />
                    </div>
                    <input
                      type="url"
                      value={vidUrl}
                      onChange={(e) => setVidUrl(e.target.value)}
                      placeholder="لینک معتبر ویدیو (https://...)"
                      className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                      required
                    />
                    <div className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3 space-y-2">
                      <p className="text-[11px] font-bold text-stone-700">
                        پرسش سنجش پس از تماشا (اختیاری — در صورت خالی بودن پرسش خودکار ثبت می‌شود)
                      </p>
                      <input
                        type="text"
                        value={vidFollowUpPrompt}
                        onChange={(e) => setVidFollowUpPrompt(e.target.value)}
                        placeholder="متن سؤال درک مطلب پس از تماشای فیلم..."
                        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={vidFollowUpOpt1}
                          onChange={(e) => setVidFollowUpOpt1(e.target.value)}
                          placeholder="گزینه صحیح"
                          className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                        <input
                          type="text"
                          value={vidFollowUpOpt2}
                          onChange={(e) => setVidFollowUpOpt2(e.target.value)}
                          placeholder="گزینه انحرافی"
                          className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 py-2.5 text-sm font-bold text-white cursor-pointer"
                    >
                      انتشار فیلم + اعلان به کلاس
                    </button>
                  </form>

                  {/* Safe One-Way Calendar Announcement */}
                  <form
                    onSubmit={handleSendAnnouncement}
                    className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-3.5"
                  >
                    <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                      <Send className="h-5 w-5 text-indigo-700" />
                      <span>اعلان آموزشی و تقویم کلاس</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select
                        value={annClassId}
                        onChange={(e) => setAnnClassId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
                        required
                      >
                        <option value="">انتخاب کلاس</option>
                        {(data?.classrooms || []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={annKind}
                        onChange={(e) =>
                          setAnnKind(e.target.value as 'schedule' | 'encouragement' | 'homework')
                        }
                        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
                      >
                        <option value="schedule">برنامه و تقویم کلاسی</option>
                        <option value="encouragement">پیام تشویقی</option>
                        <option value="homework">یادآور تکلیف</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={annTitle}
                        onChange={(e) => setAnnTitle(e.target.value)}
                        placeholder="عنوان کوتاه اطلاعیه (اختیاری)"
                        className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={annDate}
                        onChange={(e) => setAnnDate(e.target.value)}
                        placeholder="تاریخ برنامه (مثلاً ۱۴۰۴/۰۹/۱۵)"
                        className="rounded-xl border border-stone-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <textarea
                      rows={4}
                      value={annMessage}
                      onChange={(e) => setAnnMessage(e.target.value)}
                      placeholder="پیام تشویقی یا یادآوری امتحان برای دانش‌آموزان و والدین..."
                      className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                      required
                    />
                    <button
                      type="submit"
                      className="w-full rounded-xl bg-indigo-700 hover:bg-indigo-800 py-2.5 text-sm font-bold text-white cursor-pointer"
                    >
                      ارسال پیام آموزشی و ثبت اعلان
                    </button>
                  </form>
                </div>

                {/* Manage Published Videos & Sent Classroom Announcements */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-3">
                    <h3 className="text-base font-extrabold text-stone-900">
                      ویدیوهای منتشرشده ({formatPersianDigits(data?.videos.length || 0)})
                    </h3>
                    {(data?.videos || []).length === 0 ? (
                      <p className="text-xs text-stone-500">هنوز ویدیویی منتشر نکرده‌اید.</p>
                    ) : (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto">
                        {data!.videos.map((v) => {
                          const realm = REALMS.find((r) => r.bookId === v.bookId);
                          return (
                            <div
                              key={v.id}
                              className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 flex items-center justify-between gap-3"
                            >
                              <div>
                                <p className="text-sm font-bold text-stone-900">{v.title}</p>
                                <p className="text-xs text-stone-500 tabular-nums">
                                  پایه {formatPersianDigits(v.gradeId)} · {realm?.bookTitle || v.bookId} ·{' '}
                                  {v.chapterId} · {v.durationLabel}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({ kind: 'video', id: v.id, label: v.title })
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0 whitespace-nowrap"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>حذف</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-3">
                    <h3 className="text-base font-extrabold text-stone-900">
                      اطلاعیه‌های ارسال‌شده به کلاس ({formatPersianDigits(data?.announcements.length || 0)})
                    </h3>
                    {(data?.announcements || []).length === 0 ? (
                      <p className="text-xs text-stone-500">هنوز اطلاعیه‌ای به کلاس ارسال نشده است.</p>
                    ) : (
                      <div className="space-y-2.5 max-h-72 overflow-y-auto">
                        {data!.announcements.map((a) => {
                          const cls = data!.classrooms.find((c) => c.id === a.classroomId);
                          return (
                            <div
                              key={a.id}
                              className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 text-xs flex items-start justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <p className="font-bold text-amber-800">
                                  {cls ? cls.name : 'کلاس'}
                                  {a.scheduledDate ? ` · تاریخ: ${a.scheduledDate}` : ''}
                                </p>
                                {a.title && <p className="font-extrabold text-stone-900">{a.title}</p>}
                                <p className="text-stone-800 leading-relaxed">{a.message}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({
                                    kind: 'announcement',
                                    id: a.id,
                                    label: (a.title || a.message).slice(0, 50),
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0 whitespace-nowrap"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>حذف</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: PROFILE & ACCOUNT SECURITY */}
            {tab === 'account' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <form
                  onSubmit={handleSaveProfile}
                  className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5 text-teal-700" />
                      <h3 className="text-base font-extrabold text-stone-900">مشخصات پروفایل معلم</h3>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      حساب تأییدشده
                    </span>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      نام و نام خانوادگی معلم
                    </label>
                    <input
                      type="text"
                      value={teacherName}
                      onChange={(e) => setTeacherName(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      نام مدرسه یا آموزشگاه
                    </label>
                    <input
                      type="text"
                      value={schoolName}
                      onChange={(e) => setSchoolName(e.target.value)}
                      placeholder="مثلاً: دبستان دانش‌پژوهان"
                      className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 px-5 py-2.5 text-sm font-bold text-white cursor-pointer"
                  >
                    {savingProfile ? 'در حال ذخیره...' : 'ذخیره تغییرات پروفایل'}
                  </button>
                </form>

                <ChangePasswordCard hasPassword={dbUser.hasPassword} onChanged={onUserRefreshed} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* EDIT CLASSROOM MODAL */}
      {editingClassroom && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
        >
          <form
            onSubmit={handleSaveClassroomEdit}
            className="w-full max-w-md rounded-2xl border border-[#E5DAC5] bg-white p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-extrabold text-stone-900">ویرایش مشخصات کلاس</h3>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">نام کلاس</label>
              <input
                type="text"
                value={editClassName}
                onChange={(e) => setEditClassName(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">پایه تحصیلی</label>
              <select
                value={editClassGrade}
                onChange={(e) => setEditClassGrade(Number(e.target.value))}
                className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-bold"
              >
                {GRADES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingClassEdit}
                onClick={() => setEditingClassroom(null)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={savingClassEdit}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
              >
                {savingClassEdit ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT QUESTION MODAL */}
      {editingQuestion && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
        >
          <form
            onSubmit={handleSaveEditedQuestion}
            className="w-full max-w-lg rounded-2xl border border-[#E5DAC5] bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-base font-extrabold text-stone-900">
              {editQClassId !== ''
                ? 'ویرایش سؤال اختصاصی کلاس'
                : 'ویرایش سؤال و ارسال مجدد برای بررسی مدیر'}
            </h3>
            {editingQuestion.rejectionReason && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
                دلیل رد قبلی: {editingQuestion.rejectionReason}
              </div>
            )}
            {(data?.classrooms || []).length > 0 && (
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">مخاطب / کلاس هدف</label>
                <select
                  value={editQClassId}
                  onChange={(e) => {
                    const nextId = e.target.value ? Number(e.target.value) : '';
                    setEditQClassId(nextId);
                    if (nextId !== '') {
                      const cls = data?.classrooms.find((c) => c.id === nextId);
                      if (cls) setEditQGrade(cls.gradeId);
                    }
                  }}
                  className="w-full rounded-xl border border-teal-300 bg-teal-50/40 px-3 py-2 text-xs font-bold"
                >
                  <option value="">عمومی پایه (نیازمند تأیید مدیر)</option>
                  {(data?.classrooms || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      کلاس {c.name} (انتشار مستقیم)
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">پایه</label>
                <select
                  value={editQGrade}
                  disabled={editQClassId !== ''}
                  onChange={(e) => setEditQGrade(Number(e.target.value))}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold disabled:bg-stone-100"
                >
                  {GRADES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.shortTitle}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">کتاب</label>
                <select
                  value={editQBook}
                  onChange={(e) => setEditQBook(e.target.value as BookId)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold"
                >
                  {REALMS.map((r) => (
                    <option key={r.bookId} value={r.bookId}>
                      {r.bookTitle}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">سطح دشواری</label>
                <select
                  value={editQDifficulty}
                  onChange={(e) => setEditQDifficulty(e.target.value as DifficultyLevel)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold"
                >
                  {(['easy', 'medium', 'hard', 'challenge'] as DifficultyLevel[]).map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">فصل</label>
                <input
                  type="text"
                  value={editChapter}
                  onChange={(e) => setEditChapter(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">مبحث</label>
                <input
                  type="text"
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">صورت سؤال</label>
              <textarea
                rows={3}
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                required
              />
            </div>
            {editOptions.length >= 2 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-stone-700">گزینه‌های سؤال</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {editOptions.map((opt, idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setEditOptions((prev) => prev.map((o, j) => (j === idx ? nextVal : o)));
                        if (editAnswer === opt) setEditAnswer(nextVal);
                      }}
                      placeholder={`گزینه ${formatPersianDigits(idx + 1)}`}
                      className="rounded-xl border border-stone-300 px-3 py-2 text-xs"
                    />
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">پاسخ صحیح</label>
              <input
                type="text"
                value={editAnswer}
                onChange={(e) => setEditAnswer(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">راهنما</label>
              <input
                type="text"
                value={editHint}
                onChange={(e) => setEditHint(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">توضیح آموزشی</label>
              <input
                type="text"
                value={editExplanation}
                onChange={(e) => setEditExplanation(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => setEditingQuestion(null)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
              >
                {savingEdit
                  ? 'در حال ذخیره...'
                  : editQClassId !== ''
                    ? 'ذخیره تغییرات در کلاس'
                    : 'ذخیره و ارسال به صف بررسی'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PER-STUDENT AI PROGRESS REPORT MODAL */}
      {aiModalStudent && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-2xl rounded-3xl border border-[#E5DAC5] bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-700" />
                  <span>گزارش هوشمند پیشرفت «{aiModalStudent.nickname}»</span>
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  تحلیل اختصاصی معلم هوشمند بر اساس عملکرد ثبت‌شده در کلاس و آزمون‌ها
                </p>
              </div>
              <div className="flex items-center gap-2">
                {aiReport && !aiLoading && (
                  <button
                    type="button"
                    onClick={() => handleOpenStudentAiReport(aiModalStudent, true)}
                    className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-800 cursor-pointer whitespace-nowrap"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>بروزرسانی</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setAiModalStudent(null)}
                  aria-label="بستن"
                  className="rounded-xl p-1.5 text-stone-500 hover:bg-stone-100 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {aiLoading && <SkeletonLoader variant="compact" />}
            {aiError && <p className="text-sm font-bold text-rose-700">{aiError}</p>}

            {aiReport && !aiLoading && (
              <div className="space-y-3">
                {aiCached && (
                  <p className="text-[11px] font-semibold text-stone-500">
                    بارگذاری‌شده از کش ۲۴ ساعته تحلیل هوشمند
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-1.5">
                    <h4 className="text-sm font-extrabold text-emerald-950 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      <span>نقاط قوت</span>
                    </h4>
                    <ul className="space-y-1 text-xs text-emerald-950 list-disc list-inside leading-relaxed">
                      {aiReport.strengths.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-1.5">
                    <h4 className="text-sm font-extrabold text-amber-950 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-amber-700" />
                      <span>مباحث نیازمند تمرین بیشتر</span>
                    </h4>
                    <ul className="space-y-1 text-xs text-amber-950 list-disc list-inside leading-relaxed">
                      {aiReport.needsPractice.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 space-y-1.5">
                    <h4 className="text-sm font-extrabold text-indigo-950 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-indigo-700" />
                      <span>برنامه پیشنهادی هفته آینده</span>
                    </h4>
                    <ul className="space-y-1 text-xs text-indigo-950 list-disc list-inside leading-relaxed">
                      {aiReport.nextWeekPlan.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* UNIFIED CONFIRMATION MODAL */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E5DAC5] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  confirmAction.kind === 'regen_code'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-stone-900">{getConfirmTitle()}</h3>
                <p className="text-xs text-stone-600 leading-relaxed">{getConfirmBody()}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmAction(null)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={handleExecuteConfirm}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-60 ${
                  confirmAction.kind === 'regen_code'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-700 hover:bg-rose-800'
                }`}
              >
                {confirmBusy
                  ? 'در حال انجام...'
                  : confirmAction.kind === 'regen_code'
                    ? 'بله، کد جدید بساز'
                    : 'بله، انجام شود'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
