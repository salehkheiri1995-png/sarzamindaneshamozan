import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { MissionItem } from '../../types/game';
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_LABELS,
  REALMS,
  formatPersianDigits,
} from '../../shared/curriculum';
import { soundEngine } from '../../lib/sound';
import { apiFetch } from '../../lib/api';
import { ConfettiBurst } from './ConfettiBurst';
import {
  ArrowRight,
  Lightbulb,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Award,
  HelpCircle,
} from 'lucide-react';

const PRAISE_MESSAGES = [
  'آفرین قهرمان! معرکه بودی و مأموریت را کامل فتح کردی!',
  'فوق‌العاده! هوش و دقت تو این مرحله را مثل برق حل کرد!',
  'درخشان بودی! یک ستاره طلایی دیگر به افتخارات تو اضافه شد!',
  'عالی عمل کردی! همین‌طور پرانرژی به پیش برو!',
];

const ENCOURAGE_MESSAGES = [
  'تلاش عالی بود! اشتباه کردن یعنی داری چیز تازه‌ای یاد می‌گیری.',
  'خیلی نزدیک بودی! بیا با هم نکته درستش را مرور کنیم و دوباره امتحان کن.',
  'آفرین به پشتکارت! یک نگاه به راهنما بنداز و دوباره بزن.',
];

interface MissionPlayerProps {
  mission: MissionItem;
  gradeId: number;
  isDemoMode: boolean;
  onComplete: (result: { isCorrect: boolean; durationSeconds: number; studentAnswer: string }) => void;
  onExit: () => void;
  onNextMission?: () => void;
}

interface MemoryCard {
  id: string;
  pairIndex: number;
  text: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function buildWedgePath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

export function MissionPlayer({
  mission,
  gradeId,
  isDemoMode,
  onComplete,
  onExit,
  onNextMission,
}: MissionPlayerProps) {
  const realm = REALMS.find((r) => r.id === mission.realmId) || REALMS[0];
  const [startTime, setStartTime] = useState(() => Date.now());
  const [showHint, setShowHint] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [studentAnswerText, setStudentAnswerText] = useState('');

  // Standard interactive states
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [builtIndices, setBuiltIndices] = useState<number[]>([]);
  const [orderedItems, setOrderedItems] = useState<string[]>([]);
  const [spellingClickedWrong, setSpellingClickedWrong] = useState(false);

  // Match Pairs state
  const pairs = useMemo(() => mission.payload.pairs || [], [mission.payload.pairs]);
  const shuffledRight = useMemo(() => {
    const arr = pairs.map((p) => p.right);
    return [...arr].sort((a, b) => ((a.length * 7 + mission.id) % 5) - ((b.length * 3 + mission.id) % 5));
  }, [pairs, mission.id]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({});

  // Memory Cards game state
  const memoryCards: MemoryCard[] = useMemo(() => {
    const rawPairs = mission.payload.memoryPairs || [];
    const cards: MemoryCard[] = [];
    rawPairs.forEach((p, idx) => {
      cards.push({ id: `a_${idx}`, pairIndex: idx, text: p.a });
      cards.push({ id: `b_${idx}`, pairIndex: idx, text: p.b });
    });
    return cards.sort(
      (x, y) =>
        ((x.text.length * 13 + x.pairIndex * 5 + mission.id) % 11) -
        ((y.text.length * 7 + y.pairIndex * 3 + mission.id) % 11)
    );
  }, [mission.payload.memoryPairs, mission.id]);
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [matchedCardIds, setMatchedCardIds] = useState<string[]>([]);
  const [memoryLocked, setMemoryLocked] = useState(false);

  // Category Sort game state
  const buckets = useMemo(() => mission.payload.buckets || ['دسته ۱', 'دسته ۲'], [mission.payload.buckets]);
  const sortItems = useMemo(() => mission.payload.sortItems || [], [mission.payload.sortItems]);
  const [selectedSortItem, setSelectedSortItem] = useState<string | null>(null);
  const [sortedAssignments, setSortedAssignments] = useState<Record<string, string>>({});

  // Shape Lab (Interactive SVG Fraction / Geometry Slices)
  const totalSlices = Math.max(2, Math.min(12, Number(mission.payload.totalSlices) || 4));
  const [selectedSlices, setSelectedSlices] = useState<number[]>([]);

  // AI Tutor Explanation state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Reset when mission changes
  useEffect(() => {
    setStartTime(Date.now());
    setShowHint(false);
    setSubmitted(false);
    setIsCorrect(false);
    setSelectedOption(null);
    setBuiltIndices([]);
    setOrderedItems([]);
    setSpellingClickedWrong(false);
    setSelectedLeft(null);
    setMatchedPairs({});
    setFlippedIds([]);
    setMatchedCardIds([]);
    setMemoryLocked(false);
    setSelectedSortItem(null);
    setSortedAssignments({});
    setSelectedSlices([]);
    setAiExplanation(null);
    setAiError(null);
  }, [mission.id]);

  // Keyboard shortcuts: 1-4 for options, Esc to exit
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onExit();
        return;
      }
      if (submitted) return;
      const options = mission.payload.options || mission.payload.choices;
      if (
        options &&
        (mission.questionType === 'mcq' ||
          mission.questionType === 'true_false' ||
          mission.questionType === 'fill_blank' ||
          mission.questionType === 'pattern_puzzle')
      ) {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < options.length) {
          soundEngine.playClick();
          setSelectedOption(options[idx]);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mission, submitted, onExit]);

