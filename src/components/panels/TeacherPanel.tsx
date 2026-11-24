import React, { useState, useEffect, useCallback } from 'react';
import { DbUser, useAuth } from '../../context/AuthContext';
import {
  BookId,
  GRADES,
  REALMS,
  QUESTION_TYPE_LABELS,
  formatPersianDigits,
} from '../../shared/curriculum';
import { apiFetch } from '../../lib/api';
import { soundEngine } from '../../lib/sound';
import { ManualQuestionBuilder } from './ManualQuestionBuilder';
import { ChangePasswordCard } from './ChangePasswordCard';
import {
  GraduationCap,
  Plus,
  Sparkles,
  CheckCircle2,
  Video,
  ClipboardList,
  Download,
  Send,
  BookOpenCheck,
  Clock,
  Image as ImageIcon,
  Power,
  Pencil,
  Trash2,
  AlertTriangle,
  Megaphone,
  Lock,
  XCircle,
  MessageSquare,
} from 'lucide-react';

interface TeacherQuestionRow {
  id: number;
  gradeId: number;
  bookId: BookId;
  chapterId: string;
  topicId: string;
  questionType: string;
  promptText: string;
  hintText: string;
  explanation: string;
  imageDataUrl?: string | null;
  correctAnswer: string;
  contentSource: string;
  reviewStatus: string;
  rejectionReason?: string | null;
}

interface TeacherDashboardData {
  user: DbUser;
  classrooms: Array<{
    id: number;
    name: string;
    gradeId: number;
    joinCode: string;
    isActive: boolean;
    academicYear: string;
  }>;
  enrollments: Array<{
    classroomId: number;
    studentId: number;
    nickname: string;
    gradeId: number;
    xp: number;
    coins: number;
  }>;
  classStudentStats?: Array<{
    classroomId: number;
    studentId: number;
    nickname: string;
    gradeId: number;
    xp: number;
    coins: number;
    solvedMissionsCount: number;
    totalAttempts: number;
    correctRate: number;
    submittedHomeworksCount: number;
    totalClassHomeworks: number;
    examCount: number;
    avgExamScorePct: number | null;
    weakTopics: string[];
  }>;
  questions: TeacherQuestionRow[];
  homeworks: Array<{
    id: number;
    classroomId: number | null;
    gradeId: number;
    bookId: string;
    title: string;
    dueDate: string;
  }>;
  submissions: Array<{
    id: number;
    homeworkId: number;
    studentId: number;
    studentName: string;
    autoScore: number;
    teacherScore: number | null;
    teacherFeedback: string | null;
    status: string;
  }>;
  exams: Array<{
    id: number;
    classroomId: number | null;
    title: string;
    gradeId: number;
    durationMinutes: number;
    maxScore: number;
  }>;
  examAttempts?: Array<{
    id: number;
    examId: number;
    examTitle: string;
    classroomId: number | null;
    studentId: number;
    studentName: string;
    score: number;
    maxScore: number;
    correctCount: number;
    totalQuestions: number;
    teacherScore: number | null;
    teacherFeedback: string | null;
    completedAt: string;
  }>;
  videos: Array<{
    id: number;
    classroomId: number | null;
    title: string;
    gradeId: number;
    chapterId: string;
    durationLabel: string;
    videoUrl: string;
  }>;
  announcements: Array<{
    id: number;
    classroomId: number | null;
    message: string;
    kind: string;
    scheduledDate: string | null;
  }>;
  globalAnnouncements?: Array<{
    id: number;
    title?: string | null;
    senderName: string;
    targetAudience: string;
    message: string;
    scheduledDate: string | null;
  }>;
}

interface TeacherPanelProps {
  dbUser: DbUser;
  onUserRefreshed: () => void;
}

