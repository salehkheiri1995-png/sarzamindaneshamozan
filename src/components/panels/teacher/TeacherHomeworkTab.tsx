import React, { useState } from 'react';
import {
  BookId,
  REALMS,
  formatPersianDigits,
} from '../../../shared/curriculum';
import { apiFetch } from '../../../lib/api';
import { soundEngine } from '../../../lib/sound';
import { useToast } from '../../../context/ToastContext';
import {
  HomeworkQuestionItem,
  TeacherClassroomRow,
  TeacherDeleteTarget,
  TeacherExamAttemptRow,
  TeacherExamRow,
  TeacherHomeworkRow,
  TeacherSubmissionRow,
  TeacherEnrollmentRow,
} from './types';
import {
  BookOpenCheck,
  Sparkles,
  Upload,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  AlertCircle,
  Pencil,
  X,
  ClipboardCheck,
} from 'lucide-react';

interface TeacherHomeworkTabProps {
  classrooms: TeacherClassroomRow[];
  enrollments: TeacherEnrollmentRow[];
  homeworks: TeacherHomeworkRow[];
  submissions: TeacherSubmissionRow[];
  exams?: TeacherExamRow[];
  examAttempts: TeacherExamAttemptRow[];
  onRefresh: () => Promise<void> | void;
  onRequestDelete: (target: TeacherDeleteTarget) => void;
}