  const evaluateAnswer = (answerStr: string) => {
    const normalizedExpected = mission.correctAnswer.trim();
    const normalizedGot = answerStr.trim();
    const correct = normalizedGot === normalizedExpected;
    const durationSeconds = Math.max(2, Math.round((Date.now() - startTime) / 1000));

    setStudentAnswerText(normalizedGot);
    setIsCorrect(correct);
    setSubmitted(true);

    if (correct) {
      soundEngine.playCorrect();
    } else {
      soundEngine.playWrong();
    }

    onComplete({ isCorrect: correct, durationSeconds, studentAnswer: normalizedGot });
  };

  const handleFlipMemoryCard = (card: MemoryCard) => {
    if (submitted || memoryLocked) return;
    if (flippedIds.includes(card.id) || matchedCardIds.includes(card.id)) return;

    soundEngine.playClick();
    const nextFlipped = [...flippedIds, card.id];
    setFlippedIds(nextFlipped);

    if (nextFlipped.length === 2) {
      const first = memoryCards.find((c) => c.id === nextFlipped[0]);
      const second = memoryCards.find((c) => c.id === nextFlipped[1]);
      if (first && second && first.pairIndex === second.pairIndex) {
        soundEngine.playCoin();
        const nextMatched = [...matchedCardIds, first.id, second.id];
        setMatchedCardIds(nextMatched);
        setFlippedIds([]);
        if (nextMatched.length === memoryCards.length && memoryCards.length > 0) {
          window.setTimeout(() => evaluateAnswer('ALL_MATCHED'), 280);
        }
      } else {
        setMemoryLocked(true);
        window.setTimeout(() => {
          setFlippedIds([]);
          setMemoryLocked(false);
        }, 680);
      }
    }
  };

  const handleSubmitCurrent = () => {
    if (submitted) return;

    if (
      mission.questionType === 'mcq' ||
      mission.questionType === 'true_false' ||
      mission.questionType === 'fill_blank' ||
      mission.questionType === 'pattern_puzzle' ||
      mission.questionType === 'spelling_fix'
    ) {
      if (!selectedOption) return;
      evaluateAnswer(selectedOption);
    } else if (mission.questionType === 'word_builder') {
      const letters = mission.payload.letters || [];
      const built = builtIndices.map((i) => letters[i]).join('');
      if (!built) return;
      evaluateAnswer(built);
    } else if (mission.questionType === 'order_numbers') {
      if (orderedItems.length !== (mission.payload.items?.length || 0)) return;
      evaluateAnswer(orderedItems.join(','));
    } else if (mission.questionType === 'match_pairs') {
      if (Object.keys(matchedPairs).length !== pairs.length) return;
      const canonical = pairs.map((p) => `${p.left}=${matchedPairs[p.left] || ''}`).join('|');
      evaluateAnswer(canonical);
    } else if (mission.questionType === 'category_sort') {
      if (Object.keys(sortedAssignments).length !== sortItems.length) return;
      const allRight = sortItems.every((item) => sortedAssignments[item.label] === item.bucket);
      evaluateAnswer(allRight ? 'ALL_SORTED' : 'INCORRECT_SORT');
    } else if (mission.questionType === 'shape_lab') {
      evaluateAnswer(String(selectedSlices.length));
    } else if (mission.questionType === 'memory_cards') {
      if (matchedCardIds.length === memoryCards.length && memoryCards.length > 0) {
        evaluateAnswer('ALL_MATCHED');
      }
    }
  };

