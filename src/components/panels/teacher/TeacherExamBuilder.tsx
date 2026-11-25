import React, { useEffect, useRef, useState } from 'react';
import {
  BookId,
  DIFFICULTY_LABELS,
  DifficultyLevel,
  GRADES,
  REALMS,
  formatPersianDigits,
} from '../../../shared/curriculum';
import { apiFetch } from '../../../lib/api';
import { soundEngine } from '../../../lib/sound';
import { useToast } from '../../../context/ToastContext';
import {
  ExamQuestionItem,
  TeacherClassroomRow,
  TeacherDeleteTarget,
  TeacherExamRow,
} from './types';
import {
  ClipboardList,
  Plus,
  Search,
  Trash2,
  BookOpen,
  CheckCircle2,
  Library,
  Clock,
  Pencil,
  X,
} from 'lucide-react';

interface CurriculumBankQuestion {
  id: number;
  gradeId: number;
  bookId: string;
  topicId: string;
  promptText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  contentSource: string;
}

interface TeacherExamBuilderProps {
  classrooms: TeacherClassroomRow[];
  exams: TeacherExamRow[];
  onRefresh: () => Promise<void> | void;
  onRequestDelete: (target: TeacherDeleteTarget) => void;
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  teacher_custom: 'آزمون اختصاصی معلم',
  weekly: 'آزمون هفتگی',
  chapter_end: 'پایان فصل',
  midterm: 'ارزیابی میان‌ترم',
};