export function TeacherHomeworkTab({
  classrooms,
  enrollments,
  homeworks,
  submissions,
  exams = [],
  examAttempts,
  onRefresh,
  onRequestDelete,
}: TeacherHomeworkTabProps) {
  const { showToast } = useToast();

  // Homework Creator Form
  const [hwClassId, setHwClassId] = useState<number | ''>(classrooms[0]?.id ?? '');
  const [hwGrade, setHwGrade] = useState<number>(classrooms[0]?.gradeId ?? 3);
  const [hwBook, setHwBook] = useState<BookId>('math');
  const [hwTitle, setHwTitle] = useState('');
  const [hwDesc, setHwDesc] = useState('');
  const [hwDueDate, setHwDueDate] = useState('۱۴۰۴/۰۹/۱۲');
  const [hwQuestions, setHwQuestions] = useState<HomeworkQuestionItem[]>([]);
  const [aiRawText, setAiRawText] = useState('');
  const [aiImageBase64, setAiImageBase64] = useState<string | null>(null);
  const [aiImageMime, setAiImageMime] = useState<string | null>(null);
  const [aiImageName, setAiImageName] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [convertingAi, setConvertingAi] = useState(false);
  const [creatingHw, setCreatingHw] = useState(false);

  // Filters & expandable inspection
  const [classFilter, setClassFilter] = useState<number | 'all'>('all');
  const [subStatusFilter, setSubStatusFilter] = useState<'all' | 'pending' | 'graded'>('all');
  const [expandedSubmissionIds, setExpandedSubmissionIds] = useState<Record<number, boolean>>({});
  const [expandedExamAttemptIds, setExpandedExamAttemptIds] = useState<Record<number, boolean>>({});

  // Edit Homework Modal State
  const [editingHomework, setEditingHomework] = useState<TeacherHomeworkRow | null>(null);
  const [editHwTitle, setEditHwTitle] = useState('');
  const [editHwClassId, setEditHwClassId] = useState<number | ''>('');
  const [editHwGrade, setEditHwGrade] = useState(3);
  const [editHwBook, setEditHwBook] = useState<BookId>('math');
  const [editHwDueDate, setEditHwDueDate] = useState('');
  const [editHwDesc, setEditHwDesc] = useState('');
  const [editHwQuestions, setEditHwQuestions] = useState<HomeworkQuestionItem[]>([]);
  const [savingHwEdit, setSavingHwEdit] = useState(false);

  // Inline grading drafts
  const [subGrades, setSubGrades] = useState<
    Record<number, { score: string; feedback: string; status: 'graded' | 'needs_revision' }>
  >({});
  const [examGrades, setExamGrades] = useState<Record<number, { score: string; feedback: string }>>({});

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast('فقط تصاویر JPG، PNG یا WebP مجاز هستند.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('حجم تصویر نباید بیشتر از ۲ مگابایت باشد.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const commaIdx = reader.result.indexOf(',');
        const base64 = commaIdx >= 0 ? reader.result.slice(commaIdx + 1) : reader.result;
        setAiImageBase64(base64);
        setAiImageMime(file.type);
        setAiImageName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConvertWithAI = async () => {
    const sourceText = aiRawText.trim() || hwDesc.trim() || hwTitle.trim();
    if (!sourceText && !aiImageBase64) {
      showToast('متن تمرین یا تصویر صفحه کتاب را وارد کنید.', 'error');
      return;
    }
    const cls = classrooms.find((c) => c.id === Number(hwClassId));
    setConvertingAi(true);
    setAiNote(null);
    try {
      const res = await apiFetch<{
        ocrConfidenceNote: string;
        questions: HomeworkQuestionItem[];
      }>('/api/ai/convert-homework', {
        method: 'POST',
        body: JSON.stringify({
          gradeId: cls?.gradeId || hwGrade,
          bookId: hwBook,
          rawText: sourceText,
          imageBase64: aiImageBase64 || undefined,
          imageMimeType: aiImageMime || undefined,
        }),
      });
      setHwQuestions(res.questions || []);
      setAiNote(res.ocrConfidenceNote || null);
      soundEngine.playCorrect();
      showToast(
        `${formatPersianDigits(res.questions?.length || 0)} مأموریت بازی از متن/تصویر استخراج شد.`,
        'success'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تبدیل تکلیف با هوش مصنوعی ناموفق بود.', 'error');
    } finally {
      setConvertingAi(false);
    }
  };

  const handleAddManualHwQuestion = () => {
    soundEngine.playClick();
    setHwQuestions((prev) => [
      ...prev,
      {
        promptText: '',
        options: ['', '', '', ''],
        correctAnswer: '',
        hintText: 'صورت سؤال را با دقت بخوان.',
        explanation: 'آفرین بر تلاش تو!',
      },
    ]);
  };

  const handleAssignHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hwTitle.trim()) return;
    const cls = classrooms.find((c) => c.id === Number(hwClassId));

    const validQuestions = hwQuestions
      .map((q) => {
        const opts = q.options.map((o) => o.trim()).filter(Boolean);
        if (!q.promptText.trim() || opts.length < 2) return null;
        return {
          promptText: q.promptText.trim(),
          options: opts,
          correctAnswer: q.correctAnswer && opts.includes(q.correctAnswer) ? q.correctAnswer : opts[0],
          hintText: q.hintText || 'پاسخ درست را انتخاب کن.',
          explanation: q.explanation || 'آفرین بر تلاش تو!',
        };
      })
      .filter(Boolean);

    setCreatingHw(true);
    try {
      await apiFetch('/api/homeworks', {
        method: 'POST',
        body: JSON.stringify({
          classroomId: cls?.id || null,
          gradeId: cls?.gradeId || hwGrade,
          bookId: hwBook,
          title: hwTitle.trim(),
          description: hwDesc.trim(),
          dueDate: hwDueDate,
          questions: validQuestions.length > 0 ? validQuestions : undefined,
          attachmentName: aiImageName || undefined,
        }),
      });
      soundEngine.playVictory();
      setHwTitle('');
      setHwDesc('');
      setAiRawText('');
      setAiImageBase64(null);
      setAiImageMime(null);
      setAiImageName(null);
      setAiNote(null);
      setHwQuestions([]);
      showToast('تکلیف با موفقیت در دفتر مأموریت‌های دانش‌آموزان ثبت شد.', 'success');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ثبت تکلیف ناموفق بود.', 'error');
    } finally {
      setCreatingHw(false);
    }
  };

  const handleGradeSubmission = async (
    subId: number,
    defaultScore: number,
    defaultFeedback: string
  ) => {
    const draft = subGrades[subId];
    const score = draft?.score !== undefined && draft.score !== '' ? Number(draft.score) : defaultScore;
    const feedback = draft?.feedback !== undefined ? draft.feedback : defaultFeedback;
    const status = draft?.status || 'graded';
    try {
      await apiFetch(`/api/teacher/submissions/${subId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          teacherScore: Number.isFinite(score) ? Math.max(0, Math.min(20, score)) : 20,
          teacherFeedback:
            feedback.trim() ||
            (status === 'needs_revision'
              ? 'لطفاً بخش‌های نادرست را دوباره مرور و اصلاح کن.'
              : 'آفرین بر تلاش منظم و دقیق تو!'),
          status,
        }),
      });
      soundEngine.playCorrect();
      showToast(
        status === 'needs_revision'
          ? 'درخواست اصلاح تکلیف برای دانش‌آموز و والدین ارسال شد.'
          : 'نمره و بازخورد تکلیف برای دانش‌آموز و والدین ثبت شد.',
        'success'
      );
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ثبت نمره ناموفق بود.', 'error');
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
      showToast('نمره و بازخورد آزمون برای دانش‌آموز و والدین ثبت شد.', 'success');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ثبت بازخورد آزمون ناموفق بود.', 'error');
    }
  };

  const openEditHomework = (hw: TeacherHomeworkRow) => {
    soundEngine.playClick();
    setEditingHomework(hw);
    setEditHwTitle(hw.title);
    setEditHwClassId(hw.classroomId ?? '');
    setEditHwGrade(hw.gradeId);
    setEditHwBook((hw.bookId as BookId) || 'math');
    setEditHwDueDate(hw.dueDate || '');
    setEditHwDesc(hw.description || '');
    const padded = (hw.questions || []).map((q) => {
      const opts = [...(q.options || [])];
      while (opts.length < 4) opts.push('');
      return {
        promptText: q.promptText || '',
        options: opts.slice(0, 4),
        correctAnswer: q.correctAnswer || '',
        hintText: q.hintText || 'صورت سؤال را با دقت بخوان.',
        explanation: q.explanation || 'آفرین بر تلاش تو!',
      };
    });
    setEditHwQuestions(padded);
  };

  const handleSaveHomeworkEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHomework || !editHwTitle.trim()) return;
    const validQuestions = editHwQuestions
      .map((q) => {
        const opts = q.options.map((o) => o.trim()).filter(Boolean);
        if (!q.promptText.trim() || opts.length < 2) return null;
        return {
          promptText: q.promptText.trim(),
          options: opts,
          correctAnswer:
            q.correctAnswer && opts.includes(q.correctAnswer) ? q.correctAnswer : opts[0],
          hintText: q.hintText || 'پاسخ درست را انتخاب کن.',
          explanation: q.explanation || 'آفرین بر تلاش تو!',
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    setSavingHwEdit(true);
    try {
      await apiFetch(`/api/teacher/homeworks/${editingHomework.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          classroomId: editHwClassId ? Number(editHwClassId) : null,
          gradeId: editHwGrade,
          bookId: editHwBook,
          title: editHwTitle.trim(),
          description: editHwDesc.trim(),
          dueDate: editHwDueDate.trim(),
          questions: validQuestions.length > 0 ? validQuestions : undefined,
        }),
      });
      soundEngine.playVictory();
      setEditingHomework(null);
      showToast('تغییرات تکلیف ذخیره شد و برای دانش‌آموزان بروزرسانی گردید.', 'success');
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ویرایش تکلیف ناموفق بود.', 'error');
    } finally {
      setSavingHwEdit(false);
    }
  };

  const filteredHomeworks = homeworks.filter((hw) =>
    classFilter === 'all' ? true : hw.classroomId === classFilter
  );

  const filteredExams = exams.filter((ex) =>
    classFilter === 'all' ? true : ex.classroomId === classFilter
  );

  const filteredExamAttempts = examAttempts.filter((ea) =>
    classFilter === 'all' ? true : ea.classroomId === classFilter
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Homework Creator with AI OCR & Custom Questions */}
        <form
          onSubmit={handleAssignHomework}
          className="lg:col-span-5 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4 h-fit"
        >
          <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <BookOpenCheck className="h-5 w-5 text-amber-600" />
            <span>تعریف تکلیف جدید و تبدیل به بازی</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              value={hwClassId}
              onChange={(e) => {
                const nextId = e.target.value ? Number(e.target.value) : '';
                setHwClassId(nextId);
                const cls = classrooms.find((c) => c.id === Number(nextId));
                if (cls) setHwGrade(cls.gradeId);
              }}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
            >
              <option value="">عمومی (بدون کلاس خاص)</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (پایه {formatPersianDigits(c.gradeId)})
                </option>
              ))}
            </select>
            <select
              value={hwBook}
              onChange={(e) => setHwBook(e.target.value as BookId)}
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
            value={hwTitle}
            onChange={(e) => setHwTitle(e.target.value)}
            placeholder="عنوان تکلیف (مثلاً: تمرین کسرهای مساوی صفحه ۴۲)"
            className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
            required
          />
          <textarea
            rows={2}
            value={hwDesc}
            onChange={(e) => setHwDesc(e.target.value)}
            placeholder="توضیحات تکلیف برای دانش‌آموزان..."
            className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm"
          />
          <input
            type="text"
            value={hwDueDate}
            onChange={(e) => setHwDueDate(e.target.value)}
            placeholder="مهلت تحویل (مثلاً ۱۴۰۴/۰۹/۱۲)"
            className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm"
          />

          {/* AI Homework Converter */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-700" />
                <span>تبدیل هوشمند متن یا عکس کتاب به سؤال تعاملی</span>
              </p>
            </div>
            <textarea
              rows={2}
              value={aiRawText}
              onChange={(e) => setAiRawText(e.target.value)}
              placeholder="متن تمرین کتاب را بچسبانید یا عکس صفحه تکلیف را آپلود کنید..."
              className="w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-900 cursor-pointer whitespace-nowrap">
                <Upload className="h-3.5 w-3.5" />
                <span>{aiImageName ? aiImageName.slice(0, 18) : 'آپلود عکس کتاب'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddManualHwQuestion}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 px-2.5 py-1.5 text-[11px] font-bold text-stone-700 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>سؤال دستی</span>
                </button>
                <button
                  type="button"
                  disabled={convertingAi}
                  onClick={handleConvertWithAI}
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 px-3 py-1.5 text-[11px] font-bold text-white cursor-pointer whitespace-nowrap"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{convertingAi ? 'در حال تبدیل...' : 'تبدیل با AI'}</span>
                </button>
              </div>
            </div>
            {aiNote && (
              <p className="text-[11px] font-semibold text-indigo-900 bg-white rounded-lg border border-indigo-100 px-2.5 py-1.5">
                یادداشت بازبینی: {aiNote}
              </p>
            )}
          </div>

          {/* Preview & Inline Edit of Attached Homework Questions */}
          {hwQuestions.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              <p className="text-xs font-extrabold text-stone-700 tabular-nums">
                پرسش‌های پیوست‌شده به تکلیف ({formatPersianDigits(hwQuestions.length)})
              </p>
              {hwQuestions.map((hq, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-stone-700">پرسش {formatPersianDigits(idx + 1)}</span>
                    <button
                      type="button"
                      onClick={() => setHwQuestions((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-rose-700 hover:underline font-bold cursor-pointer"
                    >
                      حذف
                    </button>
                  </div>
                  <input
                    type="text"
                    value={hq.promptText}
                    onChange={(e) =>
                      setHwQuestions((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, promptText: e.target.value } : item))
                      )
                    }
                    placeholder="صورت سؤال..."
                    className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {hq.options.slice(0, 4).map((opt, oi) => {
                      const trimmed = opt.trim();
                      const resolvedCorrect =
                        hq.correctAnswer && hq.options.some((o) => o.trim() === hq.correctAnswer)
                          ? hq.correctAnswer
                          : hq.options.find((o) => o.trim())?.trim() || '';
                      const isCorrectOpt = Boolean(trimmed) && resolvedCorrect === trimmed;
                      return (
                        <div key={oi} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (!trimmed) return;
                              setHwQuestions((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, correctAnswer: trimmed } : item
                                )
                              );
                            }}
                            title="انتخاب به عنوان پاسخ صحیح"
                            className={`h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer ${
                              isCorrectOpt
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-stone-300 bg-white text-stone-400 hover:border-emerald-400'
                            }`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) =>
                              setHwQuestions((prev) =>
                                prev.map((item, i) => {
                                  if (i !== idx) return item;
                                  const nextOpts = item.options.map((o, j) =>
                                    j === oi ? e.target.value : o
                                  );
                                  return {
                                    ...item,
                                    options: nextOpts,
                                    correctAnswer:
                                      item.correctAnswer === opt
                                        ? e.target.value.trim()
                                        : item.correctAnswer,
                                  };
                                })
                              )
                            }
                            placeholder={`گزینه ${formatPersianDigits(oi + 1)}`}
                            className="flex-1 min-w-0 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px]"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={creatingHw}
            className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 py-2.5 text-sm font-bold text-white cursor-pointer"
          >
            {creatingHw ? 'در حال انتشار...' : 'انتشار تکلیف در دنیای بازی دانش‌آموزان'}
          </button>
        </form>

        {/* Homework Status & Grading Panel */}
        <div className="lg:col-span-7 rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-extrabold text-stone-900">
              وضعیت تحویل تکالیف و تصحیح ({formatPersianDigits(filteredHomeworks.length)})
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={classFilter}
                onChange={(e) =>
                  setClassFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
              >
                <option value="all">همه کلاس‌ها</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={subStatusFilter}
                onChange={(e) => setSubStatusFilter(e.target.value as 'all' | 'pending' | 'graded')}
                className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold"
              >
                <option value="all">همه ارسال‌ها</option>
                <option value="pending">فقط منتظر تصحیح</option>
                <option value="graded">فقط بررسی‌شده</option>
              </select>
            </div>
          </div>

          {filteredHomeworks.length === 0 ? (
            <p className="text-sm text-stone-500">تکلیفی برای این فیلتر یافت نشد.</p>
          ) : (
            <div className="space-y-4">
              {filteredHomeworks.map((hw) => {
                const allHwSubs = submissions.filter((s) => s.homeworkId === hw.id);
                const hwSubs = allHwSubs.filter((s) => {
                  if (subStatusFilter === 'pending') return s.status === 'submitted';
                  if (subStatusFilter === 'graded') return s.status !== 'submitted';
                  return true;
                });
                const classMembers = hw.classroomId
                  ? enrollments.filter((e) => e.classroomId === hw.classroomId)
                  : [];
                const submittedIds = new Set(allHwSubs.map((s) => s.studentId));
                const missingStudents = classMembers.filter((m) => !submittedIds.has(m.studentId));
                const cls = classrooms.find((c) => c.id === hw.classroomId);
                const realm = REALMS.find((r) => r.bookId === hw.bookId);

                return (
                  <div
                    key={hw.id}
                    className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-extrabold text-stone-900">{hw.title}</p>
                        <p className="text-xs text-stone-500 tabular-nums">
                          {cls ? cls.name : `پایه ${formatPersianDigits(hw.gradeId)}`} ·{' '}
                          {realm?.bookTitle || hw.bookId} · مهلت: {hw.dueDate} · تحویل‌شده:{' '}
                          {formatPersianDigits(allHwSubs.length)}
                          {classMembers.length > 0 &&
                            ` · تحویل‌نداده: ${formatPersianDigits(missingStudents.length)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditHomework(hw)}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-800 hover:bg-stone-50 cursor-pointer whitespace-nowrap"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>ویرایش</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onRequestDelete({ kind: 'homework', id: hw.id, label: hw.title })
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>حذف تکلیف</span>
                        </button>
                      </div>
                    </div>

                    {missingStudents.length > 0 && (
                      <p className="text-xs font-semibold text-amber-800">
                        در انتظار ارسال: {missingStudents.map((m) => m.nickname).join('، ')}
                      </p>
                    )}

                    {hwSubs.length === 0 ? (
                      <p className="text-xs text-stone-500">
                        {allHwSubs.length === 0
                          ? 'هنوز دانش‌آموزی این تکلیف را ارسال نکرده است.'
                          : 'ارسالی مطابق فیلتر انتخاب‌شده وجود ندارد.'}
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {hwSubs.map((sub) => {
                          const draft = subGrades[sub.id] || {
                            score: sub.teacherScore !== null ? String(sub.teacherScore) : '20',
                            feedback: sub.teacherFeedback || '',
                            status:
                              sub.status === 'needs_revision' ? 'needs_revision' : 'graded',
                          };
                          const isExpanded = Boolean(expandedSubmissionIds[sub.id]);
                          const answersList = sub.answers || [];
                          return (
                            <div
                              key={sub.id}
                              className="rounded-lg border border-stone-200 bg-white p-3 space-y-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="font-extrabold text-stone-900 tabular-nums">
                                  {sub.studentName} · نمره خودکار: {formatPersianDigits(sub.autoScore)}٪
                                  {sub.submittedAt &&
                                    ` · ${new Date(sub.submittedAt).toLocaleDateString('fa-IR')}`}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`font-bold inline-flex items-center gap-1 ${
                                      sub.status === 'needs_revision'
                                        ? 'text-amber-700'
                                        : sub.status === 'graded'
                                          ? 'text-emerald-700'
                                          : 'text-indigo-700'
                                    }`}
                                  >
                                    {sub.status === 'graded' && (
                                      <>
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        نمره: {formatPersianDigits(sub.teacherScore ?? 20)}/۲۰
                                      </>
                                    )}
                                    {sub.status === 'needs_revision' && (
                                      <>
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        نیازمند اصلاح
                                      </>
                                    )}
                                    {sub.status === 'submitted' && 'در انتظار بازخورد'}
                                  </span>
                                  {answersList.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedSubmissionIds((prev) => ({
                                          ...prev,
                                          [sub.id]: !isExpanded,
                                        }))
                                      }
                                      className="inline-flex items-center gap-0.5 text-[11px] font-bold text-teal-700 hover:underline cursor-pointer whitespace-nowrap"
                                    >
                                      <span>{isExpanded ? 'بستن پاسخ‌ها' : 'مشاهده پاسخ‌ها'}</span>
                                      {isExpanded ? (
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      ) : (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {isExpanded && answersList.length > 0 && (
                                <div className="rounded-lg border border-[#EFE6D5] bg-[#FBF7EF] p-2.5 space-y-1.5 text-[11px]">
                                  {answersList.map((ans, idx) => (
                                    <div key={idx} className="flex items-start justify-between gap-2">
                                      <div className="space-y-0.5">
                                        <p className="font-bold text-stone-800">{ans.promptText}</p>
                                        <p className="text-stone-600">پاسخ دانش‌آموز: {ans.studentAnswer}</p>
                                      </div>
                                      <span
                                        className={`inline-flex items-center gap-0.5 font-bold shrink-0 ${
                                          ans.isCorrect ? 'text-emerald-700' : 'text-rose-700'
                                        }`}
                                      >
                                        {ans.isCorrect ? (
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
                                  ))}
                                </div>
                              )}

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
                                  className="w-20 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-bold tabular-nums"
                                />
                                <select
                                  value={draft.status}
                                  onChange={(e) =>
                                    setSubGrades((prev) => ({
                                      ...prev,
                                      [sub.id]: {
                                        ...draft,
                                        status: e.target.value as 'graded' | 'needs_revision',
                                      },
                                    }))
                                  }
                                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                                >
                                  <option value="graded">تأیید و نمره</option>
                                  <option value="needs_revision">نیازمند اصلاح</option>
                                </select>
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
                                  className="flex-1 min-w-[160px] rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs"
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
                                  className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                                >
                                  ثبت بازخورد
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

      {/* Exam Results & Detailed Question-by-Question Review */}
      <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
        <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-indigo-700" />
          <span>
            کارنامه آزمون‌های دانش‌آموزان و بررسی پاسخ‌ها ({formatPersianDigits(filteredExamAttempts.length)})
          </span>
        </h3>

        {filteredExams.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredExams.map((ex) => {
              const attemptsForEx = examAttempts.filter((a) => a.examId === ex.id);
              const takenIds = new Set(attemptsForEx.map((a) => a.studentId));
              const classMembers = ex.classroomId
                ? enrollments.filter((e) => e.classroomId === ex.classroomId)
                : [];
              const missing = classMembers.filter((m) => !takenIds.has(m.studentId));
              const cls = classrooms.find((c) => c.id === ex.classroomId);
              return (
                <div
                  key={`ex-sum-${ex.id}`}
                  className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 space-y-1 text-xs"
                >
                  <p className="font-extrabold text-stone-900 inline-flex items-center gap-1.5">
                    <ClipboardCheck className="h-3.5 w-3.5 text-indigo-700 shrink-0" />
                    <span className="truncate">{ex.title}</span>
                  </p>
                  <p className="text-stone-600 tabular-nums">
                    {cls ? cls.name : `عمومی پایه ${formatPersianDigits(ex.gradeId)}`} · شرکت‌کننده:{' '}
                    {classMembers.length > 0
                      ? `${formatPersianDigits(takenIds.size)} از ${formatPersianDigits(classMembers.length)} نفر`
                      : `${formatPersianDigits(attemptsForEx.length)} کارنامه`}
                  </p>
                  {missing.length > 0 && (
                    <p className="text-[11px] font-semibold text-amber-800">
                      در انتظار شرکت: {missing.map((m) => m.nickname).join('، ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {filteredExamAttempts.length === 0 ? (
          <p className="text-sm text-stone-500">هنوز کارنامه آزمونی برای این فیلتر ثبت نشده است.</p>
        ) : (
          <div className="space-y-3">
            {filteredExamAttempts.map((ea) => {
              const draft = examGrades[ea.id] || {
                score: String(ea.teacherScore ?? ea.score),
                feedback: ea.teacherFeedback || '',
              };
              const isExpanded = Boolean(expandedExamAttemptIds[ea.id]);
              const answersList = ea.gradedAnswers || [];
              const wrongTopics = ea.wrongTopics || [];
              return (
                <div
                  key={ea.id}
                  className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                    <div>
                      <span className="font-extrabold text-stone-900">
                        {ea.studentName} · {ea.examTitle}
                      </span>
                      {wrongTopics.length > 0 && (
                        <p className="text-[11px] font-semibold text-rose-700 mt-0.5">
                          مباحث نیازمند مرور: {wrongTopics.join('، ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-teal-800 tabular-nums">
                        نمره: {formatPersianDigits(ea.score)} از {formatPersianDigits(ea.maxScore)} (
                        {formatPersianDigits(ea.correctCount)}/{formatPersianDigits(ea.totalQuestions)} درست)
                      </span>
                      {answersList.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedExamAttemptIds((prev) => ({
                              ...prev,
                              [ea.id]: !isExpanded,
                            }))
                          }
                          className="inline-flex items-center gap-0.5 text-xs font-bold text-indigo-700 hover:underline cursor-pointer whitespace-nowrap"
                        >
                          <span>{isExpanded ? 'بستن جزئیات' : 'بررسی پاسخ‌ها'}</span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && answersList.length > 0 && (
                    <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-2 text-xs">
                      {answersList.map((ans, idx) => (
                        <div
                          key={ans.id || idx}
                          className="flex items-start justify-between gap-3 border-b border-stone-100 pb-2 last:border-0 last:pb-0"
                        >
                          <div className="space-y-0.5">
                            <p className="font-bold text-stone-900">
                              {formatPersianDigits(idx + 1)}. {ans.promptText}
                            </p>
                            <p className="text-stone-600">
                              پاسخ دانش‌آموز: <span className="font-bold">{ans.selected || 'پاسخ نداده'}</span> · پاسخ صحیح:{' '}
                              <span className="font-bold text-emerald-700">{ans.correctAnswer}</span>
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 font-bold shrink-0 ${
                              ans.isCorrect ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {ans.isCorrect ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                درست
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3.5 w-3.5" />
                                غلط
                              </>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

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
                      className="w-24 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold tabular-nums"
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
                      className="rounded-lg bg-indigo-700 hover:bg-indigo-800 px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
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

      {/* EDIT HOMEWORK MODAL */}
      {editingHomework && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
        >
          <form
            onSubmit={handleSaveHomeworkEdit}
            className="w-full max-w-2xl rounded-2xl border border-[#E5DAC5] bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-stone-900">
                ویرایش تکلیف «{editingHomework.title}»
              </h3>
              <button
                type="button"
                onClick={() => setEditingHomework(null)}
                className="rounded-xl p-1.5 text-stone-500 hover:bg-stone-100 cursor-pointer"
                aria-label="بستن"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">کلاس هدف</label>
                <select
                  value={editHwClassId}
                  onChange={(e) => {
                    const nextId = e.target.value ? Number(e.target.value) : '';
                    setEditHwClassId(nextId);
                    const cls = classrooms.find((c) => c.id === Number(nextId));
                    if (cls) setEditHwGrade(cls.gradeId);
                  }}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold"
                >
                  <option value="">عمومی (بدون کلاس خاص)</option>
                  {classrooms.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (پایه {formatPersianDigits(c.gradeId)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">کتاب درسی</label>
                <select
                  value={editHwBook}
                  onChange={(e) => setEditHwBook(e.target.value as BookId)}
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
                <label className="block text-xs font-bold text-stone-700 mb-1">مهلت تحویل</label>
                <input
                  type="text"
                  value={editHwDueDate}
                  onChange={(e) => setEditHwDueDate(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">عنوان تکلیف</label>
              <input
                type="text"
                value={editHwTitle}
                onChange={(e) => setEditHwTitle(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">توضیحات تکلیف</label>
              <textarea
                rows={2}
                value={editHwDesc}
                onChange={(e) => setEditHwDesc(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-sm"
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-stone-800 tabular-nums">
                  تمرین‌های تکلیف ({formatPersianDigits(editHwQuestions.length)})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditHwQuestions((prev) => [
                      ...prev,
                      {
                        promptText: '',
                        options: ['', '', '', ''],
                        correctAnswer: '',
                        hintText: 'صورت سؤال را با دقت بخوان.',
                        explanation: 'آفرین بر تلاش تو!',
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>افزودن پرسش</span>
                </button>
              </div>

              {editHwQuestions.map((hq, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-stone-800">
                      پرسش {formatPersianDigits(idx + 1)}
                    </span>
                    {editHwQuestions.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditHwQuestions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-rose-700 hover:underline font-bold cursor-pointer"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={hq.promptText}
                    onChange={(e) =>
                      setEditHwQuestions((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, promptText: e.target.value } : item
                        )
                      )
                    }
                    placeholder="صورت سؤال..."
                    className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {hq.options.slice(0, 4).map((opt, oi) => {
                      const trimmed = opt.trim();
                      const resolvedCorrect =
                        hq.correctAnswer && hq.options.some((o) => o.trim() === hq.correctAnswer)
                          ? hq.correctAnswer
                          : hq.options.find((o) => o.trim())?.trim() || '';
                      const isCorrectOpt = Boolean(trimmed) && resolvedCorrect === trimmed;
                      return (
                        <div key={oi} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (!trimmed) return;
                              setEditHwQuestions((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, correctAnswer: trimmed } : item
                                )
                              );
                            }}
                            title="انتخاب به عنوان پاسخ صحیح"
                            className={`h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer ${
                              isCorrectOpt
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-stone-300 bg-white text-stone-400 hover:border-emerald-400'
                            }`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) =>
                              setEditHwQuestions((prev) =>
                                prev.map((item, i) => {
                                  if (i !== idx) return item;
                                  const nextOpts = item.options.map((o, j) =>
                                    j === oi ? e.target.value : o
                                  );
                                  return {
                                    ...item,
                                    options: nextOpts,
                                    correctAnswer:
                                      item.correctAnswer === opt
                                        ? e.target.value.trim()
                                        : item.correctAnswer,
                                  };
                                })
                              )
                            }
                            placeholder={`گزینه ${formatPersianDigits(oi + 1)}`}
                            className="flex-1 min-w-0 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px]"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingHwEdit}
                onClick={() => setEditingHomework(null)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={savingHwEdit}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 px-5 py-2 text-xs font-bold text-white cursor-pointer"
              >
                {savingHwEdit ? 'در حال ذخیره...' : 'ذخیره تغییرات تکلیف'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