  const handleAskAiTutor = async () => {
    if (isDemoMode) {
      setAiError('برای استفاده از معلم هوشمند، لطفاً وارد حساب کاربری خود شوید.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch<{ explanation: string }>('/api/ai/explain', {
        method: 'POST',
        body: JSON.stringify({
          gradeId,
          bookId: mission.bookId,
          promptText: mission.promptText,
          studentAnswer: studentAnswerText || 'بدون پاسخ',
          correctAnswer: mission.correctAnswer,
        }),
      });
      setAiExplanation(res.explanation);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'دریافت توضیح هوشمند ممکن نشد.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleRetry = () => {
    soundEngine.playClick();
    setSubmitted(false);
    setIsCorrect(false);
    setSelectedOption(null);
    setBuiltIndices([]);
    setOrderedItems([]);
    setMatchedPairs({});
    setSelectedLeft(null);
    setFlippedIds([]);
    setMatchedCardIds([]);
    setMemoryLocked(false);
    setSelectedSortItem(null);
    setSortedAssignments({});
    setSelectedSlices([]);
    setAiExplanation(null);
  };

  const canSubmit = (() => {
    if (submitted) return false;
    switch (mission.questionType) {
      case 'word_builder':
        return builtIndices.length === (mission.payload.letters?.length || 0);
      case 'order_numbers':
        return orderedItems.length === (mission.payload.items?.length || 0);
      case 'match_pairs':
        return Object.keys(matchedPairs).length === pairs.length;
      case 'category_sort':
        return sortItems.length > 0 && Object.keys(sortedAssignments).length === sortItems.length;
      case 'shape_lab':
        return selectedSlices.length > 0;
      case 'memory_cards':
        return memoryCards.length > 0 && matchedCardIds.length === memoryCards.length;
      default:
        return Boolean(selectedOption);
    }
  })();