export function TeacherPanel({ dbUser, onUserRefreshed }: TeacherPanelProps) {
  const { globalAnnouncements: authGlobalAnnouncements } = useAuth();
  const [tab, setTab] = useState<'classes' | 'questions' | 'homework' | 'media_exams' | 'account'>('classes');
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Teacher registration form (for unapproved users)
  const [teacherName, setTeacherName] = useState(dbUser.displayName || '');
  const [schoolName, setSchoolName] = useState(dbUser.schoolName || '');
  const [applying, setApplying] = useState(false);

  // New Classroom form
  const [className, setClassName] = useState('');
  const [classGrade, setClassGrade] = useState(3);

  // New Question + AI Assistant
  const [qGrade, setQGrade] = useState(3);
  const [qBook, setQBook] = useState<BookId>('math');
  const [qChapter, setQChapter] = useState('فصل ۲');
  const [qTopic, setQTopic] = useState('ضرب و تقسیم');
  const [qType, setQType] = useState<'mcq' | 'true_false' | 'fill_blank' | 'pattern_puzzle'>('mcq');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Edit Question modal
  const [editingQuestion, setEditingQuestion] = useState<TeacherQuestionRow | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editAnswer, setEditAnswer] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editChapter, setEditChapter] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Confirm delete modal (question or video)
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: 'question'; id: number; label: string }
    | { kind: 'video'; id: number; label: string }
    | null
  >(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // New Homework form
  const [hwClassId, setHwClassId] = useState<number | ''>('');
  const [hwTitle, setHwTitle] = useState('');
  const [hwBook, setHwBook] = useState<BookId>('math');
  const [hwDesc, setHwDesc] = useState('');
  const [hwDueDate, setHwDueDate] = useState('۱۴۰۴/۰۹/۱۲');

  // Inline custom grading state for submissions & exam attempts
  const [subGrades, setSubGrades] = useState<Record<number, { score: string; feedback: string }>>({});
  const [examGrades, setExamGrades] = useState<Record<number, { score: string; feedback: string }>>({});

  // New Video & Announcement & Exam
  const [vidClassId, setVidClassId] = useState<number | ''>('');
  const [vidTitle, setVidTitle] = useState('');
  const [vidUrl, setVidUrl] = useState('');
  const [vidChapter, setVidChapter] = useState('فصل ۱');
  const [annClassId, setAnnClassId] = useState<number | ''>('');
  const [annMessage, setAnnMessage] = useState('');
  const [annDate, setAnnDate] = useState('۱۴۰۴/۰۹/۱۵');
  const [examTitle, setExamTitle] = useState('');
  const [examClassId, setExamClassId] = useState<number | ''>('');
  const [examDuration, setExamDuration] = useState(15);

  const isApprovedTeacher =
    dbUser.role === 'admin' || (dbUser.role === 'teacher' && dbUser.teacherApproved);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<TeacherDashboardData>('/api/teacher/dashboard');
      setData(res);
      if (res.classrooms.length > 0 && hwClassId === '') {
        setHwClassId(res.classrooms[0].id);
        setVidClassId(res.classrooms[0].id);
        setAnnClassId(res.classrooms[0].id);
        setExamClassId(res.classrooms[0].id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'خطا در بارگذاری پنل معلم.');
    } finally {
      setLoading(false);
    }
  }, [hwClassId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

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
      setStatusMsg(`کلاس «${res.classroom.name}» ساخته شد! کد عضویت دانش‌آموزان: ${res.classroom.joinCode}`);
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ساخت کلاس ناموفق بود.');
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
      setStatusMsg(
        nextActive
          ? 'کلاس فعال شد و دانش‌آموزان می‌توانند با کد عضویت وارد شوند.'
          : 'کلاس بسته شد؛ عضویت دانش‌آموز جدید متوقف گردید و در پنل دانش‌آموز/والدین «بسته‌شده» نمایش داده می‌شود.'
      );
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تغییر وضعیت کلاس ناموفق بود.');
    }
  };

  const handleAiGenerateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiGenerating(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiFetch('/api/ai/generate-question', {
        method: 'POST',
        body: JSON.stringify({
          gradeId: qGrade,
          bookId: qBook,
          chapterId: qChapter,
          topicId: qTopic,
          difficulty: 'medium',
          questionType: qType,
        }),
      });
      soundEngine.playCorrect();
      setStatusMsg(
        'سؤال پیشنهادی هوش مصنوعی تولید شد و با وضعیت «در صف بررسی مدیر» ثبت گردید. پس از تأیید مدیر کل در دنیای بازی دانش‌آموزان منتشر می‌شود.'
      );
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تولید سؤال هوشمند با خطا مواجه شد.');
    } finally {
      setAiGenerating(false);
    }
  };

  const openEditQuestion = (q: TeacherQuestionRow) => {
    setEditingQuestion(q);
    setEditPrompt(q.promptText);
    setEditAnswer(q.correctAnswer);
    setEditTopic(q.topicId);
    setEditChapter(q.chapterId);
    setEditHint(q.hintText || '');
    setEditExplanation(q.explanation || '');
  };

  const handleSaveEditedQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion || !editPrompt.trim() || !editAnswer.trim()) return;
    setSavingEdit(true);
    setErrorMsg(null);
    try {
      await apiFetch(`/api/teacher/questions/${editingQuestion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          promptText: editPrompt.trim(),
          correctAnswer: editAnswer.trim(),
          topicId: editTopic.trim(),
          chapterId: editChapter.trim(),
          hintText: editHint.trim(),
          explanation: editExplanation.trim(),
        }),
      });
      soundEngine.playCorrect();
      setEditingQuestion(null);
      setStatusMsg('سؤال ویرایش شد و دوباره برای بررسی و تأیید مدیر کل ارسال گردید.');
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ویرایش سؤال ناموفق بود.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeletingBusy(true);
    setErrorMsg(null);
    try {
      if (confirmDelete.kind === 'question') {
        await apiFetch(`/api/teacher/questions/${confirmDelete.id}`, { method: 'DELETE' });
        setStatusMsg('سؤال از بانک سؤالات شما حذف شد.');
      } else {
        await apiFetch(`/api/teacher/videos/${confirmDelete.id}`, { method: 'DELETE' });
        setStatusMsg('فیلم آموزشی حذف شد.');
      }
      soundEngine.playClick();
      setConfirmDelete(null);
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'حذف با خطا مواجه شد.');
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleAssignHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hwTitle.trim()) return;
    const cls = data?.classrooms.find((c) => c.id === Number(hwClassId));
    try {
      await apiFetch('/api/homeworks', {
        method: 'POST',
        body: JSON.stringify({
          classroomId: cls?.id || null,
          gradeId: cls?.gradeId || classGrade,
          bookId: hwBook,
          title: hwTitle.trim(),
          description: hwDesc.trim(),
          dueDate: hwDueDate,
        }),
      });
      soundEngine.playVictory();
      setHwTitle('');
      setHwDesc('');
      setStatusMsg('تکلیف کلاس ثبت شد و در دفتر مأموریت‌های دانش‌آموزان به مأموریت بازی تبدیل گردید.');
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ثبت تکلیف ناموفق بود.');
    }
  };

  const handleGradeSubmission = async (subId: number, defaultScore: number, defaultFeedback: string) => {
    const draft = subGrades[subId];
    const score = draft?.score !== undefined && draft.score !== '' ? Number(draft.score) : defaultScore;
    const feedback = draft?.feedback !== undefined ? draft.feedback : defaultFeedback;
    try {
      await apiFetch(`/api/teacher/submissions/${subId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          teacherScore: Number.isFinite(score) ? Math.max(0, Math.min(20, score)) : 20,
          teacherFeedback: feedback.trim() || 'آفرین بر تلاش منظم و دقیق تو!',
          status: 'graded',
        }),
      });
      soundEngine.playCorrect();
      setStatusMsg('نمره و بازخورد تکلیف برای دانش‌آموز و والدین ثبت شد.');
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ثبت نمره ناموفق بود.');
    }
  };

  const handleGradeExamAttempt = async (attemptId: number, currentScore: number) => {
    const draft = examGrades[attemptId];
    const score = draft?.score !== undefined && draft.score !== '' ? Number(draft.score) : currentScore;
    const feedback = draft?.feedback ?? '';
    try {
      await apiFetch(`/api/teacher/exam-attempts/${attemptId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          teacherScore: Number.isFinite(score) ? score : currentScore,
          teacherFeedback: feedback.trim(),
        }),
      });
      soundEngine.playCorrect();
      setStatusMsg('نمره و بازخورد آزمون برای دانش‌آموز و والدین ثبت شد.');
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ثبت بازخورد آزمون ناموفق بود.');
    }
  };

  const handlePublishVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cls = data?.classrooms.find((c) => c.id === Number(vidClassId));
    try {
      await apiFetch('/api/teacher/videos', {
        method: 'POST',
        body: JSON.stringify({
          classroomId: cls?.id,
          gradeId: cls?.gradeId || 3,
          bookId: qBook,
          chapterId: vidChapter,
          title: vidTitle.trim(),
          description: 'فیلم آموزشی اختصاصی کلاس',
          videoUrl: vidUrl.trim(),
        }),
      });
      soundEngine.playVictory();
      setVidTitle('');
      setVidUrl('');
      setStatusMsg('فیلم آموزشی و پرسش سنجش پس از تماشا در کلاس منتشر شد.');
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'انتشار فیلم ناموفق بود.');
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim()) return;
    const cls = data?.classrooms.find((c) => c.id === Number(examClassId));
    const grade = cls?.gradeId || 3;
    const sampleQuestions = [
      {
        id: `tq_${Date.now()}_1`,
        topicId: 'ارزیابی کلاسی',
        bookId: qBook,
        promptText: `سؤال اول آزمون «${examTitle.trim()}»: کدام گزینه بیانگر یادگیری صحیح مبحث است؟`,
        options: ['پاسخ دقیق و کامل', 'پاسخ ناقص', 'نیاز به تمرین بیشتر', 'هیچ‌کدام'],
        correctAnswer: 'پاسخ دقیق و کامل',
        explanation: 'مرور دقیق کتاب درسی و تمرین مستمر کلید موفقیت است.',
      },
    ];
    try {
      await apiFetch('/api/exams', {
        method: 'POST',
        body: JSON.stringify({
          classroomId: cls?.id || null,
          gradeId: grade,
          bookId: qBook,
          examType: 'teacher_custom',
          title: examTitle.trim(),
          durationMinutes: examDuration,
          maxScore: 20,
          questions: sampleQuestions,
        }),
      });
      soundEngine.playVictory();
      setExamTitle('');
      setStatusMsg('آزمون اختصاصی بدون تبلیغ برای کلاس منتشر شد.');
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ثبت آزمون ناموفق بود.');
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
          kind: 'schedule',
          message: annMessage.trim(),
          scheduledDate: annDate,
        }),
      });
      soundEngine.playClick();
      setAnnMessage('');
      setStatusMsg('اعلان آموزشی و یادآور تقویم برای کلاس ارسال شد.');
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ارسال پیام ناموفق بود.');
    }
  };

  const exportCsvReport = () => {
    if (!data) return;
    const stats = data.classStudentStats || [];
    const headers = ['نام دانش‌آموز', 'پایه', 'مأموریت حل‌شده', 'درصد دقت', 'تکالیف تحویلی', 'میانگین آزمون (٪)', 'امتیاز XP', 'سکه'];
    const rows =
      stats.length > 0
        ? stats.map((s) => [
            s.nickname,
            String(s.gradeId),
            String(s.solvedMissionsCount),
            String(s.correctRate),
            `${s.submittedHomeworksCount}/${s.totalClassHomeworks}`,
            s.avgExamScorePct !== null ? String(s.avgExamScorePct) : '—',
            String(s.xp),
            String(s.coins),
          ])
        : data.enrollments.map((e) => [e.nickname, String(e.gradeId), '0', '0', '0', '—', String(e.xp), String(e.coins)]);
    const csv = '\uFEFF' + [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classroom-report.csv';
    a.click();
    URL.revokeObjectURL(url);
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

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-stone-900">پنل اختصاصی معلمان</h2>
          <p className="text-sm text-stone-600">
            مدیریت کلاس‌ها، پایش پیشرفت دانش‌آموزان، بانک سؤال با تأیید مدیر، تصحیح تکالیف و آزمون‌ها
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

      {/* Segmented Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-[#EFE6D5] p-1.5">
        {(
          [
            ['classes', 'کلاس‌ها و پیشرفت دانش‌آموزان'],
            ['questions', 'بانک سؤال و هوش مصنوعی'],
            ['homework', 'تکالیف، آزمون‌ها و تصحیح'],
            ['media_exams', 'فیلم، آزمون و تقویم'],
            ['account', 'امنیت حساب و رمز عبور'],
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
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm font-medium text-stone-600">در حال بارگذاری اطلاعات کلاس‌ها...</p>
      ) : (
        <>
          {/* TAB 1: CLASSROOMS & STUDENT PROGRESS DASHBOARD */}
          {tab === 'classes' && (
            <div className="space-y-6">
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
                    <p className="text-sm text-stone-500">هنوز کلاسی ایجاد نکرده‌اید. اولین کلاس خود را بسازید.</p>
                  ) : (
                    <div className="space-y-3">
                      {data!.classrooms.map((cls) => {
                        const members = data!.enrollments.filter((e) => e.classroomId === cls.id);
                        return (
                          <div
                            key={cls.id}
                            className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-2.5"
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
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-mono font-bold text-amber-300">
                                  کد عضویت: {cls.joinCode}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleToggleClassroomStatus(cls.id, !cls.isActive)}
                                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer ${
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
                            <p className="text-xs text-stone-600 tabular-nums">
                              دانش‌آموزان عضو: {formatPersianDigits(members.length)} نفر
                              {members.length > 0 && ` (${members.map((m) => m.nickname).join('، ')})`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Per-Student Academic Progress Dashboard Table */}
              <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
                <div>
                  <h3 className="text-base font-extrabold text-stone-900">
                    داشبورد پیشرفت تحصیلی دانش‌آموزان کلاس
                  </h3>
                  <p className="text-xs text-stone-500">
                    نمای زنده مأموریت‌های حل‌شده، نرخ تحویل تکالیف، میانگین آزمون و مباحث نیازمند مرور هر دانش‌آموز
                  </p>
                </div>

                {(data?.classStudentStats || []).length === 0 ? (
                  <p className="text-sm text-stone-500">
                    پس از عضویت دانش‌آموزان با کد کلاس، گزارش پیشرفت آن‌ها اینجا نمایش داده می‌شود.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-[#EFE6D5] text-xs text-stone-500">
                          <th className="py-2.5 font-bold">دانش‌آموز</th>
                          <th className="py-2.5 font-bold">کلاس / پایه</th>
                          <th className="py-2.5 font-bold">مأموریت حل‌شده</th>
                          <th className="py-2.5 font-bold">تحویل تکلیف</th>
                          <th className="py-2.5 font-bold">میانگین آزمون</th>
                          <th className="py-2.5 font-bold">مباحث ضعیف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F5EFE2]">
                        {data!.classStudentStats!.map((st) => {
                          const cls = data!.classrooms.find((c) => c.id === st.classroomId);
                          return (
                            <tr key={`${st.classroomId}_${st.studentId}`}>
                              <td className="py-3 font-extrabold text-stone-900">{st.nickname}</td>
                              <td className="py-3 text-xs text-stone-600">
                                {cls?.name || `پایه ${formatPersianDigits(st.gradeId)}`}
                              </td>
                              <td className="py-3 font-bold text-teal-800 tabular-nums">
                                {formatPersianDigits(st.solvedMissionsCount)} درست ({formatPersianDigits(st.correctRate)}٪)
                              </td>
                              <td className="py-3 font-bold text-amber-800 tabular-nums">
                                {formatPersianDigits(st.submittedHomeworksCount)} از {formatPersianDigits(st.totalClassHomeworks)}
                              </td>
                              <td className="py-3 font-bold text-emerald-700 tabular-nums">
                                {st.avgExamScorePct !== null
                                  ? `${formatPersianDigits(st.avgExamScorePct)}٪ (${formatPersianDigits(st.examCount)} آزمون)`
                                  : 'آزمونی نداده'}
                              </td>
                              <td className="py-3 text-xs text-rose-700">
                                {st.weakTopics.length > 0 ? st.weakTopics.join('، ') : 'نقطه ضعف ثبت نشده'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: QUESTION BANK, MANUAL GAME DESIGNER & AI TEACHER ASSISTANT */}
          {tab === 'questions' && (
            <div className="space-y-6">
              <ManualQuestionBuilder
                isAdmin={dbUser.role === 'admin'}
                onCreated={(msg) => {
                  setErrorMsg(null);
                  setStatusMsg(msg);
                  loadDashboard();
                }}
                onError={(err) => {
                  setStatusMsg(null);
                  setErrorMsg(err);
                }}
              />

              <form
                onSubmit={handleAiGenerateQuestion}
                className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-base font-extrabold text-stone-900">
                    دستیار هوش مصنوعی طراحی سؤال (ثبت در صف تأیید مدیر پیش از انتشار)
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <select
                    value={qGrade}
                    onChange={(e) => setQGrade(Number(e.target.value))}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold"
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
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <input
                    type="text"
                    value={qChapter}
                    onChange={(e) => setQChapter(e.target.value)}
                    placeholder="نام فصل کتاب"
                    className="rounded-xl border border-stone-300 px-3 py-2 text-sm w-48"
                  />
                  <button
                    type="submit"
                    disabled={aiGenerating}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 px-5 py-2.5 text-sm font-bold text-white cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{aiGenerating ? 'در حال طراحی سؤال...' : 'تولید پیش‌نویس سؤال هوشمند'}</span>
                  </button>
                </div>
              </form>

              <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-3">
                <h3 className="text-base font-extrabold text-stone-900">
                  بانک سؤال و بازی‌های طراحی‌شده توسط من ({formatPersianDigits(data?.questions.length || 0)})
                </h3>
                {(data?.questions || []).length === 0 ? (
                  <p className="text-sm text-stone-500">هنوز سؤالی طراحی نکرده‌اید.</p>
                ) : (
                  <div className="divide-y divide-[#F1E8D8]">
                    {data!.questions.map((q) => (
                      <div key={q.id} className="py-4 flex flex-wrap items-start justify-between gap-3">
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
                              <span>{q.topicId}</span>
                              <span>·</span>
                              <span>
                                {QUESTION_TYPE_LABELS[q.questionType as keyof typeof QUESTION_TYPE_LABELS] ||
                                  q.questionType}
                              </span>
                              <span>·</span>
                              <span>{q.contentSource === 'ai_generated' ? 'تولیدشده با AI' : 'تألیف دستی معلم'}</span>
                              {q.imageDataUrl && (
                                <span className="inline-flex items-center gap-0.5 text-teal-700 font-bold">
                                  · <ImageIcon className="h-3 w-3" /> تصویردار
                                </span>
                              )}
                            </p>
                            <p className="text-sm font-bold text-stone-900">{q.promptText}</p>
                            <p className="text-xs text-emerald-800 font-semibold">پاسخ صحیح: {q.correctAnswer}</p>
                            {q.reviewStatus === 'rejected' && q.rejectionReason && (
                              <div className="mt-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
                                علت رد توسط مدیر کل: {q.rejectionReason}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {q.reviewStatus === 'approved' ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-bold text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                              تأیید و منتشرشده در بازی
                            </span>
                          ) : (
                            <>
                              <span
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                                  q.reviewStatus === 'rejected'
                                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-800'
                                }`}
                              >
                                {q.reviewStatus === 'rejected' ? (
                                  <>
                                    <XCircle className="h-3.5 w-3.5" />
                                    ردشده (قابل اصلاح)
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-3.5 w-3.5" />
                                    در صف بررسی مدیر
                                  </>
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => openEditQuestion(q)}
                                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-50 cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                ویرایش و ارسال مجدد
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDelete({
                                    kind: 'question',
                                    id: q.id,
                                    label: q.promptText.slice(0, 60),
                                  })
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                حذف
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: HOMEWORK, MISSING STUDENTS & EXAM GRADING */}
          {tab === 'homework' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={handleAssignHomework}
                  className="lg:col-span-5 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4 h-fit"
                >
                  <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                    <BookOpenCheck className="h-5 w-5 text-amber-600" />
                    <span>تعریف تکلیف جدید برای کلاس</span>
                  </h3>
                  <select
                    value={hwClassId}
                    onChange={(e) => setHwClassId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-bold"
                  >
                    <option value="">انتخاب کلاس (اختیاری)</option>
                    {(data?.classrooms || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (پایه {formatPersianDigits(c.gradeId)})
                      </option>
                    ))}
                  </select>
                  <select
                    value={hwBook}
                    onChange={(e) => setHwBook(e.target.value as BookId)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-bold"
                  >
                    {REALMS.map((r) => (
                      <option key={r.bookId} value={r.bookId}>
                        {r.bookTitle}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={hwTitle}
                    onChange={(e) => setHwTitle(e.target.value)}
                    placeholder="عنوان تکلیف"
                    className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                    required
                  />
                  <textarea
                    rows={3}
                    value={hwDesc}
                    onChange={(e) => setHwDesc(e.target.value)}
                    placeholder="توضیحات تکلیف و صفحات کتاب درسی"
                    className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                  />
                  <input
                    type="text"
                    value={hwDueDate}
                    onChange={(e) => setHwDueDate(e.target.value)}
                    placeholder="مهلت تحویل"
                    className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 py-2.5 text-sm font-bold text-white cursor-pointer"
                  >
                    انتشار تکلیف در دنیای بازی دانش‌آموزان
                  </button>
                </form>

                {/* Homework status: submitted & missing per homework */}
                <div className="lg:col-span-7 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-5">
                  <h3 className="text-base font-extrabold text-stone-900">
                    وضعیت تحویل تکالیف کلاس و ثبت نمره/بازخورد
                  </h3>

                  {(data?.homeworks || []).length === 0 ? (
                    <p className="text-sm text-stone-500">هنوز تکلیفی تعریف نکرده‌اید.</p>
                  ) : (
                    <div className="space-y-4">
                      {data!.homeworks.map((hw) => {
                        const hwSubs = data!.submissions.filter((s) => s.homeworkId === hw.id);
                        const classMembers = hw.classroomId
                          ? data!.enrollments.filter((e) => e.classroomId === hw.classroomId)
                          : [];
                        const submittedIds = new Set(hwSubs.map((s) => s.studentId));
                        const missingStudents = classMembers.filter((m) => !submittedIds.has(m.studentId));

                        return (
                          <div
                            key={hw.id}
                            className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-extrabold text-stone-900">{hw.title}</p>
                                <p className="text-xs text-stone-500">
                                  مهلت: {hw.dueDate} · تحویل‌شده: {formatPersianDigits(hwSubs.length)}
                                  {classMembers.length > 0 &&
                                    ` · تحویل‌نداده: ${formatPersianDigits(missingStudents.length)}`}
                                </p>
                              </div>
                            </div>

                            {missingStudents.length > 0 && (
                              <p className="text-xs font-semibold text-amber-800">
                                دانش‌آموزان در انتظار ارسال: {missingStudents.map((m) => m.nickname).join('، ')}
                              </p>
                            )}

                            {hwSubs.length === 0 ? (
                              <p className="text-xs text-stone-500">هنوز دانش‌آموزی این تکلیف را ارسال نکرده است.</p>
                            ) : (
                              <div className="space-y-2.5">
                                {hwSubs.map((sub) => {
                                  const draft = subGrades[sub.id] || {
                                    score: sub.teacherScore !== null ? String(sub.teacherScore) : '20',
                                    feedback: sub.teacherFeedback || '',
                                  };
                                  return (
                                    <div
                                      key={sub.id}
                                      className="rounded-lg border border-stone-200 bg-white p-3 space-y-2"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                        <span className="font-extrabold text-stone-900">
                                          {sub.studentName} · نمره خودکار: {formatPersianDigits(sub.autoScore)}٪
                                        </span>
                                        <span className="font-bold text-emerald-700">
                                          {sub.status === 'graded'
                                            ? `نمره معلم: ${formatPersianDigits(sub.teacherScore ?? 20)}/۲۰`
                                            : 'در انتظار بازخورد'}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <input
                                          type="number"
                                          min={0}
                                          max={20}
                                          value={draft.score}
                                          onChange={(e) =>
                                            setSubGrades((prev) => ({
                                              ...prev,
                                              [sub.id]: { ...draft, score: e.target.value },
                                            }))
                                          }
                                          placeholder="نمره (۰-۲۰)"
                                          className="w-24 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-bold"
                                        />
                                        <input
                                          type="text"
                                          value={draft.feedback}
                                          onChange={(e) =>
                                            setSubGrades((prev) => ({
                                              ...prev,
                                              [sub.id]: { ...draft, feedback: e.target.value },
                                            }))
                                          }
                                          placeholder="یادداشت تشویقی یا اصلاحی معلم..."
                                          className="flex-1 min-w-[180px] rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleGradeSubmission(
                                              sub.id,
                                              20,
                                              'آفرین بر تلاش منظم و دقیق تو!'
                                            )
                                          }
                                          className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                                        >
                                          ثبت نمره و بازخورد
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Exam Results & Teacher Feedback Editor */}
              <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
                <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-indigo-700" />
                  <span>کارنامه آزمون‌های دانش‌آموزان و ثبت بازخورد معلم ({formatPersianDigits(data?.examAttempts?.length || 0)})</span>
                </h3>
                {(data?.examAttempts || []).length === 0 ? (
                  <p className="text-sm text-stone-500">هنوز دانش‌آموزی در آزمون‌های کلاس شرکت نکرده است.</p>
                ) : (
                  <div className="space-y-3">
                    {data!.examAttempts!.map((ea) => {
                      const draft = examGrades[ea.id] || {
                        score: String(ea.teacherScore ?? ea.score),
                        feedback: ea.teacherFeedback || '',
                      };
                      return (
                        <div
                          key={ea.id}
                          className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                            <span className="font-extrabold text-stone-900">
                              {ea.studentName} · {ea.examTitle}
                            </span>
                            <span className="font-bold text-teal-800 tabular-nums">
                              نمره سیستمی: {formatPersianDigits(ea.score)} از {formatPersianDigits(ea.maxScore)} (
                              {formatPersianDigits(ea.correctCount)}/{formatPersianDigits(ea.totalQuestions)} درست)
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={ea.maxScore}
                              value={draft.score}
                              onChange={(e) =>
                                setExamGrades((prev) => ({
                                  ...prev,
                                  [ea.id]: { ...draft, score: e.target.value },
                                }))
                              }
                              placeholder="نمره معلم"
                              className="w-24 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                            />
                            <input
                              type="text"
                              value={draft.feedback}
                              onChange={(e) =>
                                setExamGrades((prev) => ({
                                  ...prev,
                                  [ea.id]: { ...draft, feedback: e.target.value },
                                }))
                              }
                              placeholder="بازخورد معلم روی این آزمون (نمایش در پنل دانش‌آموز و والدین)..."
                              className="flex-1 min-w-[200px] rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleGradeExamAttempt(ea.id, ea.score)}
                              className="rounded-lg bg-indigo-700 hover:bg-indigo-800 px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer"
                            >
                              ذخیره بازخورد آزمون
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: VIDEOS, EXAMS & SCHEDULE ANNOUNCEMENTS */}
          {tab === 'media_exams' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Video Publisher */}
                <form
                  onSubmit={handlePublishVideo}
                  className="rounded-2xl border border-[#E5DAC5] bg-white p-5 space-y-3.5"
                >
                  <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                    <Video className="h-5 w-5 text-teal-700" />
                    <span>انتشار فیلم آموزشی</span>
                  </h3>
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
                  <input
                    type="text"
                    value={vidTitle}
                    onChange={(e) => setVidTitle(e.target.value)}
                    placeholder="عنوان فیلم آموزشی"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                    required
                  />
                  <input
                    type="text"
                    value={vidChapter}
                    onChange={(e) => setVidChapter(e.target.value)}
                    placeholder="فصل و مبحث"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="url"
                    value={vidUrl}
                    onChange={(e) => setVidUrl(e.target.value)}
                    placeholder="لینک معتبر ویدیو (https://...)"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 py-2.5 text-sm font-bold text-white cursor-pointer"
                  >
                    انتشار فیلم + پرسش سنجش
                  </button>
                </form>

                {/* Custom Ad-Free Exam Designer */}
                <form
                  onSubmit={handleCreateExam}
                  className="rounded-2xl border border-[#E5DAC5] bg-white p-5 space-y-3.5"
                >
                  <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-amber-600" />
                    <span>طراحی آزمون اختصاصی</span>
                  </h3>
                  <select
                    value={examClassId}
                    onChange={(e) => setExamClassId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
                  >
                    <option value="">عمومی برای پایه</option>
                    {(data?.classrooms || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    placeholder="عنوان آزمون (مثلاً: آزمون میان‌ترم ریاضی)"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                    required
                  />
                  <input
                    type="number"
                    min={5}
                    max={60}
                    value={examDuration}
                    onChange={(e) => setExamDuration(Number(e.target.value))}
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 py-2.5 text-sm font-bold text-white cursor-pointer"
                  >
                    برگزاری آزمون بدون تبلیغ
                  </button>
                </form>

                {/* Safe One-Way Calendar Announcement */}
                <form
                  onSubmit={handleSendAnnouncement}
                  className="rounded-2xl border border-[#E5DAC5] bg-white p-5 space-y-3.5"
                >
                  <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                    <Send className="h-5 w-5 text-indigo-700" />
                    <span>اعلان آموزشی و تقویم کلاس</span>
                  </h3>
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
                  <input
                    type="text"
                    value={annDate}
                    onChange={(e) => setAnnDate(e.target.value)}
                    placeholder="تاریخ برنامه (مثلاً ۱۴۰۴/۰۹/۱۵)"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                  />
                  <textarea
                    rows={3}
                    value={annMessage}
                    onChange={(e) => setAnnMessage(e.target.value)}
                    placeholder="پیام تشویقی یا یادآوری امتحان (بدون چت آزاد ناشناس)"
                    className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-indigo-700 hover:bg-indigo-800 py-2.5 text-sm font-bold text-white cursor-pointer"
                  >
                    ارسال پیام آموزشی به کلاس
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
                    <div className="space-y-2.5">
                      {data!.videos.map((v) => (
                        <div
                          key={v.id}
                          className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 flex items-center justify-between gap-3"
                        >
                          <div>
                            <p className="text-sm font-bold text-stone-900">{v.title}</p>
                            <p className="text-xs text-stone-500">
                              پایه {formatPersianDigits(v.gradeId)} · {v.chapterId}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDelete({ kind: 'video', id: v.id, label: v.title })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            حذف
                          </button>
                        </div>
                      ))}
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
                    <div className="space-y-2.5 max-h-64 overflow-y-auto">
                      {data!.announcements.map((a) => (
                        <div
                          key={a.id}
                          className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 text-xs"
                        >
                          {a.scheduledDate && (
                            <p className="font-bold text-amber-800 mb-1">تاریخ: {a.scheduledDate}</p>
                          )}
                          <p className="text-stone-800">{a.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ACCOUNT SECURITY & PASSWORD CHANGE */}
          {tab === 'account' && (
            <div className="max-w-xl">
              <ChangePasswordCard hasPassword={dbUser.hasPassword} onChanged={onUserRefreshed} />
            </div>
          )}
        </>
      )}

      {/* EDIT PENDING/REJECTED QUESTION MODAL */}
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
              ویرایش سؤال و ارسال مجدد برای بررسی مدیر
            </h3>
            {editingQuestion.rejectionReason && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
                دلیل رد قبلی: {editingQuestion.rejectionReason}
              </div>
            )}
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
                {savingEdit ? 'در حال ذخیره...' : 'ذخیره و ارسال به صف بررسی'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E5DAC5] bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-stone-900">
                  {confirmDelete.kind === 'question' ? 'تأیید حذف سؤال' : 'تأیید حذف فیلم آموزشی'}
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  آیا مطمئن هستید که می‌خواهید «{confirmDelete.label}» را حذف کنید؟ این عملیات قابل بازگشت نیست.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deletingBusy}
                onClick={() => setConfirmDelete(null)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={deletingBusy}
                onClick={handleConfirmDelete}
                className="rounded-xl bg-rose-700 hover:bg-rose-800 px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
              >
                {deletingBusy ? 'در حال حذف...' : 'بله، حذف شود'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
