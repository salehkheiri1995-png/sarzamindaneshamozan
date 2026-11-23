import React, { useState } from 'react';
import { HomeworkItem, HomeworkQuestion } from '../../types/game';
import { REALMS, BookId, formatPersianDigits } from '../../shared/curriculum';
import { apiFetch } from '../../lib/api';
import { soundEngine } from '../../lib/sound';
import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Play,
  Sparkles,
  Upload,
  Plus,
  ArrowRight,
} from 'lucide-react';

interface HomeworkNotebookProps {
  studentId: number;
  gradeId: number;
  homeworks: HomeworkItem[];
  isDemoMode: boolean;
  onRefresh: () => void;
}

export function HomeworkNotebook({
  studentId,
  gradeId,
  homeworks,
  isDemoMode,
  onRefresh,
}: HomeworkNotebookProps) {
  const [activeHomework, setActiveHomework] = useState<HomeworkItem | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Array<{ promptText: string; studentAnswer: string; isCorrect: boolean }>
  >([]);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [showStepFeedback, setShowStepFeedback] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completedBanner, setCompletedBanner] = useState<string | null>(null);

  // Quick Parent/Student Homework Creator + AI OCR Converter
  const [showCreator, setShowCreator] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBookId, setNewBookId] = useState<BookId>('math');
  const [newRawText, setNewRawText] = useState('');
  const [newDueDate, setNewDueDate] = useState('۱۴۰۴/۰۹/۱۰');
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageMimeType, setImageMimeType] = useState<string | undefined>(undefined);
  const [attachmentName, setAttachmentName] = useState<string | undefined>(undefined);
  const [convertedQuestions, setConvertedQuestions] = useState<HomeworkQuestion[]>([]);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [creatorError, setCreatorError] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setCreatorError('فقط فایل‌های تصویری JPG، PNG یا WebP مجاز هستند.');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setCreatorError('حجم تصویر باید کمتر از ۴ مگابایت باشد.');
      return;
    }
    setAttachmentName(file.name);
    setImageMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleAiConvert = async () => {
    if (isDemoMode) {
      setCreatorError('برای تبدیل هوشمند تکلیف، لطفاً با حساب گوگل وارد شوید.');
      return;
    }
    if (!newRawText.trim() && !imageBase64) {
      setCreatorError('لطفاً متن تکلیف را بنویسید یا تصویر برگه تمرین را بارگذاری کنید.');
      return;
    }
    setConverting(true);
    setCreatorError(null);
    try {
      const res = await apiFetch<{
        ocrConfidenceNote: string;
        questions: HomeworkQuestion[];
      }>('/api/ai/convert-homework', {
        method: 'POST',
        body: JSON.stringify({
          gradeId,
          bookId: newBookId,
          rawText: newRawText,
          imageBase64,
          imageMimeType,
        }),
      });
      setConvertedQuestions(res.questions || []);
      setOcrNote(res.ocrConfidenceNote || null);
      soundEngine.playCorrect();
    } catch (err) {
      setCreatorError(err instanceof Error ? err.message : 'تبدیل تکلیف به بازی ناموفق بود.');
    } finally {
      setConverting(false);
    }
  };

  const handleSaveHomework = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) {
      setCreatorError('برای ثبت تکلیف جدید در پایگاه داده، لطفاً با حساب گوگل وارد شوید.');
      return;
    }
    if (!newTitle.trim()) {
      setCreatorError('عنوان تکلیف را وارد کنید.');
      return;
    }
    setSubmitting(true);
    setCreatorError(null);
    try {
      await apiFetch('/api/homeworks', {
        method: 'POST',
        body: JSON.stringify({
          gradeId,
          bookId: newBookId,
          title: newTitle.trim(),
          description: newRawText.trim() || 'تکلیف ثبت‌شده در دفتر مأموریت‌ها',
          dueDate: newDueDate,
          questions: convertedQuestions.length > 0 ? convertedQuestions : undefined,
          attachmentName,
        }),
      });
      soundEngine.playVictory();
      setShowCreator(false);
      setNewTitle('');
      setNewRawText('');
      setConvertedQuestions([]);
      setOcrNote(null);
      setImageBase64(undefined);
      onRefresh();
    } catch (err) {
      setCreatorError(err instanceof Error ? err.message : 'ثبت تکلیف انجام نشد.');
    } finally {
      setSubmitting(false);
    }
  };

  const startHomeworkMission = (hw: HomeworkItem) => {
    soundEngine.playClick();
    setActiveHomework(hw);
    setStepIndex(0);
    setAnswers([]);
    setSelectedChoice(null);
    setShowStepFeedback(false);
    setCompletedBanner(null);
  };

  const handleConfirmStep = () => {
    if (!activeHomework || !selectedChoice) return;
    const q = activeHomework.questions[stepIndex];
    const isCorrect = selectedChoice === q.correctAnswer;
    if (isCorrect) soundEngine.playCorrect();
    else soundEngine.playWrong();
    setShowStepFeedback(true);
    setAnswers((prev) => [
      ...prev,
      { promptText: q.promptText, studentAnswer: selectedChoice, isCorrect },
    ]);
  };

  const handleNextOrFinish = async () => {
    if (!activeHomework) return;
    if (stepIndex + 1 < activeHomework.questions.length) {
      setStepIndex((i) => i + 1);
      setSelectedChoice(null);
      setShowStepFeedback(false);
      return;
    }

    const correctCount = answers.filter((a) => a.isCorrect).length;
    const autoScore = Math.round((correctCount / Math.max(1, activeHomework.questions.length)) * 100);

    if (!isDemoMode) {
      setSubmitting(true);
      try {
        await apiFetch(`/api/homeworks/${activeHomework.id}/submit`, {
          method: 'POST',
          body: JSON.stringify({
            studentId,
            answers,
            autoScore,
          }),
        });
        soundEngine.playVictory();
        setCompletedBanner(
          `تکلیف «${activeHomework.title}» با موفقیت انجام و برای والدین و معلم ثبت شد! (+۴۰ سکه طلا)`
        );
        setActiveHomework(null);
        onRefresh();
      } catch (err) {
        setCompletedBanner(err instanceof Error ? err.message : 'ثبت تکلیف با خطا مواجه شد.');
      } finally {
        setSubmitting(false);
      }
    } else {
      soundEngine.playVictory();
      setCompletedBanner(`تکلیف آزمایشی «${activeHomework.title}» با امتیاز ${formatPersianDigits(autoScore)}٪ کامل شد!`);
      setActiveHomework(null);
    }
  };

  // Active Homework Mission Play Screen (Strictly Ad-Free)
  if (activeHomework) {
    const q = activeHomework.questions[stepIndex];
    const realm = REALMS.find((r) => r.bookId === activeHomework.bookId) || REALMS[0];
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setActiveHomework(null)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50 cursor-pointer"
          >
            <ArrowRight className="h-4 w-4" />
            <span>بازگشت به دفتر مأموریت‌ها</span>
          </button>
          <span className="text-sm font-bold text-stone-600 tabular-nums">
            تمرین {formatPersianDigits(stepIndex + 1)} از {formatPersianDigits(activeHomework.questions.length)}
          </span>
        </div>

        <div className="rounded-3xl border border-[#E5DAC5] bg-white p-6 sm:p-8 space-y-6">
          <div className="text-xs font-semibold text-teal-800">
            مأموریت تکلیف مدرسه · {realm.name} ({realm.bookTitle}) · {activeHomework.title}
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900 leading-relaxed">
            {q.promptText}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {q.options.map((opt) => {
              const chosen = selectedChoice === opt;
              const right = showStepFeedback && opt === q.correctAnswer;
              const wrong = showStepFeedback && chosen && opt !== q.correctAnswer;
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={showStepFeedback}
                  onClick={() => {
                    soundEngine.playClick();
                    setSelectedChoice(opt);
                  }}
                  className={`min-h-[56px] rounded-2xl border-2 px-5 py-3.5 text-right font-bold text-base transition-colors cursor-pointer ${
                    right
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                      : wrong
                        ? 'border-rose-500 bg-rose-50 text-rose-950'
                        : chosen
                          ? 'border-amber-600 bg-amber-50 text-stone-950'
                          : 'border-[#E5DAC5] bg-[#FBF7EF]/60 text-stone-800 hover:border-amber-400'
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {showStepFeedback && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-stone-800">
              <p className="font-bold text-stone-950">توضیح تمرین:</p>
              <p className="mt-1">{q.explanation || `پاسخ صحیح: ${q.correctAnswer}`}</p>
            </div>
          )}

          <div className="flex justify-end">
            {!showStepFeedback ? (
              <button
                type="button"
                disabled={!selectedChoice}
                onClick={handleConfirmStep}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 px-7 py-3 text-base font-bold text-white cursor-pointer"
              >
                ثبت پاسخ
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleNextOrFinish}
                className="rounded-xl bg-teal-700 hover:bg-teal-800 px-7 py-3 text-base font-bold text-white cursor-pointer"
              >
                {stepIndex + 1 < activeHomework.questions.length
                  ? 'تمرین بعدی'
                  : submitting
                    ? 'در حال ارسال...'
                    : 'تکمیل تکلیف و دریافت پاداش'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-stone-900">دفتر مأموریت‌های من (تکالیف واقعی مدرسه)</h2>
          <p className="mt-1 text-sm text-stone-600">
            تکالیف معلم و والدین اینجا به مأموریت‌های بازیمحور تبدیل می‌شوند و از مراحل اختیاری تفکیک شده‌اند.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            soundEngine.playClick();
            setShowCreator((prev) => !prev);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2.5 text-sm font-bold text-white cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>{showCreator ? 'بستن فرم ثبت تکلیف' : 'ثبت تکلیف روزانه (با تبدیل به بازی)'}</span>
        </button>
      </div>

      {completedBanner && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-950 flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
          <span>{completedBanner}</span>
        </div>
      )}

      {/* Parent/Teacher Quick Homework Creator with AI OCR-to-Mission */}
      {showCreator && (
        <form
          onSubmit={handleSaveHomework}
          className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-5"
        >
          <h3 className="text-lg font-extrabold text-stone-900">
            تعریف تکلیف جدید و تبدیل هوشمند به مأموریت بازی
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-stone-700 mb-1">درس مربوطه</label>
              <select
                value={newBookId}
                onChange={(e) => setNewBookId(e.target.value as BookId)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-semibold"
              >
                {REALMS.map((r) => (
                  <option key={r.bookId} value={r.bookId}>
                    {r.bookTitle} ({r.name})
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-stone-700 mb-1">عنوان تکلیف</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="مثلاً: تمرین ضرب صفحه ۴۲"
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
                required
              />
            </div>
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-stone-700 mb-1">مهلت تحویل</label>
              <input
                type="text"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              متن تمرین‌ها یا توضیحات تکلیف (برای تبدیل به مأموریت بازی)
            </label>
            <textarea
              rows={3}
              value={newRawText}
              onChange={(e) => setNewRawText(e.target.value)}
              placeholder="متن تکلیف یا چند سؤال را بنویسید، یا تصویر برگه تمرین را زیر آن بارگذاری کنید..."
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-[#FBF7EF] hover:bg-amber-50 px-4 py-2.5 text-sm font-bold text-stone-800 cursor-pointer">
              <Upload className="h-4 w-4 text-amber-700" />
              <span>{attachmentName ? `تصویر: ${attachmentName}` : 'بارگذاری تصویر برگه تکلیف (OCR)'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageUpload} className="hidden" />
            </label>

            <button
              type="button"
              disabled={converting}
              onClick={handleAiConvert}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 disabled:opacity-60 px-4 py-2.5 text-sm font-bold text-white cursor-pointer"
            >
              <Sparkles className="h-4 w-4" />
              <span>{converting ? 'در حال تبدیل با هوش مصنوعی...' : 'تبدیل تکلیف به مأموریت بازی'}</span>
            </button>
          </div>

          {ocrNote && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-950">
              یادآوری بازبینی والدین/معلم: {ocrNote}
            </p>
          )}

          {convertedQuestions.length > 0 && (
            <div className="space-y-2 rounded-xl border border-stone-200 bg-[#FBF7EF] p-4">
              <p className="text-xs font-bold text-stone-700">
                پیش‌نمایش {formatPersianDigits(convertedQuestions.length)} تمرین تبدیل‌شده (پیش از ذخیره بازبینی کنید):
              </p>
              {convertedQuestions.map((cq, idx) => (
                <div key={idx} className="text-xs text-stone-800 border-t border-stone-200 pt-2">
                  <span className="font-bold">{formatPersianDigits(idx + 1)}. {cq.promptText}</span>
                  <span className="mr-2 text-emerald-700">(پاسخ: {cq.correctAnswer})</span>
                </div>
              ))}
            </div>
          )}

          {creatorError && <p className="text-sm font-medium text-rose-700">{creatorError}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-6 py-2.5 text-sm font-bold text-white cursor-pointer"
            >
              {submitting ? 'در حال ذخیره...' : 'تأیید و افزودن به دفتر مأموریت‌ها'}
            </button>
          </div>
        </form>
      )}

      {/* Homework List */}
      {homeworks.length === 0 ? (
        <div className="rounded-2xl border border-[#E5DAC5] bg-white p-10 text-center space-y-2">
          <BookOpenCheck className="h-10 w-10 text-amber-600 mx-auto" />
          <p className="text-base font-bold text-stone-800">
            هنوز تکلیف مدرسه‌ای برای این پایه ثبت نشده است.
          </p>
          <p className="text-sm text-stone-500">
            والدین از دکمه بالای همین صفحه و معلمان از پنل معلم می‌توانند تکلیف روزانه ثبت کنند تا به مأموریت بازی تبدیل شود.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {homeworks.map((hw) => {
            const realm = REALMS.find((r) => r.bookId === hw.bookId) || REALMS[0];
            const isDone = Boolean(hw.submission);
            return (
              <div
                key={hw.id}
                className="rounded-2xl border border-[#E5DAC5] bg-white p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
                    <span>
                      {hw.creatorRole === 'teacher' ? 'تکلیف رسمی معلم' : 'تکلیف ثبت‌شده والدین'} · {realm.bookTitle}
                    </span>
                    <span className="inline-flex items-center gap-1 text-stone-600">
                      <Clock className="h-3.5 w-3.5" />
                      مهلت: {hw.dueDate}
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-stone-900">{hw.title}</h3>
                  {hw.description && (
                    <p className="text-sm text-stone-600 leading-relaxed">{hw.description}</p>
                  )}
                  <p className="text-xs font-medium text-teal-800">
                    اجرا در {realm.name} · {formatPersianDigits(hw.questions.length)} مأموریت تمرین
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[#F1E8D8] pt-3.5">
                  {isDone ? (
                    <div className="text-xs font-bold text-emerald-800 space-y-0.5">
                      <p>
                        انجام‌شده · نمره خودکار: {formatPersianDigits(hw.submission!.autoScore)}٪
                        {hw.submission!.teacherScore !== null &&
                          ` · نمره معلم: ${formatPersianDigits(hw.submission!.teacherScore)} از ۲۰`}
                      </p>
                      {hw.submission!.teacherFeedback && (
                        <p className="text-stone-600 font-medium">
                          بازخورد معلم: {hw.submission!.teacherFeedback}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-amber-800">در انتظار انجام</span>
                  )}

                  <button
                    type="button"
                    onClick={() => startHomeworkMission(hw)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 px-4 py-2 text-sm font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    <Play className="h-4 w-4" />
                    <span>{isDone ? 'مرور مجدد' : 'شروع مأموریت تکلیف'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