  return (
    <div className="min-h-screen bg-[#FBF7EF] flex flex-col">
      {/* Clean Ad-Free Mission Top HUD */}
      <header className="border-b border-[#E5DAC5] bg-white px-4 sm:px-8 py-3.5">
        <div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              onExit();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 px-3.5 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50 cursor-pointer whitespace-nowrap"
          >
            <ArrowRight className="h-4 w-4" />
            <span>بازگشت به {realm.name}</span>
          </button>

          <div className="text-xs sm:text-sm font-semibold text-stone-600 truncate">
            <span>{realm.bookTitle}</span>
            <span className="mx-1.5 text-stone-300">·</span>
            <span>{mission.chapterId}</span>
            <span className="mx-1.5 text-stone-300">·</span>
            <span>سطح {DIFFICULTY_LABELS[mission.difficulty]}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setShowHint((prev) => !prev);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 px-3.5 py-2 text-sm font-bold text-amber-950 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Lightbulb className="h-4 w-4 text-amber-700" />
            <span>راهنما</span>
          </button>
        </div>
      </header>

      {/* Main Playfield — Zero Ads, High Focus */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        <motion.section
          key={mission.id}
          animate={
            submitted && !isCorrect
              ? { x: [0, -8, 8, -5, 5, 0] }
              : submitted && isCorrect
                ? { scale: [1, 1.01, 1] }
                : { x: 0, scale: 1 }
          }
          transition={{ duration: 0.42 }}
          className="relative rounded-2xl border border-[#E5DAC5] bg-white p-5 sm:p-7"
        >
          <ConfettiBurst active={submitted && isCorrect} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-stone-500">
            <span>{QUESTION_TYPE_LABELS[mission.questionType] || mission.questionType}</span>
            <span>هدف آموزشی: {mission.learningObjective}</span>
          </div>

          <p className="mt-3 text-sm sm:text-base font-medium text-teal-900 bg-[#F0FDFA] border border-teal-100 rounded-xl px-4 py-3">
            {mission.storyIntro}
          </p>

          {/* Optional Teacher-Uploaded Question Illustration */}
          {mission.imageDataUrl && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-[#E5DAC5] bg-[#FBF7EF] p-2 flex justify-center">
              <img
                src={mission.imageDataUrl}
                alt="تصویر راهنمای سؤال"
                referrerPolicy="no-referrer"
                className="max-h-64 w-auto rounded-xl object-contain"
              />
            </div>
          )}

          <h2 className="mt-5 text-xl sm:text-2xl font-extrabold text-stone-900 leading-relaxed">
            {mission.promptText}
          </h2>

          {showHint && (
            <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-950 flex items-start gap-2.5">
              <HelpCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
              <span>راهنمای {realm.guardianName}: {mission.hintText}</span>
            </div>
          )}

          {/* ================= 11 INTERACTIVE MINI-GAME BOARDS ================= */}
          <div className="mt-6">
            {/* 1. MCQ / True-False / Fill-Blank */}
            {(mission.questionType === 'mcq' ||
              mission.questionType === 'true_false' ||
              mission.questionType === 'fill_blank') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {(mission.payload.options || mission.payload.choices || []).map((opt, idx) => {
                  const chosen = selectedOption === opt;
                  const showRight = submitted && opt === mission.correctAnswer;
                  const showWrong = submitted && chosen && !isCorrect;
                  return (
                    <button
                      key={`${opt}-${idx}`}
                      type="button"
                      disabled={submitted}
                      onClick={() => {
                        soundEngine.playClick();
                        setSelectedOption(opt);
                      }}
                      className={`min-h-[58px] rounded-2xl border-2 px-5 py-3.5 text-right font-bold text-base transition-all duration-150 flex items-center justify-between gap-3 cursor-pointer ${
                        showRight
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                          : showWrong
                            ? 'border-rose-500 bg-rose-50 text-rose-950'
                            : chosen
                              ? 'border-amber-600 bg-amber-50 text-stone-950 scale-[1.01]'
                              : 'border-[#E5DAC5] bg-[#FBF7EF]/60 text-stone-800 hover:border-amber-400 hover:bg-amber-50/40'
                      }`}
                    >
                      <span>{opt}</span>
                      <span className="text-xs font-bold text-stone-400 tabular-nums">
                        {formatPersianDigits(idx + 1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 2. Pattern Puzzle */}
            {mission.questionType === 'pattern_puzzle' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-[#FBF7EF] border border-[#E5DAC5] p-5">
                  {(mission.payload.sequence || []).map((item, idx) => (
                    <div
                      key={`${item}-${idx}`}
                      className={`min-w-[56px] h-14 px-4 rounded-xl flex items-center justify-center text-xl font-extrabold tabular-nums border-2 ${
                        item === '؟'
                          ? 'border-amber-600 bg-amber-100 text-amber-950'
                          : 'border-stone-300 bg-white text-stone-900'
                      }`}
                    >
                      {item === '؟' && selectedOption ? selectedOption : item}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(mission.payload.options || []).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={submitted}
                      onClick={() => {
                        soundEngine.playClick();
                        setSelectedOption(opt);
                      }}
                      className={`min-h-[54px] rounded-xl border-2 text-lg font-extrabold tabular-nums transition-colors cursor-pointer ${
                        selectedOption === opt
                          ? 'border-amber-600 bg-amber-100 text-stone-950'
                          : 'border-[#E5DAC5] bg-white text-stone-800 hover:border-amber-400'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Word Builder */}
            {mission.questionType === 'word_builder' && (
              <div className="space-y-5">
                <div className="min-h-[76px] rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50/40 p-4 flex items-center justify-center gap-2.5 flex-wrap">
                  {builtIndices.length === 0 ? (
                    <span className="text-sm font-medium text-stone-500">
                      حروف زیر را به ترتیب درست لمس کن تا کلمه ساخته شود
                    </span>
                  ) : (
                    builtIndices.map((letterIdx, pos) => (
                      <button
                        key={`${letterIdx}-${pos}`}
                        type="button"
                        disabled={submitted}
                        onClick={() => {
                          soundEngine.playClick();
                          setBuiltIndices((prev) => prev.filter((_, i) => i !== pos));
                        }}
                        className="h-14 min-w-[54px] rounded-xl bg-amber-600 text-white text-2xl font-extrabold shadow-sm cursor-pointer"
                      >
                        {(mission.payload.letters || [])[letterIdx]}
                      </button>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {(mission.payload.letters || []).map((letter, idx) => {
                    const used = builtIndices.includes(idx);
                    return (
                      <button
                        key={`${letter}-${idx}`}
                        type="button"
                        disabled={submitted || used}
                        onClick={() => {
                          soundEngine.playClick();
                          setBuiltIndices((prev) => [...prev, idx]);
                        }}
                        className={`h-14 min-w-[56px] rounded-xl border-2 text-2xl font-extrabold transition-all cursor-pointer ${
                          used
                            ? 'border-stone-200 bg-stone-100 text-stone-300'
                            : 'border-emerald-600 bg-white text-emerald-950 hover:bg-emerald-50'
                        }`}
                      >
                        {letter}
                      </button>
                    );
                  })}
                  {builtIndices.length > 0 && !submitted && (
                    <button
                      type="button"
                      onClick={() => setBuiltIndices([])}
                      className="inline-flex items-center gap-1 rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>پاک کردن</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 4. Order Numbers */}
            {mission.questionType === 'order_numbers' && (
              <div className="space-y-5">
                <div className="min-h-[76px] rounded-2xl border-2 border-dashed border-teal-500 bg-teal-50/40 p-4 flex items-center justify-center gap-3 flex-wrap">
                  {orderedItems.length === 0 ? (
                    <span className="text-sm font-medium text-stone-500">
                      عددها را به ترتیب درست انتخاب کن
                    </span>
                  ) : (
                    orderedItems.map((val, i) => (
                      <button
                        key={`${val}-${i}`}
                        type="button"
                        disabled={submitted}
                        onClick={() => {
                          soundEngine.playClick();
                          setOrderedItems((prev) => prev.filter((_, idx) => idx !== i));
                        }}
                        className="min-w-[68px] h-14 px-4 rounded-xl bg-teal-700 text-white text-xl font-extrabold tabular-nums cursor-pointer"
                      >
                        {val}
                      </button>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {(mission.payload.items || []).map((val) => {
                    const used = orderedItems.includes(val);
                    return (
                      <button
                        key={val}
                        type="button"
                        disabled={submitted || used}
                        onClick={() => {
                          soundEngine.playClick();
                          setOrderedItems((prev) => [...prev, val]);
                        }}
                        className={`min-w-[74px] h-14 px-5 rounded-xl border-2 text-xl font-extrabold tabular-nums transition-colors cursor-pointer ${
                          used
                            ? 'border-stone-200 bg-stone-100 text-stone-300'
                            : 'border-amber-600 bg-white text-stone-900 hover:bg-amber-50'
                        }`}
                      >
                        {val}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5. Spelling Fix */}
            {mission.questionType === 'spelling_fix' && (
              <div className="space-y-5">
                <div className="rounded-2xl bg-[#FBF7EF] border border-[#E5DAC5] p-5 flex flex-wrap items-center gap-2.5 text-lg sm:text-xl leading-loose">
                  {(mission.payload.sentence || '').split(' ').map((word, idx) => {
                    const cleanWord = word.replace(/[.,،؟!]/g, '');
                    const isTarget = cleanWord === mission.payload.wrongWord;
                    return (
                      <button
                        key={`${word}-${idx}`}
                        type="button"
                        disabled={submitted}
                        onClick={() => {
                          soundEngine.playClick();
                          if (isTarget) setSpellingClickedWrong(true);
                        }}
                        className={`rounded-xl px-3 py-1.5 font-bold transition-colors cursor-pointer ${
                          isTarget && spellingClickedWrong
                            ? 'bg-amber-200 text-stone-950 ring-2 ring-amber-600'
                            : 'bg-white border border-stone-200 text-stone-800 hover:border-amber-500'
                        }`}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>

                {!spellingClickedWrong ? (
                  <p className="text-sm font-semibold text-amber-800">
                    مرحله ۱: روی کلمه‌ای که غلط املایی دارد در جمله بالا کلیک کن.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-emerald-800">
                      آفرین! کلمه «{mission.payload.wrongWord}» را پیدا کردی. حالا املای درست آن را انتخاب کن:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {(mission.payload.options || []).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={submitted}
                          onClick={() => {
                            soundEngine.playClick();
                            setSelectedOption(opt);
                          }}
                          className={`min-h-[54px] rounded-xl border-2 text-lg font-extrabold cursor-pointer ${
                            selectedOption === opt
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                              : 'border-[#E5DAC5] bg-white text-stone-800 hover:border-emerald-400'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 6. Match Pairs */}
            {mission.questionType === 'match_pairs' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-stone-500">ستون اول (ابتدا انتخاب کن)</p>
                  {pairs.map((p) => {
                    const active = selectedLeft === p.left;
                    const paired = Boolean(matchedPairs[p.left]);
                    return (
                      <button
                        key={p.left}
                        type="button"
                        disabled={submitted}
                        onClick={() => {
                          soundEngine.playClick();
                          setSelectedLeft(p.left);
                        }}
                        className={`w-full min-h-[54px] rounded-xl border-2 px-4 py-3 text-right font-bold flex items-center justify-between gap-2 cursor-pointer ${
                          active
                            ? 'border-amber-600 bg-amber-50 text-stone-950'
                            : paired
                              ? 'border-teal-600 bg-teal-50/70 text-teal-950'
                              : 'border-[#E5DAC5] bg-white text-stone-800 hover:border-amber-400'
                        }`}
                      >
                        <span>{p.left}</span>
                        {paired && (
                          <span className="text-xs font-semibold text-teal-800">
                            ← {matchedPairs[p.left]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2.5">
                  <p className="text-xs font-bold text-stone-500">ستون دوم (جفت مناسب را بزن)</p>
                  {shuffledRight.map((rightText) => {
                    const alreadyUsed = Object.values(matchedPairs).includes(rightText);
                    return (
                      <button
                        key={rightText}
                        type="button"
                        disabled={submitted || !selectedLeft}
                        onClick={() => {
                          if (!selectedLeft) return;
                          soundEngine.playClick();
                          setMatchedPairs((prev) => ({ ...prev, [selectedLeft]: rightText }));
                          setSelectedLeft(null);
                        }}
                        className={`w-full min-h-[54px] rounded-xl border-2 px-4 py-3 text-right font-bold transition-colors cursor-pointer ${
                          alreadyUsed
                            ? 'border-teal-200 bg-teal-50/30 text-stone-500'
                            : selectedLeft
                              ? 'border-amber-400 bg-white text-stone-900 hover:bg-amber-50'
                              : 'border-[#E5DAC5] bg-stone-50 text-stone-600'
                        }`}
                      >
                        {rightText}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 7. Memory Cards (Flip & Match Educational Pairs) */}
            {mission.questionType === 'memory_cards' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-bold text-stone-600">
                  <span>هر بار دو کارت را برگردان تا جفت‌های هم‌معنی یا هم‌ارزش را پیدا کنی</span>
                  <span className="tabular-nums text-teal-800">
                    جفت‌های پیداشده: {formatPersianDigits(matchedCardIds.length / 2)} از{' '}
                    {formatPersianDigits(memoryCards.length / 2)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                  {memoryCards.map((card) => {
                    const isMatched = matchedCardIds.includes(card.id);
                    const isFaceUp = isMatched || flippedIds.includes(card.id) || submitted;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        disabled={submitted || isMatched}
                        onClick={() => handleFlipMemoryCard(card)}
                        className={`min-h-[88px] rounded-2xl border-2 px-4 py-4 text-center font-extrabold text-base sm:text-lg transition-all duration-150 cursor-pointer flex items-center justify-center ${
                          isMatched
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-950 scale-[0.99]'
                            : isFaceUp
                              ? 'border-amber-600 bg-amber-50 text-stone-950'
                              : 'border-[#2E3C5C] bg-[#131B2E] text-amber-300 hover:bg-[#1E293B]'
                        }`}
                      >
                        {isFaceUp ? (
                          <span>{card.text}</span>
                        ) : (
                          <span className="text-2xl select-none">★</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 8. Category Sort (Interactive 2-Basket Sorting Game) */}
            {mission.questionType === 'category_sort' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-stone-600">
                    مرحله ۱: یک کارت را انتخاب کن و سپس روی سبد مناسب آن کلیک کن:
                  </p>
                  <div className="flex flex-wrap gap-2.5 min-h-[56px] rounded-2xl border border-dashed border-stone-300 bg-[#FBF7EF] p-3.5">
                    {sortItems
                      .filter((item) => !sortedAssignments[item.label])
                      .map((item) => {
                        const active = selectedSortItem === item.label;
                        return (
                          <button
                            key={item.label}
                            type="button"
                            disabled={submitted}
                            onClick={() => {
                              soundEngine.playClick();
                              setSelectedSortItem(item.label);
                            }}
                            className={`min-h-[48px] rounded-xl border-2 px-4 py-2 text-sm font-extrabold transition-all cursor-pointer ${
                              active
                                ? 'border-amber-600 bg-amber-500 text-stone-950 scale-[1.03]'
                                : 'border-stone-300 bg-white text-stone-800 hover:border-amber-400'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    {sortItems.every((item) => Boolean(sortedAssignments[item.label])) && (
                      <span className="text-xs font-bold text-emerald-800 self-center">
                        همه کارت‌ها در سبدها قرار گرفتند! اکنون دکمه ثبت پاسخ را بزن.
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {buckets.map((bucketName) => {
                    const placed = sortItems.filter((i) => sortedAssignments[i.label] === bucketName);
                    return (
                      <div
                        key={bucketName}
                        onClick={() => {
                          if (!submitted && selectedSortItem) {
                            soundEngine.playClick();
                            setSortedAssignments((prev) => ({
                              ...prev,
                              [selectedSortItem]: bucketName,
                            }));
                            setSelectedSortItem(null);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && !submitted && selectedSortItem) {
                            e.preventDefault();
                            soundEngine.playClick();
                            setSortedAssignments((prev) => ({
                              ...prev,
                              [selectedSortItem]: bucketName,
                            }));
                            setSelectedSortItem(null);
                          }
                        }}
                        className={`min-h-[132px] rounded-2xl border-2 p-4 transition-colors cursor-pointer ${
                          selectedSortItem
                            ? 'border-teal-600 bg-teal-50/60 hover:bg-teal-50'
                            : 'border-[#E5DAC5] bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-[#EFE6D5] pb-2 mb-3">
                          <span className="text-sm font-extrabold text-stone-900">{bucketName}</span>
                          <span className="text-xs font-bold text-teal-800 tabular-nums">
                            {formatPersianDigits(placed.length)} مورد
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {placed.map((item) => (
                            <button
                              key={item.label}
                              type="button"
                              disabled={submitted}
                              onClick={(e) => {
                                e.stopPropagation();
                                soundEngine.playClick();
                                setSortedAssignments((prev) => {
                                  const next = { ...prev };
                                  delete next[item.label];
                                  return next;
                                });
                              }}
                              className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                            >
                              {item.label} ×
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 9. Shape Lab (Interactive SVG Segmented Fraction Circle) */}
            {mission.questionType === 'shape_lab' && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-8 rounded-2xl border border-[#E5DAC5] bg-[#FBF7EF] p-6">
                <svg
                  width="220"
                  height="220"
                  viewBox="0 0 220 220"
                  className="shrink-0 select-none"
                  aria-label="آزمایشگاه کسر و شکل"
                >
                  {Array.from({ length: totalSlices }).map((_, idx) => {
                    const step = 360 / totalSlices;
                    const startAngle = idx * step;
                    const endAngle = (idx + 1) * step;
                    const active = selectedSlices.includes(idx);
                    return (
                      <path
                        key={idx}
                        d={buildWedgePath(110, 110, 96, startAngle, endAngle)}
                        fill={active ? '#F59E0B' : '#FFFFFF'}
                        stroke="#1E293B"
                        strokeWidth="2.5"
                        className="cursor-pointer transition-colors duration-150 hover:opacity-90"
                        onClick={() => {
                          if (submitted) return;
                          soundEngine.playClick();
                          setSelectedSlices((prev) =>
                            prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]
                          );
                        }}
                      />
                    );
                  })}
                  <circle cx="110" cy="110" r="10" fill="#1E293B" />
                </svg>

                <div className="space-y-3 text-center sm:text-right">
                  <p className="text-sm font-bold text-stone-700">
                    {mission.payload.shapeLabel || 'روی بخش‌های شکل کلیک کن تا رنگ شوند'}
                  </p>
                  <div className="inline-flex items-center gap-3 rounded-2xl border border-amber-300 bg-white px-5 py-3">
                    <span className="text-xs font-bold text-stone-500">کسر رنگ‌شده:</span>
                    <span className="text-2xl font-extrabold text-amber-700 tabular-nums">
                      {formatPersianDigits(selectedSlices.length)} / {formatPersianDigits(totalSlices)}
                    </span>
                  </div>
                  {selectedSlices.length > 0 && !submitted && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setSelectedSlices([])}
                        className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>پاک کردن رنگ‌ها</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Submit CTA (hidden for memory_cards since completing all pairs auto-submits) */}
          {!submitted && mission.questionType !== 'memory_cards' && (
            <div className="mt-7 flex items-center justify-end">
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSubmitCurrent}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-stone-300 disabled:text-stone-500 px-8 py-3.5 text-base font-extrabold text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                ثبت پاسخ مأموریت
              </button>
            </div>
          )}
        </motion.section>

        {/* Immediate Feedback, Reward & AI Tutor Explanation */}
        {submitted && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={`rounded-2xl border p-6 space-y-4 ${
              isCorrect
                ? 'border-emerald-300 bg-emerald-50/70'
                : 'border-amber-300 bg-amber-50/80'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {isCorrect ? (
                  <CheckCircle2 className="h-8 w-8 text-emerald-700 shrink-0" />
                ) : (
                  <Award className="h-8 w-8 text-amber-700 shrink-0" />
                )}
                <div>
                  <h3 className="text-lg font-extrabold text-stone-900">
                    {isCorrect
                      ? PRAISE_MESSAGES[mission.id % PRAISE_MESSAGES.length]
                      : ENCOURAGE_MESSAGES[mission.id % ENCOURAGE_MESSAGES.length]}
                  </h3>
                  <p className="text-sm font-semibold text-stone-700 tabular-nums">
                    {isCorrect
                      ? 'پاداش تو: +۲۵ سکه طلا و +۴۰ امتیاز تجربه'
                      : 'پاداش تلاش: +۵ سکه تشویقی (هیچ امتیازی کم نمی‌شود!)'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                {!isCorrect && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-400 bg-white hover:bg-stone-50 px-4 py-2.5 text-sm font-bold text-stone-800 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>تلاش دوباره</span>
                  </button>
                )}
                {onNextMission && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      onNextMission();
                    }}
                    className="rounded-xl bg-teal-700 hover:bg-teal-800 px-5 py-2.5 text-sm font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    مأموریت بعدی
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-white border border-stone-200 p-4 text-sm sm:text-base text-stone-800 leading-relaxed">
              <span className="font-bold text-stone-950">توضیح پاسخ صحیح: </span>
              {mission.explanation}
            </div>

            {/* Server-side Gemini Educational Tutor Helper */}
            <div className="pt-1">
              {!aiExplanation && (
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleAskAiTutor}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors cursor-pointer ${
                    !isCorrect
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                      : 'border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-900'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {aiLoading
                      ? 'معلم هوشمند در حال آماده کردن توضیح ساده...'
                      : !isCorrect
                        ? 'چرا اشتباه شد؟ (توضیح معلم هوشمند)'
                        : 'توضیح بیشتر و مثال تازه از معلم هوشمند'}
                  </span>
                </button>
              )}
              {aiError && <p className="mt-2 text-xs font-medium text-rose-700">{aiError}</p>}
              {aiExplanation && (
                <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm text-indigo-950 leading-relaxed">
                  <p className="font-bold mb-1">راهنمای معلم هوشمند:</p>
                  <p className="whitespace-pre-line">{aiExplanation}</p>
                </div>
              )}
            </div>
          </motion.section>
        )}
      </main>
    </div>
  );
}
