import React, { useState, useEffect, useCallback } from 'react';
import { DbUser } from '../../context/AuthContext';
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
} from 'lucide-react';

interface TeacherDashboardData {
  user: DbUser;
  classrooms: Array<{
    id: number;
    name: string;
    gradeId: number;
    joinCode: string;
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
  questions: Array<{
    id: number;
    gradeId: number;
    bookId: string;
    topicId: string;
    questionType: string;
    promptText: string;
    imageDataUrl?: string | null;
    correctAnswer: string;
    contentSource: string;
    reviewStatus: string;
  }>;
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
    studentName: string;
    autoScore: number;
    teacherScore: number | null;
    teacherFeedback: string | null;
    status: string;
  }>;
  exams: Array<{
    id: number;
    title: string;
    gradeId: number;
    durationMinutes: number;
    maxScore: number;
  }>;
  videos: Array<{
    id: number;
    title: string;
    gradeId: number;
    chapterId: string;
    durationLabel: string;
    videoUrl: string;
  }>;
  announcements: Array<{
    id: number;
    message: string;
    kind: string;
    scheduledDate: string | null;
  }>;
}

interface TeacherPanelProps {
  dbUser: DbUser;
  onUserRefreshed: () => void;
}

export function TeacherPanel({ dbUser, onUserRefreshed }: TeacherPanelProps) {
  const [tab, setTab] = useState<'classes' | 'questions' | 'homework' | 'media_exams'>('classes');
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Teacher registration form
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

  // New Homework form
  const [hwClassId, setHwClassId] = useState<number | ''>('');
  const [hwTitle, setHwTitle] = useState('');
  const [hwBook, setHwBook] = useState<BookId>('math');
  const [hwDesc, setHwDesc] = useState('');
  const [hwDueDate, setHwDueDate] = useState('۱۴۰۴/۰۹/۱۲');

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

  const isApprovedTeacher =
    dbUser.role === 'admin' || (dbUser.role === 'teacher' && dbUser.teacherApproved);

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

  if (!isApprovedTeacher) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-[#E5DAC5] bg-white p-7 space-y-6">
        <div className="flex items-start gap-3">
          <GraduationCap className="h-8 w-8 text-teal-700 shrink-0" />
          <div>
            <h2 className="text-2xl font-extrabold text-stone-900">ثبت‌نام و تأیید حساب معلم</h2>
            <p className="mt-1 text-sm text-stone-600">
              برای ساخت کلاس، طراحی سؤال، انتشار فیلم آموزشی و برگزاری آزمون، مشخصات معلمی خود را ثبت کنید تا توسط مدیر سامانه تأیید شود.
            </p>
          </div>
        </div>

        {dbUser.role === 'teacher' && !dbUser.teacherApproved && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-950 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-700 shrink-0" />
            <span>درخواست شما ثبت شده و در انتظار تأیید مدیر کل در «پنل مدیریت» است.</span>
          </div>
        )}

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
            {applying ? 'در حال ثبت...' : 'ارسال درخواست حساب معلم'}
          </button>
        </form>
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
        'سؤال پیشنهادی هوش مصنوعی تولید شد و با وضعیت «در انتظار تأیید معلم» در بانک سؤال ذخیره گردید. پیش از تأیید برای دانش‌آموز نمایش داده نمی‌شود.'
      );
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تولید سؤال هوشمند با خطا مواجه شد.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleApproveQuestion = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await apiFetch(`/api/teacher/questions/${id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ reviewStatus: status }),
      });
      soundEngine.playClick();
      setStatusMsg(
        status === 'approved'
          ? 'سؤال تأیید و در سرزمین پایه مربوطه منتشر شد!'
          : 'سؤال رد شد و برای دانش‌آموزان نمایش داده نمی‌شود.'
      );
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'بروزرسانی وضعیت سؤال ناموفق بود.');
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

  const handleGradeSubmission = async (subId: number, score: number, feedback: string) => {
    try {
      await apiFetch(`/api/teacher/submissions/${subId}`, {
        method: 'PATCH',
        body: JSON.stringify({ teacherScore: score, teacherFeedback: feedback, status: 'graded' }),
      });
      soundEngine.playCorrect();
      setStatusMsg('نمره و بازخورد معلم ثبت شد.');
      loadDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ثبت نمره ناموفق بود.');
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
    const headers = ['نام دانش‌آموز', 'پایه', 'امتیاز XP', 'سکه'];
    const rows = data.enrollments.map((e) => [e.nickname, String(e.gradeId), String(e.xp), String(e.coins)]);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-stone-900">پنل اختصاصی معلمان</h2>
          <p className="text-sm text-stone-600">
            مدیریت کلاس‌ها، بانک سؤال با دستیار هوش مصنوعی (با تأیید معلم)، تکالیف، فیلم آموزشی و آزمون اختصاصی
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
            ['classes', 'کلاس‌ها و داشبورد'],
            ['questions', 'بانک سؤال و هوش مصنوعی'],
            ['homework', 'تکالیف و تصحیح'],
            ['media_exams', 'فیلم، آزمون و تقویم'],
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
          {/* TAB 1: CLASSROOMS & DASHBOARD */}
          {tab === 'classes' && (
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
                          className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-extrabold text-stone-900">
                              {cls.name} · پایه {formatPersianDigits(cls.gradeId)}
                            </span>
                            <span className="rounded-lg bg-stone-900 px-3 py-1 text-xs font-mono font-bold text-amber-300">
                              کد عضویت: {cls.joinCode}
                            </span>
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
          )}

          {/* TAB 2: QUESTION BANK, MANUAL GAME DESIGNER & AI TEACHER ASSISTANT */}
          {tab === 'questions' && (
            <div className="space-y-6">
              <ManualQuestionBuilder
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
                    دستیار هوش مصنوعی طراحی سؤال (با تأیید اجباری معلم پیش از انتشار)
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
                <div className="flex items-center justify-between gap-3">
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
                      <div key={q.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
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
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {q.reviewStatus === 'approved' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                              <CheckCircle2 className="h-4 w-4" />
                              منتشرشده در بازی
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveQuestion(q.id, 'approved')}
                                className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
                              >
                                تأیید و انتشار
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApproveQuestion(q.id, 'rejected')}
                                className="rounded-xl border border-rose-300 px-3 py-2 text-xs font-bold text-rose-700 cursor-pointer"
                              >
                                رد کردن
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

          {/* TAB 3: HOMEWORK & GRADING */}
          {tab === 'homework' && (
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

              <div className="lg:col-span-7 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
                <h3 className="text-base font-extrabold text-stone-900">
                  تکالیف تحویل‌شده جهت تصحیح و بازخورد ({formatPersianDigits(data?.submissions.length || 0)})
                </h3>
                {(data?.submissions || []).length === 0 ? (
                  <p className="text-sm text-stone-500">هنوز تکلیفی از سوی دانش‌آموزان ارسال نشده است.</p>
                ) : (
                  <div className="space-y-3">
                    {data!.submissions.map((sub) => (
                      <div
                        key={sub.id}
                        className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-extrabold text-stone-900">
                            دانش‌آموز: {sub.studentName} · نمره خودکار: {formatPersianDigits(sub.autoScore)}٪
                          </p>
                          <p className="text-xs text-stone-600">
                            وضعیت: {sub.status === 'graded' ? `تصحیح‌شده (${sub.teacherScore}/۲۰)` : 'در انتظار بازخورد معلم'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleGradeSubmission(sub.id, 20, 'آفرین بر تلاش منظم و دقیق تو!')}
                          className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white cursor-pointer"
                        >
                          تأیید و ثبت نمره ۲۰ با پیام تشویقی
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: VIDEOS, EXAMS & SCHEDULE ANNOUNCEMENTS */}
          {tab === 'media_exams' && (
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
          )}
        </>
      )}
    </div>
  );
}
