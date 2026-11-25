import React, { useState } from 'react';
import {
  BookId,
  DifficultyLevel,
  GRADES,
  QUESTION_TYPE_LABELS,
  QuestionType,
  REALMS,
  formatPersianDigits,
} from '../../shared/curriculum';
import { apiFetch } from '../../lib/api';
import { soundEngine } from '../../lib/sound';
import { ImagePlus, Trash2, Gamepad2, CheckCircle2 } from 'lucide-react';

interface ManualQuestionBuilderProps {
  isAdmin?: boolean;
  classrooms?: Array<{ id: number; name: string; gradeId: number }>;
  onCreated: (message: string) => void;
  onError: (error: string) => void;
}

const ALL_GAME_TYPES: QuestionType[] = [
  'mcq',
  'true_false',
  'fill_blank',
  'pattern_puzzle',
  'word_builder',
  'order_numbers',
  'spelling_fix',
  'match_pairs',
  'memory_cards',
  'category_sort',
  'shape_lab',
];

export function ManualQuestionBuilder({
  isAdmin = false,
  classrooms = [],
  onCreated,
  onError,
}: ManualQuestionBuilderProps) {
  const [selectedClassId, setSelectedClassId] = useState<number | ''>('');
  const [gradeId, setGradeId] = useState(3);
  const [bookId, setBookId] = useState<BookId>('math');
  const [chapterId, setChapterId] = useState('فصل ۲');
  const [topicId, setTopicId] = useState('تمرین کلاسی');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [questionType, setQuestionType] = useState<QuestionType>('mcq');
  const [storyIntro, setStoryIntro] = useState('مأموریت ویژه معلم کلاس برای قهرمانان!');
  const [promptText, setPromptText] = useState('');
  const [hintText, setHintText] = useState('صورت سؤال و تصویر آن را با دقت بررسی کن.');
  const [explanation, setExplanation] = useState('');
  const [publishNow, setPublishNow] = useState(isAdmin);
  const [submitting, setSubmitting] = useState(false);

  // Uploaded image (base64 Data URL <= 2MB)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);

  // Dynamic game-specific form states
  const [opt1, setOpt1] = useState('');
  const [opt2, setOpt2] = useState('');
  const [opt3, setOpt3] = useState('');
  const [opt4, setOpt4] = useState('');
  const [correctIndex, setCorrectIndex] = useState(0);

  const [tfAnswer, setTfAnswer] = useState<'درست' | 'نادرست'>('درست');
  const [patternSeq, setPatternSeq] = useState('۲، ۴، ۶، ؟');

  const [targetWord, setTargetWord] = useState('درخت');
  const [orderList, setOrderList] = useState('۱۲، ۲۵، ۴۸، ۷۰');

  const [spellingSentence, setSpellingSentence] = useState('هوا امروز بسیار لطیف و باسفا است.');
  const [spellingWrong, setSpellingWrong] = useState('باسفا');
  const [spellingRight, setSpellingRight] = useState('باصفا');

  const [pair1L, setPair1L] = useState('۳ × ۴');
  const [pair1R, setPair1R] = useState('۱۲');
  const [pair2L, setPair2L] = useState('۵ × ۶');
  const [pair2R, setPair2R] = useState('۳۰');
  const [pair3L, setPair3L] = useState('۷ × ۲');
  const [pair3R, setPair3R] = useState('۱۴');

  const [bucket1, setBucket1] = useState('موجودات زنده');
  const [bucket2, setBucket2] = useState('موجودات غیرزنده');
  const [sortB1Items, setSortB1Items] = useState('درخت، گنجشک');
  const [sortB2Items, setSortB2Items] = useState('سنگ، صندلی');

  const [totalSlices, setTotalSlices] = useState(4);
  const [targetSlices, setTargetSlices] = useState(3);
  const [shapeLabel, setShapeLabel] = useState('کسر سه‌چهارم را رنگ کن');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      onError('فقط تصاویر با فرمت JPG، PNG یا WebP مجاز هستند.');
      return;
    }
    if (file.size > 1.8 * 1024 * 1024) {
      onError('حجم تصویر باید کمتر از ۱.۸ مگابایت باشد.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
        setImageName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const buildPayloadAndAnswer = (): {
    payload: Record<string, unknown>;
    correctAnswer: string;
  } | null => {
    if (questionType === 'mcq' || questionType === 'fill_blank') {
      const options = [opt1, opt2, opt3, opt4].map((x) => x.trim()).filter(Boolean);
      if (options.length < 2) {
        onError('حداقل دو گزینه وارد کنید.');
        return null;
      }
      const safeIdx = Math.min(correctIndex, options.length - 1);
      return {
        payload: questionType === 'fill_blank' ? { choices: options } : { options },
        correctAnswer: options[safeIdx],
      };
    }
    if (questionType === 'true_false') {
      return {
        payload: { options: ['درست', 'نادرست'] },
        correctAnswer: tfAnswer,
      };
    }
    if (questionType === 'pattern_puzzle') {
      const seq = patternSeq
        .split(/[،,]/)
        .map((x) => x.trim())
        .filter(Boolean);
      const options = [opt1, opt2, opt3, opt4].map((x) => x.trim()).filter(Boolean);
      if (seq.length < 3 || options.length < 2) {
        onError('برای بازی الگو، دنباله (شامل ؟) و حداقل ۲ گزینه لازم است.');
        return null;
      }
      const safeIdx = Math.min(correctIndex, options.length - 1);
      return {
        payload: { sequence: seq, options },
        correctAnswer: options[safeIdx],
      };
    }
    if (questionType === 'word_builder') {
      const clean = targetWord.trim();
      if (clean.length < 2) {
        onError('کلمه هدف باید حداقل ۲ حرف داشته باشد.');
        return null;
      }
      const chars = Array.from(clean);
      const shuffled = [...chars].reverse();
      return {
        payload: { letters: shuffled },
        correctAnswer: clean,
      };
    }
    if (questionType === 'order_numbers') {
      const ordered = orderList
        .split(/[،,]/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (ordered.length < 3) {
        onError('حداقل ۳ عدد به ترتیب درست (با ویرگول جداشده) وارد کنید.');
        return null;
      }
      const shuffled = [...ordered].sort((a, b) => b.localeCompare(a));
      return {
        payload: { items: shuffled },
        correctAnswer: ordered.join(','),
      };
    }
    if (questionType === 'spelling_fix') {
      if (!spellingSentence.trim() || !spellingWrong.trim() || !spellingRight.trim()) {
        onError('جمله، کلمه غلط و املای درست الزامی هستند.');
        return null;
      }
      return {
        payload: {
          sentence: spellingSentence.trim(),
          wrongWord: spellingWrong.trim(),
          options: [spellingRight.trim(), spellingWrong.trim(), `${spellingWrong.trim()}ـ`],
        },
        correctAnswer: spellingRight.trim(),
      };
    }
    if (questionType === 'match_pairs') {
      const pairs = [
        { left: pair1L.trim(), right: pair1R.trim() },
        { left: pair2L.trim(), right: pair2R.trim() },
        { left: pair3L.trim(), right: pair3R.trim() },
      ].filter((p) => p.left && p.right);
      if (pairs.length < 2) {
        onError('حداقل ۲ جفت برای اتصال وارد کنید.');
        return null;
      }
      return {
        payload: { pairs },
        correctAnswer: pairs.map((p) => `${p.left}=${p.right}`).join('|'),
      };
    }
    if (questionType === 'memory_cards') {
      const memoryPairs = [
        { a: pair1L.trim(), b: pair1R.trim() },
        { a: pair2L.trim(), b: pair2R.trim() },
        { a: pair3L.trim(), b: pair3R.trim() },
      ].filter((p) => p.a && p.b);
      if (memoryPairs.length < 2) {
        onError('حداقل ۲ جفت کارت برای بازی حافظه وارد کنید.');
        return null;
      }
      return {
        payload: { memoryPairs },
        correctAnswer: 'ALL_MATCHED',
      };
    }
    if (questionType === 'category_sort') {
      const b1 = bucket1.trim();
      const b2 = bucket2.trim();
      const items1 = sortB1Items
        .split(/[،,]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((label) => ({ label, bucket: b1 }));
      const items2 = sortB2Items
        .split(/[،,]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((label) => ({ label, bucket: b2 }));
      if (!b1 || !b2 || items1.length === 0 || items2.length === 0) {
        onError('نام هر دو سبد و حداقل یک مورد برای هر سبد را وارد کنید.');
        return null;
      }
      return {
        payload: { buckets: [b1, b2], sortItems: [...items1, ...items2] },
        correctAnswer: 'ALL_SORTED',
      };
    }
    // shape_lab
    const safeTotal = Math.max(2, Math.min(12, totalSlices));
    const safeTarget = Math.max(1, Math.min(safeTotal, targetSlices));
    return {
      payload: {
        totalSlices: safeTotal,
        targetSlices: safeTarget,
        shapeLabel: shapeLabel.trim() || `کسر ${formatPersianDigits(safeTarget)}/${formatPersianDigits(safeTotal)} را رنگ کن`,
      },
      correctAnswer: String(safeTarget),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) {
      onError('متن اصلی سؤال یا دستور بازی را وارد کنید.');
      return;
    }
    const built = buildPayloadAndAnswer();
    if (!built) return;

    setSubmitting(true);
    try {
      const targetClassId = selectedClassId ? Number(selectedClassId) : null;
      const effectivePublishNow = Boolean(targetClassId) || (isAdmin && publishNow);
      await apiFetch('/api/teacher/questions', {
        method: 'POST',
        body: JSON.stringify({
          classroomId: targetClassId,
          gradeId,
          bookId,
          chapterId: chapterId.trim() || 'فصل کلاسی',
          topicId: topicId.trim() || 'تمرین معلم',
          difficulty,
          learningObjective: `تثبیت مبحث ${topicId.trim() || 'درس'}`,
          storyIntro: storyIntro.trim() || 'مأموریت ویژه معلم کلاس برای قهرمانان!',
          hintText: hintText.trim() || 'صورت سؤال را با دقت بخوان.',
          questionType,
          promptText: promptText.trim(),
          imageDataUrl,
          payload: built.payload,
          correctAnswer: built.correctAnswer,
          explanation: explanation.trim() || 'پاسخ درست را با دقت مرور کن.',
          contentSource: isAdmin ? 'official_curriculum' : 'teacher',
          reviewStatus: effectivePublishNow ? 'approved' : 'pending_review',
        }),
      });
      soundEngine.playVictory();
      setPromptText('');
      setExplanation('');
      setImageDataUrl(null);
      setImageName(null);
      setOpt1('');
      setOpt2('');
      setOpt3('');
      setOpt4('');
      onCreated(
        targetClassId
          ? 'سؤال/بازی جدید ساخته شد و بلافاصله برای دانش‌آموزان کلاس منتشر گردید!'
          : effectivePublishNow
            ? 'سؤال/بازی جدید ساخته شد و بلافاصله در سرزمین پایه مربوطه منتشر گردید!'
            : 'سؤال/بازی جدید با وضعیت «در صف بررسی» ثبت شد و پس از تأیید مدیر کل در بازی دانش‌آموزان فعال می‌گردد.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'ثبت سؤال جدید با خطا مواجه شد.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5 text-amber-700" />
          <h3 className="text-base font-extrabold text-stone-900">
            {isAdmin
              ? 'افزودن دستی سؤال و بازی رسمی (با تصویر و ۱۱ سبک بازی)'
              : 'طراحی دستی سؤال و بازی توسط معلم (با تصویر و ۱۱ سبک بازی)'}
          </h3>
        </div>
        <span className="text-xs font-semibold text-stone-500">
          پشتیبانی از تصویر سؤال و انواع بازی‌های تعاملی (فقط چهارگزینه‌ای نیست!)
        </span>
      </div>

      {/* Row 1: Target Classroom (optional), Grade, Book, Game Type, Difficulty */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {classrooms.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">مخاطب / کلاس هدف</label>
            <select
              value={selectedClassId}
              onChange={(e) => {
                const nextId = e.target.value ? Number(e.target.value) : '';
                setSelectedClassId(nextId);
                if (nextId !== '') {
                  const cls = classrooms.find((c) => c.id === nextId);
                  if (cls) setGradeId(cls.gradeId);
                }
              }}
              className="w-full rounded-xl border border-teal-300 bg-teal-50/40 px-3 py-2.5 text-sm font-bold text-stone-900"
            >
              <option value="">عمومی پایه (صف تأیید مدیر)</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  کلاس {c.name} (انتشار مستقیم)
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-stone-700 mb-1">پایه تحصیلی</label>
          <select
            value={gradeId}
            disabled={selectedClassId !== ''}
            onChange={(e) => setGradeId(Number(e.target.value))}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold disabled:bg-stone-100"
          >
            {GRADES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-stone-700 mb-1">کتاب / سرزمین</label>
          <select
            value={bookId}
            onChange={(e) => setBookId(e.target.value as BookId)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold"
          >
            {REALMS.map((r) => (
              <option key={r.bookId} value={r.bookId}>
                {r.bookTitle} ({r.name})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-stone-700 mb-1">نوع بازی / قالب سؤال</label>
          <select
            value={questionType}
            onChange={(e) => setQuestionType(e.target.value as QuestionType)}
            className="w-full rounded-xl border border-amber-400 bg-amber-50/60 px-3 py-2.5 text-sm font-extrabold text-stone-900"
          >
            {ALL_GAME_TYPES.map((gt) => (
              <option key={gt} value={gt}>
                {QUESTION_TYPE_LABELS[gt]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-stone-700 mb-1">سطح دشواری</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-bold"
          >
            <option value="easy">آسان</option>
            <option value="medium">متوسط</option>
            <option value="challenge">چالشی</option>
          </select>
        </div>
      </div>

      {/* Row 2: Chapter, Topic, Story Intro */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input
          type="text"
          value={chapterId}
          onChange={(e) => setChapterId(e.target.value)}
          placeholder="فصل کتاب (مثلاً: فصل ۳)"
          className="rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
        />
        <input
          type="text"
          value={topicId}
          onChange={(e) => setTopicId(e.target.value)}
          placeholder="مبحث درس (مثلاً: کسرهای مساوی)"
          className="rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
        />
        <input
          type="text"
          value={storyIntro}
          onChange={(e) => setStoryIntro(e.target.value)}
          placeholder="مقدمه داستانی کوتاه مأموریت"
          className="rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
        />
      </div>

      {/* Prompt Text + Optional Question Image Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 space-y-3">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              صورت سؤال یا دستور بازی *
            </label>
            <textarea
              rows={2}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="متن سؤال را برای دانش‌آموز بنویسید..."
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={hintText}
              onChange={(e) => setHintText(e.target.value)}
              placeholder="متن راهنما (وقتی دانش‌آموز دکمه راهنما را بزند)"
              className="rounded-xl border border-stone-300 px-3.5 py-2 text-sm"
            />
            <input
              type="text"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="توضیح آموزشی پس از پاسخ"
              className="rounded-xl border border-stone-300 px-3.5 py-2 text-sm"
            />
          </div>
        </div>

        {/* Image Uploader */}
        <div className="lg:col-span-4 rounded-2xl border border-dashed border-stone-300 bg-[#FBF7EF] p-4 flex flex-col items-center justify-center text-center gap-2">
          {imageDataUrl ? (
            <>
              <img
                src={imageDataUrl}
                alt="پیش‌نمایش تصویر سؤال"
                className="max-h-28 w-auto rounded-lg border border-stone-200 object-contain"
              />
              <div className="flex items-center gap-2 text-xs">
                <span className="text-stone-600 truncate max-w-[140px]">{imageName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setImageDataUrl(null);
                    setImageName(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-1 font-bold text-rose-700 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  حذف
                </button>
              </div>
            </>
          ) : (
            <label className="cursor-pointer flex flex-col items-center gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <ImagePlus className="h-5 w-5" />
              </div>
              <span className="text-xs font-extrabold text-stone-800">
                افزودن تصویر به سؤال (اختیاری)
              </span>
              <span className="text-[11px] text-stone-500">JPG / PNG / WebP حداکثر ۱.۸ مگابایت</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Dynamic Game-Specific Inputs */}
      <div className="rounded-2xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 space-y-3">
        <p className="text-xs font-extrabold text-amber-900">
          تنظیمات اختصاصی بازی «{QUESTION_TYPE_LABELS[questionType]}»:
        </p>

        {(questionType === 'mcq' || questionType === 'fill_blank' || questionType === 'pattern_puzzle') && (
          <div className="space-y-3">
            {questionType === 'pattern_puzzle' && (
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  عناصر الگو (با ویرگول جدا کنید و جای مجهول را «؟» بگذارید)
                </label>
                <input
                  type="text"
                  value={patternSeq}
                  onChange={(e) => setPatternSeq(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm"
                />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                [opt1, setOpt1, 'گزینه ۱ *'],
                [opt2, setOpt2, 'گزینه ۲ *'],
                [opt3, setOpt3, 'گزینه ۳ (اختیاری)'],
                [opt4, setOpt4, 'گزینه ۴ (اختیاری)'],
              ].map(([val, setter, placeholder], idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctOpt"
                    checked={correctIndex === idx}
                    onChange={() => setCorrectIndex(idx)}
                    className="h-4 w-4 accent-emerald-700 cursor-pointer"
                    title="انتخاب به عنوان پاسخ صحیح"
                  />
                  <input
                    type="text"
                    value={val as string}
                    onChange={(e) => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                    placeholder={placeholder as string}
                    className="flex-1 rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-stone-500">دایره کنار گزینه صحیح را انتخاب کنید.</p>
          </div>
        )}

        {questionType === 'true_false' && (
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-stone-700">پاسخ صحیح:</span>
            {(['درست', 'نادرست'] as const).map((v) => (
              <label key={v} className="inline-flex items-center gap-1.5 text-sm font-bold cursor-pointer">
                <input
                  type="radio"
                  checked={tfAnswer === v}
                  onChange={() => setTfAnswer(v)}
                  className="accent-emerald-700"
                />
                {v}
              </label>
            ))}
          </div>
        )}

        {questionType === 'word_builder' && (
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              کلمه هدف (حروف به‌طور خودکار برای بازی کلمه‌سازی به هم ریخته می‌شوند)
            </label>
            <input
              type="text"
              value={targetWord}
              onChange={(e) => setTargetWord(e.target.value)}
              placeholder="مثلاً: کتابخانه"
              className="w-full sm:w-72 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm font-bold"
            />
          </div>
        )}

        {questionType === 'order_numbers' && (
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              عددها را به ترتیب درست (از کوچک به بزرگ) با ویرگول بنویسید
            </label>
            <input
              type="text"
              value={orderList}
              onChange={(e) => setOrderList(e.target.value)}
              placeholder="۱۲، ۲۵، ۴۸، ۷۰"
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm"
            />
          </div>
        )}

        {questionType === 'spelling_fix' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={spellingSentence}
              onChange={(e) => setSpellingSentence(e.target.value)}
              placeholder="جمله دارای یک غلط املایی"
              className="sm:col-span-3 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-sm"
            />
            <input
              type="text"
              value={spellingWrong}
              onChange={(e) => setSpellingWrong(e.target.value)}
              placeholder="کلمه غلط موجود در جمله"
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={spellingRight}
              onChange={(e) => setSpellingRight(e.target.value)}
              placeholder="املای صحیح کلمه"
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
            />
          </div>
        )}

        {(questionType === 'match_pairs' || questionType === 'memory_cards') && (
          <div className="space-y-2.5">
            <p className="text-xs text-stone-600">
              {questionType === 'memory_cards'
                ? '۳ جفت کارت هم‌معنی یا هم‌ارزش وارد کنید تا بازی حافظه ۶ کارتی ساخته شود:'
                : '۳ جفت متناظر ستون اول و دوم را وارد کنید:'}
            </p>
            {[
              [pair1L, setPair1L, pair1R, setPair1R, 'جفت ۱'],
              [pair2L, setPair2L, pair2R, setPair2R, 'جفت ۲'],
              [pair3L, setPair3L, pair3R, setPair3R, 'جفت ۳'],
            ].map(([l, setL, r, setR, lbl], idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={l as string}
                  onChange={(e) => (setL as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                  placeholder={`${lbl} - بخش اول`}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={r as string}
                  onChange={(e) => (setR as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                  placeholder={`${lbl} - بخش متناظر`}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
        )}

        {questionType === 'category_sort' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <input
                type="text"
                value={bucket1}
                onChange={(e) => setBucket1(e.target.value)}
                placeholder="نام سبد اول"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
              />
              <input
                type="text"
                value={sortB1Items}
                onChange={(e) => setSortB1Items(e.target.value)}
                placeholder="کارت‌های سبد اول (با ویرگول جدا کنید)"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={bucket2}
                onChange={(e) => setBucket2(e.target.value)}
                placeholder="نام سبد دوم"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
              />
              <input
                type="text"
                value={sortB2Items}
                onChange={(e) => setSortB2Items(e.target.value)}
                placeholder="کارت‌های سبد دوم (با ویرگول جدا کنید)"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {questionType === 'shape_lab' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">کل قسمت‌های دایره (۲ تا ۱۲)</label>
              <input
                type="number"
                min={2}
                max={12}
                value={totalSlices}
                onChange={(e) => setTotalSlices(Number(e.target.value))}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">تعداد قسمت درست جهت رنگ‌آمیزی</label>
              <input
                type="number"
                min={1}
                max={12}
                value={targetSlices}
                onChange={(e) => setTargetSlices(Number(e.target.value))}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">برچسب راهنمای شکل</label>
              <input
                type="text"
                value={shapeLabel}
                onChange={(e) => setShapeLabel(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer Submit */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {selectedClassId !== '' ? (
          <p className="text-xs font-semibold text-teal-800">
            این سؤال بلافاصله برای دانش‌آموزان کلاس منتخب منتشر می‌شود و پاسخ‌های آنان به شما برمی‌گردد.
          </p>
        ) : isAdmin ? (
          <label className="inline-flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={publishNow}
              onChange={(e) => setPublishNow(e.target.checked)}
              className="h-4 w-4 accent-emerald-700"
            />
            <span>انتشار مستقیم در سرزمین پایه انتخاب‌شده</span>
          </label>
        ) : (
          <p className="text-xs font-semibold text-amber-800">
            سؤال‌های عمومی با وضعیت «در صف بررسی» ثبت می‌شوند؛ اگر کلاس هدف را انتخاب کنید، بلافاصله در آن کلاس منتشر می‌شود.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 px-6 py-2.5 text-sm font-extrabold text-white cursor-pointer whitespace-nowrap"
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>{submitting ? 'در حال ثبت...' : 'ثبت سؤال / بازی دستی'}</span>
        </button>
      </div>
    </form>
  );
}