function createBlankQuestion(bookId: BookId): ExamQuestionItem {
  return {
    id: `tq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    topicId: 'ارزیابی درس',
    bookId,
    promptText: '',
    options: ['', '', '', ''],
    correctAnswer: '',
    explanation: '',
  };
}

export function TeacherExamBuilder({
  classrooms,
  exams,
  onRefresh,
  onRequestDelete,
}: TeacherExamBuilderProps) {
  const { showToast } = useToast();

  const formRef = useRef<HTMLFormElement | null>(null);
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [examClassId, setExamClassId] = useState<number | ''>(classrooms[0]?.id ?? '');
  const [examGrade, setExamGrade] = useState<number>(classrooms[0]?.gradeId ?? 3);
  const [examBook, setExamBook] = useState<BookId>('math');
  const [examType, setExamType] = useState<string>('teacher_custom');
  const [examDifficulty, setExamDifficulty] = useState<DifficultyLevel>('medium');
  const [examTitle, setExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState(15);
  const [examMaxScore, setExamMaxScore] = useState(20);
  const [questions, setQuestions] = useState<ExamQuestionItem[]>([createBlankQuestion('math')]);
  const [submitting, setSubmitting] = useState(false);

  // Question bank picker state
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [bankSearch, setBankSearch] = useState('');
  const [bankBookFilter, setBankBookFilter] = useState<string>('all');
  const [bankItems, setBankItems] = useState<CurriculumBankQuestion[]>([]);
  const [loadingBank, setLoadingBank] = useState(false);

  useEffect(() => {
    if (examClassId) {
      const cls = classrooms.find((c) => c.id === Number(examClassId));
      if (cls) setExamGrade(cls.gradeId);
    }
  }, [examClassId, classrooms]);

  const loadBankQuestions = async () => {
    setLoadingBank(true);
    try {
      const params = new URLSearchParams();
      params.set('gradeId', String(examGrade));
      if (bankBookFilter !== 'all') params.set('bookId', bankBookFilter);
      if (bankSearch.trim()) params.set('q', bankSearch.trim());
      const res = await apiFetch<{ questions: CurriculumBankQuestion[] }>(
        `/api/teacher/curriculum-questions?${params.toString()}`
      );
      setBankItems(res.questions || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'دریافت بانک سؤال ناموفق بود.', 'error');
    } finally {
      setLoadingBank(false);
    }
  };

  useEffect(() => {
    if (showBankPicker) {
      loadBankQuestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBankPicker, examGrade, bankBookFilter]);

  const handleAddBlankQuestion = () => {
    soundEngine.playClick();
    setQuestions((prev) => [...prev, createBlankQuestion(examBook)]);
  };

  const handlePickFromBank = (bq: CurriculumBankQuestion) => {
    soundEngine.playClick();
    const cleanOptions = bq.options.length >= 2 ? bq.options.slice(0, 4) : [bq.correctAnswer, 'سایر موارد'];
    const picked: ExamQuestionItem = {
      id: `bank_${bq.id}_${Date.now().toString().slice(-4)}`,
      topicId: bq.topicId,
      bookId: bq.bookId,
      promptText: bq.promptText,
      options: cleanOptions,
      correctAnswer: bq.correctAnswer,
      explanation: bq.explanation || 'مرور کتاب درسی به درک بهتر کمک می‌کند.',
    };
    setQuestions((prev) => {
      const hasOnlyEmptyPlaceholder =
        prev.length === 1 && !prev[0].promptText.trim() && prev[0].options.every((o) => !o.trim());
      return hasOnlyEmptyPlaceholder ? [picked] : [...prev, picked];
    });
    showToast('سؤال به آزمون اضافه شد.', 'success');
  };

  const handleUpdateQuestionField = (
    idx: number,
    patch: Partial<ExamQuestionItem>
  ) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const handleUpdateOption = (qIdx: number, optIdx: number, val: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIdx) return q;
        const oldVal = q.options[optIdx];
        const nextOpts = q.options.map((o, j) => (j === optIdx ? val : o));
        const nextCorrect = q.correctAnswer === oldVal ? val : q.correctAnswer;
        return { ...q, options: nextOpts, correctAnswer: nextCorrect };
      })
    );
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    soundEngine.playClick();
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const startEditExam = (ex: TeacherExamRow) => {
    soundEngine.playClick();
    setEditingExamId(ex.id);
    setExamClassId(ex.classroomId ?? '');
    setExamGrade(ex.gradeId);
    setExamBook((ex.bookId as BookId) || 'math');
    setExamType(ex.examType || 'teacher_custom');
    setExamDifficulty((ex.difficulty as DifficultyLevel) || 'medium');
    setExamTitle(ex.title);
    setExamDuration(ex.durationMinutes);
    setExamMaxScore(ex.maxScore);
    const loadedQuestions = (ex.questions || []).map((q) => {
      const paddedOpts = [...(q.options || [])];
      while (paddedOpts.length < 4) paddedOpts.push('');
      return {
        ...q,
        options: paddedOpts.slice(0, 4),
        explanation: q.explanation || '',
      };
    });
    setQuestions(loadedQuestions.length > 0 ? loadedQuestions : [createBlankQuestion((ex.bookId as BookId) || 'math')]);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const cancelEditExam = () => {
    soundEngine.playClick();
    setEditingExamId(null);
    setExamClassId(classrooms[0]?.id ?? '');
    setExamGrade(classrooms[0]?.gradeId ?? 3);
    setExamBook('math');
    setExamType('teacher_custom');
    setExamDifficulty('medium');
    setExamTitle('');
    setExamDuration(15);
    setExamMaxScore(20);
    setQuestions([createBlankQuestion('math')]);
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTitle.trim()) {
      showToast('عنوان آزمون را وارد کنید.', 'error');
      return;
    }

    const preparedQuestions: ExamQuestionItem[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const prompt = q.promptText.trim();
      const opts = q.options.map((o) => o.trim()).filter(Boolean);
      if (!prompt) {
        showToast(`متن سؤال شماره ${formatPersianDigits(i + 1)} خالی است.`, 'error');
        return;
      }
      if (opts.length < 2) {
        showToast(`سؤال شماره ${formatPersianDigits(i + 1)} باید حداقل ۲ گزینه داشته باشد.`, 'error');
        return;
      }
      const correct = q.correctAnswer && opts.includes(q.correctAnswer) ? q.correctAnswer : opts[0];
      preparedQuestions.push({
        id: q.id || `tq_${Date.now()}_${i + 1}`,
        topicId: q.topicId.trim() || 'ارزیابی کلاسی',
        bookId: q.bookId || examBook,
        promptText: prompt,
        options: opts,
        correctAnswer: correct,
        explanation: q.explanation.trim() || 'پاسخ درست را با دقت مرور کن.',
      });
    }

    setSubmitting(true);
    try {
      const payload = {
        classroomId: examClassId ? Number(examClassId) : null,
        gradeId: examGrade,
        bookId: examBook,
        examType,
        difficulty: examDifficulty,
        title: examTitle.trim(),
        durationMinutes: Math.max(5, Math.min(90, Number(examDuration) || 15)),
        maxScore: Math.max(10, Math.min(100, Number(examMaxScore) || 20)),
        questions: preparedQuestions,
      };
      if (editingExamId !== null) {
        await apiFetch(`/api/teacher/exams/${editingExamId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        soundEngine.playVictory();
        showToast(`تغییرات آزمون «${examTitle.trim()}» با موفقیت ذخیره شد.`, 'success');
        setEditingExamId(null);
      } else {
        await apiFetch('/api/exams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        soundEngine.playVictory();
        showToast(
          `آزمون «${examTitle.trim()}» با ${formatPersianDigits(preparedQuestions.length)} سؤال منتشر شد.`,
          'success'
        );
      }
      setExamTitle('');
      setQuestions([createBlankQuestion(examBook)]);
      await onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ذخیره آزمون ناموفق بود.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        ref={formRef}
        onSubmit={handleSaveExam}
        className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-5"
      >
        {editingExamId !== null && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-amber-950">
            <span>در حال ویرایش آزمون «{examTitle || 'منتخب'}» — پس از ذخیره، تغییرات بلافاصله برای دانش‌آموزان اعمال می‌شود.</span>
            <button
              type="button"
              onClick={cancelEditExam}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-amber-900 hover:bg-amber-100 cursor-pointer whitespace-nowrap"
            >
              <X className="h-3.5 w-3.5" />
              <span>انصراف از ویرایش</span>
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-600" />
              <span>{editingExamId !== null ? 'ویرایش آزمون و سؤالات' : 'آزمون‌ساز حرفه‌ای بدون تبلیغ'}</span>
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              سؤال‌ها را به‌صورت اختصاصی بنویسید یا مستقیماً از بانک سؤالات کتاب درسی انتخاب کنید.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setShowBankPicker((v) => !v);
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
              showBankPicker
                ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                : 'border-stone-300 bg-white hover:bg-stone-50 text-stone-800'
            }`}
          >
            <Library className="h-4 w-4 text-indigo-700" />
            <span>{showBankPicker ? 'بستن بانک سؤال' : 'انتخاب از بانک سؤالات'}</span>
          </button>
        </div>

        {/* Exam Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-stone-600 mb-1">عنوان آزمون</label>
            <input
              type="text"
              value={examTitle}
              onChange={(e) => setExamTitle(e.target.value)}
              placeholder="مثلاً: آزمون فصل سوم کسرها"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-600 mb-1">کلاس هدف</label>
            <select
              value={examClassId}
              onChange={(e) => setExamClassId(e.target.value ? Number(e.target.value) : '')}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
            >
              <option value="">عمومی برای پایه</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-600 mb-1">پایه</label>
            <select
              value={examGrade}
              disabled={Boolean(examClassId)}
              onChange={(e) => setExamGrade(Number(e.target.value))}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold disabled:bg-stone-100"
            >
              {GRADES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.shortTitle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-600 mb-1">کتاب درسی</label>
            <select
              value={examBook}
              onChange={(e) => setExamBook(e.target.value as BookId)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
            >
              {REALMS.map((r) => (
                <option key={r.bookId} value={r.bookId}>
                  {r.bookTitle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-600 mb-1">نوع آزمون</label>
            <select
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
            >
              {Object.entries(EXAM_TYPE_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-stone-600 mb-1">مدت آزمون (دقیقه)</label>
            <input
              type="number"
              min={5}
              max={90}
              value={examDuration}
              onChange={(e) => setExamDuration(Number(e.target.value))}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-600 mb-1">بارم کل نمره</label>
            <input
              type="number"
              min={10}
              max={100}
              value={examMaxScore}
              onChange={(e) => setExamMaxScore(Number(e.target.value))}
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-600 mb-1">سطح دشواری</label>
            <select
              value={examDifficulty}
              onChange={(e) => setExamDifficulty(e.target.value as DifficultyLevel)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
            >
              {(['easy', 'medium', 'hard', 'challenge'] as DifficultyLevel[]).map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Question Bank Picker Drawer */}
        {showBankPicker && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="h-4 w-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={bankSearch}
                  onChange={(e) => setBankSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      loadBankQuestions();
                    }
                  }}
                  placeholder="جستجو در متن سؤال یا مبحث..."
                  className="w-full rounded-xl border border-stone-300 bg-white pr-9 pl-3 py-2 text-xs"
                />
              </div>
              <select
                value={bankBookFilter}
                onChange={(e) => setBankBookFilter(e.target.value)}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="all">همه کتاب‌ها</option>
                {REALMS.map((r) => (
                  <option key={r.bookId} value={r.bookId}>
                    {r.bookTitle}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={loadBankQuestions}
                className="rounded-xl bg-indigo-700 hover:bg-indigo-800 px-3.5 py-2 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
              >
                جستجو
              </button>
            </div>

            {loadingBank ? (
              <p className="text-xs text-stone-500 py-2">در حال بارگذاری سؤالات بانک...</p>
            ) : bankItems.length === 0 ? (
              <p className="text-xs text-stone-500 py-2">سؤالی با این فیلتر پیدا نشد.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2">
                {bankItems.map((bq) => {
                  const realm = REALMS.find((r) => r.bookId === bq.bookId);
                  return (
                    <div
                      key={bq.id}
                      className="rounded-xl border border-indigo-100 bg-white px-3.5 py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-stone-500">
                          {realm?.bookTitle || bq.bookId} · {bq.topicId}
                        </p>
                        <p className="text-xs font-bold text-stone-900 truncate">{bq.promptText}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePickFromBank(bq)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-2.5 py-1.5 text-[11px] font-bold text-white cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>افزودن</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Dynamic Questions List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-extrabold text-stone-900 tabular-nums">
              سؤال‌های آزمون ({formatPersianDigits(questions.length)} سؤال)
            </h4>
            <button
              type="button"
              onClick={handleAddBlankQuestion}
              className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>افزودن سؤال جدید</span>
            </button>
          </div>

          <div className="space-y-3">
            {questions.map((q, qIdx) => {
              const nonEmptyOpts = q.options.map((o) => o.trim()).filter(Boolean);
              const resolvedCorrect =
                q.correctAnswer && nonEmptyOpts.includes(q.correctAnswer)
                  ? q.correctAnswer
                  : nonEmptyOpts[0] || '';
              return (
                <div
                  key={q.id}
                  className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-stone-800 tabular-nums">
                      سؤال شماره {formatPersianDigits(qIdx + 1)}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={q.topicId}
                        onChange={(e) => handleUpdateQuestionField(qIdx, { topicId: e.target.value })}
                        placeholder="نام مبحث"
                        className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs w-36"
                      />
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(qIdx)}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>حذف</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    value={q.promptText}
                    onChange={(e) => handleUpdateQuestionField(qIdx, { promptText: e.target.value })}
                    placeholder="صورت سؤال را وارد کنید..."
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs sm:text-sm"
                    required
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, optIdx) => {
                      const isCorrectOpt = Boolean(opt.trim()) && resolvedCorrect === opt.trim();
                      return (
                        <div key={optIdx} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (!opt.trim()) return;
                              handleUpdateQuestionField(qIdx, { correctAnswer: opt.trim() });
                            }}
                            title="انتخاب به عنوان پاسخ صحیح"
                            className={`h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                              isCorrectOpt
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-stone-300 bg-white text-stone-400 hover:border-emerald-400'
                            }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => handleUpdateOption(qIdx, optIdx, e.target.value)}
                            placeholder={`گزینه ${formatPersianDigits(optIdx + 1)}${optIdx >= 2 ? ' (اختیاری)' : ''}`}
                            className="flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    value={q.explanation}
                    onChange={(e) => handleUpdateQuestionField(qIdx, { explanation: e.target.value })}
                    placeholder="توضیح آموزشی کوتاه برای نمایش پس از پاسخ دانش‌آموز (اختیاری)"
                    className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-stone-500">
            تیک سبز کنار هر گزینه، پاسخ صحیح را مشخص می‌کند. این آزمون بدون هیچ تبلیغی برای دانش‌آموزان نمایش داده می‌شود.
          </p>
          <div className="flex items-center gap-2">
            {editingExamId !== null && (
              <button
                type="button"
                onClick={cancelEditExam}
                className="rounded-xl border border-stone-300 bg-white hover:bg-stone-50 px-4 py-2.5 text-sm font-bold text-stone-700 cursor-pointer whitespace-nowrap"
              >
                انصراف
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 px-6 py-2.5 text-sm font-extrabold text-white cursor-pointer whitespace-nowrap"
            >
              {submitting
                ? 'در حال ذخیره...'
                : editingExamId !== null
                  ? 'ذخیره تغییرات آزمون'
                  : 'انتشار آزمون برای دانش‌آموزان'}
            </button>
          </div>
        </div>
      </form>

      {/* Published Exams Manager */}
      <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-3">
        <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-teal-700" />
          <span>آزمون‌های منتشرشده من ({formatPersianDigits(exams.length)})</span>
        </h3>
        {exams.length === 0 ? (
          <p className="text-xs text-stone-500">
            هنوز آزمونی نساخته‌اید. از فرم بالا اولین آزمون خود را طراحی و منتشر کنید.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {exams.map((ex) => {
              const cls = classrooms.find((c) => c.id === ex.classroomId);
              const realm = REALMS.find((r) => r.bookId === ex.bookId);
              const qCount = ex.questions?.length ?? 0;
              return (
                <div
                  key={ex.id}
                  className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${
                    editingExamId === ex.id
                      ? 'border-amber-400 bg-amber-50/50'
                      : 'border-[#EFE6D5] bg-[#FBF7EF]'
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-extrabold text-stone-900">{ex.title}</p>
                    <p className="text-xs text-stone-600 tabular-nums">
                      {cls ? cls.name : `عمومی پایه ${formatPersianDigits(ex.gradeId)}`} ·{' '}
                      {realm?.bookTitle || ex.bookId} · {EXAM_TYPE_LABELS[ex.examType] || ex.examType}
                    </p>
                    <p className="text-[11px] font-semibold text-stone-500 flex items-center gap-2 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-amber-700" />
                        {formatPersianDigits(ex.durationMinutes)} دقیقه
                      </span>
                      <span>·</span>
                      <span>بارم: {formatPersianDigits(ex.maxScore)}</span>
                      <span>·</span>
                      <span>{formatPersianDigits(qCount)} سؤال</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEditExam(ex)}
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-50 cursor-pointer whitespace-nowrap"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>ویرایش</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onRequestDelete({ kind: 'exam', id: ex.id, label: ex.title })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
