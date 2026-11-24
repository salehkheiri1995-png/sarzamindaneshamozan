import React, { useState, useEffect } from 'react';
import { ExamAttemptItem, ExamItem } from '../../types/game';
import { REALMS, formatPersianDigits } from '../../shared/curriculum';
import { apiFetch } from '../../lib/api';
import { soundEngine } from '../../lib/sound';
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';

interface ExamCenterProps {
  studentId: number;
  gradeId: number;
  exams: ExamItem[];
  examAttempts: ExamAttemptItem[];
  isDemoMode: boolean;
  onRefresh: () => void;
}

interface ActiveExamReport {
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  durationSeconds: number;
  wrongTopics: string[];
  strengths: string[];
  gradedAnswers: Array<{
    id: string;
    promptText: string;
    selected: string;
    correctAnswer: string;
    explanation: string;
    isCorrect: boolean;
  }>;
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  placement: 'تعیین سطح رسمی',
  daily: 'آزمون روزانه',
  chapter_end: 'آزمون پایان فصل',
  weekly: 'آزمون هفتگی',
  midterm: 'آزمون میان‌ترم',
  final: 'آزمون پایان‌ترم',
  teacher_custom: 'آزمون اختصاصی معلم',
};

export function ExamCenter({
  studentId,
  exams,
  examAttempts,
  isDemoMode,
  onRefresh,
}: ExamCenterProps) {
  const [activeExam, setActiveExam] = useState<ExamItem | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<ActiveExamReport | null>(null);

  useEffect(() => {
    if (!activeExam || report) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeExam, report]);

  const startExam = (exam: ExamItem) => {
    soundEngine.playClick();
    setActiveExam(exam);
    setAnswers({});
    setSecondsLeft(exam.durationMinutes * 60);
    setStartTime(Date.now());
    setReport(null);
  };

  const handleSubmitExam = async () => {
    if (!activeExam) return;
    const durationSeconds = Math.max(5, Math.round((Date.now() - startTime) / 1000));

    if (isDemoMode) {
      let correctCount = 0;
      const wrongTopics: string[] = [];
      const strengths: string[] = [];
      const gradedAnswers = activeExam.questions.map((q) => {
        const selected = answers[q.id] || '';
        const isCorrect = selected === q.correctAnswer;
        if (isCorrect) {
          correctCount++;
          strengths.push(q.topicId);
        } else {
          wrongTopics.push(q.topicId);
        }
        return {
          id: q.id,
          promptText: q.promptText,
          selected,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          isCorrect,
        };
      });
      const score = Math.round((correctCount / Math.max(1, activeExam.questions.length)) * activeExam.maxScore);
      soundEngine.playVictory();
      setReport({
        score,
        maxScore: activeExam.maxScore,
        correctCount,
        totalQuestions: activeExam.questions.length,
        durationSeconds,
        wrongTopics: [...new Set(wrongTopics)],
        strengths: [...new Set(strengths)],
        gradedAnswers,
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{
        attempt: ActiveExamReport;
      }>(`/api/exams/${activeExam.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          studentId,
          answers,
          durationSeconds,
        }),
      });
      soundEngine.playVictory();
      setReport(res.attempt);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${formatPersianDigits(String(m).padStart(2, '0'))}:${formatPersianDigits(String(s).padStart(2, '0'))}`;
  };

  // Post-Exam Report View
  if (activeExam && report) {
    const pct = Math.round((report.correctCount / Math.max(1, report.totalQuestions)) * 100);
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-stone-900">کارنامه و گزارش تحلیلی آزمون</h2>
          <button
            type="button"
            onClick={() => {
              setActiveExam(null);
              setReport(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 cursor-pointer"
          >
            <ArrowRight className="h-4 w-4" />
            <span>بازگشت به فهرست آزمون‌ها</span>
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-5">
            <p className="text-xs font-semibold text-stone-500">نمره نهایی</p>
            <p className="mt-1 text-2xl font-extrabold text-amber-700 tabular-nums">
              {formatPersianDigits(report.score)} از {formatPersianDigits(report.maxScore)}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-5">
            <p className="text-xs font-semibold text-stone-500">درصد پاسخ صحیح</p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-700 tabular-nums">
              {formatPersianDigits(pct)}٪
            </p>
          </div>
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-5">
            <p className="text-xs font-semibold text-stone-500">تعداد درست</p>
            <p className="mt-1 text-2xl font-extrabold text-stone-900 tabular-nums">
              {formatPersianDigits(report.correctCount)} از {formatPersianDigits(report.totalQuestions)}
            </p>
          </div>
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-5">
            <p className="text-xs font-semibold text-stone-500">مدت زمان</p>
            <p className="mt-1 text-2xl font-extrabold text-stone-900 tabular-nums">
              {formatPersianDigits(report.durationSeconds)} ثانیه
            </p>
          </div>
        </div>

        {/* Strengths & Weaknesses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 space-y-2">
            <h3 className="text-sm font-extrabold text-emerald-950">نقاط قوت در این آزمون</h3>
            {report.strengths.length > 0 ? (
              <ul className="text-sm text-emerald-900 space-y-1 list-disc list-inside">
                {report.strengths.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-600">با کمی تمرین بیشتر نقاط قوتت درخشان می‌شود.</p>
            )}
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 space-y-2">
            <h3 className="text-sm font-extrabold text-amber-950">مباحث نیازمند مرور مجدد</h3>
            {report.wrongTopics.length > 0 ? (
              <ul className="text-sm text-amber-950 space-y-1 list-disc list-inside">
                {report.wrongTopics.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-800 font-semibold">عالی! هیچ مبحث ضعیفی در این آزمون نداشتی.</p>
            )}
          </div>
        </div>

        {/* Answer Review */}
        <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
          <h3 className="text-base font-extrabold text-stone-900">بررسی پاسخ‌ها و توضیحات آموزشی</h3>
          <div className="divide-y divide-[#F1E8D8]">
            {report.gradedAnswers.map((a, idx) => (
              <div key={a.id} className="py-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-stone-900">
                    {formatPersianDigits(idx + 1)}. {a.promptText}
                  </p>
                  {a.isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 shrink-0">
                      <CheckCircle2 className="h-4 w-4" />
                      صحیح
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 shrink-0">
                      <AlertCircle className="h-4 w-4" />
                      نیازمند مرور
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-600">
                  پاسخ تو: <span className="font-bold text-stone-900">{a.selected || 'پاسخ داده نشد'}</span> · پاسخ درست:{' '}
                  <span className="font-bold text-emerald-800">{a.correctAnswer}</span>
                </p>
                <p className="text-xs text-stone-700">{a.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Active Ad-Free Exam Taking Screen
  if (activeExam) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="sticky top-0 z-10 rounded-2xl border border-[#E5DAC5] bg-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-teal-800 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              محیط آزمون امن و کاملاً بدون تبلیغات
            </p>
            <h2 className="text-base sm:text-lg font-extrabold text-stone-900">{activeExam.title}</h2>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2 text-sm font-extrabold text-amber-950 tabular-nums">
              <Clock className="h-4 w-4 text-amber-700" />
              {formatTimer(secondsLeft)}
            </span>
            <button
              type="button"
              onClick={() => setActiveExam(null)}
              className="rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
            >
              انصراف
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {activeExam.questions.map((q, idx) => (
            <div key={q.id} className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
              <p className="text-base sm:text-lg font-extrabold text-stone-900">
                {formatPersianDigits(idx + 1)}. {q.promptText}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {q.options.map((opt) => {
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        setAnswers((prev) => ({ ...prev, [q.id]: opt }));
                      }}
                      className={`min-h-[50px] rounded-xl border-2 px-4 py-3 text-right text-sm sm:text-base font-bold transition-colors cursor-pointer ${
                        selected
                          ? 'border-amber-600 bg-amber-50 text-stone-950'
                          : 'border-[#E5DAC5] bg-[#FBF7EF]/50 text-stone-800 hover:border-amber-400'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-[#E5DAC5] bg-white p-5">
          <span className="text-sm font-semibold text-stone-600 tabular-nums">
            پاسخ داده‌شده: {formatPersianDigits(Object.keys(answers).length)} از{' '}
            {formatPersianDigits(activeExam.questions.length)} سؤال
          </span>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmitExam}
            className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-7 py-3 text-base font-extrabold text-white cursor-pointer"
          >
            {submitting ? 'در حال تصحیح...' : 'پایان آزمون و مشاهده کارنامه'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-2xl font-extrabold text-stone-900">مرکز آزمون‌های آموزشی (کاملاً بدون تبلیغ)</h2>
        <p className="mt-1 text-sm text-stone-600">
          آزمون‌های تعیین سطح، پایان فصل و آزمون‌های اختصاصی معلم متناسب با پایه تحصیلی تو.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exams.map((ex) => {
          const realm = REALMS.find((r) => r.bookId === ex.bookId);
          return (
            <div
              key={ex.id}
              className="rounded-2xl border border-[#E5DAC5] bg-white p-6 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="text-xs font-semibold text-stone-500 flex flex-wrap items-center gap-1.5">
                  <span>
                    {EXAM_TYPE_LABELS[ex.examType] || 'آزمون آموزشی'} · {realm?.bookTitle || 'جامع'} · زمان{' '}
                    {formatPersianDigits(ex.durationMinutes)} دقیقه
                  </span>
                  {ex.classroomName && (
                    <span className="text-teal-800 font-bold">· کلاس {ex.classroomName}</span>
                  )}
                  {ex.classroomIsActive === false && (
                    <span className="text-rose-700 font-extrabold">· بسته‌شده</span>
                  )}
                </div>
                <h3 className="text-lg font-extrabold text-stone-900">{ex.title}</h3>
                <p className="text-xs font-medium text-stone-600 tabular-nums">
                  تعداد سؤال: {formatPersianDigits(ex.questions.length)} · بارم نمره:{' '}
                  {formatPersianDigits(ex.maxScore)}
                </p>
              </div>
              <div className="flex justify-end border-t border-[#F1E8D8] pt-3.5">
                <button
                  type="button"
                  onClick={() => startExam(ex)}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2.5 text-sm font-bold text-white cursor-pointer"
                >
                  <ClipboardCheck className="h-4 w-4" />
                  <span>شروع آزمون</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {examAttempts.length > 0 && (
        <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-3">
          <h3 className="text-base font-extrabold text-stone-900">سوابق آزمون‌های اخیر تو و بازخورد معلم</h3>
          <div className="divide-y divide-[#F1E8D8]">
            {examAttempts.slice(0, 8).map((att) => (
              <div key={att.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="font-bold text-stone-800">
                    {att.examTitle || `آزمون #${formatPersianDigits(att.examId)}`} ·{' '}
                    {formatPersianDigits(att.correctCount)} از {formatPersianDigits(att.totalQuestions)} درست
                  </span>
                  <span className="font-extrabold text-emerald-800 tabular-nums">
                    نمره: {formatPersianDigits(att.teacherScore ?? att.score)} از{' '}
                    {formatPersianDigits(att.maxScore)}
                    {att.teacherScore !== null && att.teacherScore !== undefined && ' (تأیید معلم)'}
                  </span>
                </div>
                {att.teacherFeedback && (
                  <p className="text-xs font-semibold text-indigo-800">
                    بازخورد معلم: {att.teacherFeedback}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
