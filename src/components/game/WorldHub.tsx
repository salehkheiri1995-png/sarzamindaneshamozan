import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AdaptivePracticeData,
  LeaderboardClassroom,
  MissionItem,
  StudentWorldData,
  TeacherVideoItem,
} from '../../types/game';
import { StudentProfile } from '../../context/AuthContext';
import {
  GRADES,
  REALMS,
  RealmId,
  WORLD_BACKDROP_URL,
  QUESTION_TYPE_LABELS,
  DIFFICULTY_LABELS,
  formatPersianDigits,
} from '../../shared/curriculum';
import {
  BadgeDefinition,
  getHeroLevel,
  normalizeDailyQuestState,
  toPersianDigits,
} from '../../shared/gamification';
import { HeroAvatarSvg } from './HeroAvatarSvg';
import { ConfettiBurst } from './ConfettiBurst';
import { BadgeShowcase } from './BadgeShowcase';
import { soundEngine } from '../../lib/sound';
import { apiFetch } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Compass,
  Play,
  CheckCircle2,
  Video,
  Bell,
  Coffee,
  ArrowRight,
  ExternalLink,
  Megaphone,
  GraduationCap,
  Lock,
  Link2,
  Flame,
  Sparkles,
  Trophy,
  Crown,
  Gift,
  Star,
  BookOpenCheck,
  ClipboardCheck,
  AlertCircle,
} from 'lucide-react';

interface WorldHubProps {
  world: StudentWorldData;
  isDemoMode?: boolean;
  onRefresh?: () => void;
  onSelectMission: (mission: MissionItem) => void;
  onGoToHomework?: () => void;
  onGoToExams?: () => void;
  onStudentUpdate?: (student: StudentProfile) => void;
  onBadgesUnlocked?: (badges: BadgeDefinition[]) => void;
}

export function WorldHub({
  world,
  isDemoMode = false,
  onRefresh,
  onSelectMission,
  onGoToHomework,
  onGoToExams,
  onStudentUpdate,
  onBadgesUnlocked,
}: WorldHubProps) {
  const { showToast } = useToast();
  const [selectedRealmId, setSelectedRealmId] = useState<RealmId | null>(null);
  const [activeVideo, setActiveVideo] = useState<TeacherVideoItem | null>(null);
  const [videoQuizChoice, setVideoQuizChoice] = useState<string | null>(null);
  const [videoQuizDone, setVideoQuizDone] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const [claimingQuest, setClaimingQuest] = useState(false);
  const [questConfetti, setQuestConfetti] = useState(false);
  const [adaptiveData, setAdaptiveData] = useState<AdaptivePracticeData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardClassroom[]>([]);

  const loadExtras = useCallback(async () => {
    if (isDemoMode || !world.student?.id) return;
    try {
      const [adapt, lb] = await Promise.all([
        apiFetch<AdaptivePracticeData>(`/api/students/${world.student.id}/adaptive-practice`),
        apiFetch<{ classrooms: LeaderboardClassroom[] }>(
          `/api/students/${world.student.id}/leaderboard`
        ),
      ]);
      setAdaptiveData(adapt);
      setLeaderboard(lb.classrooms || []);
    } catch {
      // silent fallback
    }
  }, [isDemoMode, world.student?.id]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras, world.attempts.length, world.enrollments.length]);

  const gradeInfo = GRADES.find((g) => g.id === world.student.gradeId) || GRADES[0];
  const recommendedMission = world.missions.find((m) => m.id === world.recommendedMissionId) || world.missions[0];
  const needsBreak = world.student.minutesUsedToday >= world.student.dailyLimitMinutes;
  const heroLevel = getHeroLevel(world.student.xp);
  const currentStreak = Math.max(1, world.student.currentStreak || world.student.streakDays || 1);
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const dailyQuest = normalizeDailyQuestState(world.student.dailyQuestProgress, todayStr);
  const questPct = Math.min(100, Math.round((dailyQuest.progress / Math.max(1, dailyQuest.target)) * 100));
  const earnedBadges: string[] = (() => {
    try {
      return JSON.parse(world.student.earnedBadges || '[]');
    } catch {
      return [];
    }
  })();

  const handleClaimDailyQuest = async () => {
    if (isDemoMode || claimingQuest || !dailyQuest.completed || dailyQuest.claimed) return;
    setClaimingQuest(true);
    try {
      const res = await apiFetch<{
        student: StudentProfile;
        newlyUnlockedBadges?: BadgeDefinition[];
        rewardCoins: number;
        rewardXp: number;
      }>(`/api/students/${world.student.id}/daily-quest/claim`, { method: 'POST' });
      soundEngine.playVictory();
      setQuestConfetti(true);
      setTimeout(() => setQuestConfetti(false), 1400);
      onStudentUpdate?.(res.student);
      if (res.newlyUnlockedBadges?.length) {
        onBadgesUnlocked?.(res.newlyUnlockedBadges);
      }
      showToast(
        `آفرین! جایزه چالش روزانه (+${toPersianDigits(res.rewardCoins)} سکه و +${toPersianDigits(res.rewardXp)} XP) به حسابت اضافه شد!`,
        'success'
      );
      onRefresh?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'دریافت جایزه چالش انجام نشد.', 'error');
    } finally {
      setClaimingQuest(false);
    }
  };

  const handleStudentJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode || !joinCode.trim()) return;
    setJoinLoading(true);
    setJoinFeedback(null);
    try {
      const res = await apiFetch<{ classroom: { name: string }; alreadyJoined: boolean }>(
        `/api/students/${world.student.id}/join-class`,
        {
          method: 'POST',
          body: JSON.stringify({ joinCode: joinCode.trim() }),
        }
      );
      soundEngine.playVictory();
      setJoinCode('');
      setJoinFeedback({
        ok: true,
        text: res.alreadyJoined
          ? `تو قبلاً عضو کلاس «${res.classroom.name}» هستی.`
          : `عالی! با موفقیت وارد کلاس «${res.classroom.name}» شدی.`,
      });
      onRefresh?.();
    } catch (err) {
      setJoinFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'عضویت در کلاس انجام نشد.',
      });
    } finally {
      setJoinLoading(false);
    }
  };

  const selectedRealm = selectedRealmId
    ? REALMS.find((r) => r.id === selectedRealmId) || null
    : null;

  const realmMissions = selectedRealm
    ? world.missions.filter((m) => m.realmId === selectedRealm.id)
    : [];

  const pendingHomeworks = world.homeworks.filter(
    (h) => !h.submission || h.submission.status === 'needs_revision'
  );
  const takenExamIds = new Set((world.examAttempts || []).map((a) => a.examId));
  const pendingExams = world.exams.filter((e) => !takenExamIds.has(e.id));
  const teacherMissions = world.missions.filter(
    (m) =>
      m.classroomId != null ||
      m.contentSource === 'teacher' ||
      m.contentSource === 'ai_generated'
  );
  const hasTeacherTasks =
    pendingHomeworks.length > 0 || pendingExams.length > 0 || teacherMissions.length > 0;

  // Realm Detail View
  if (selectedRealm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setSelectedRealmId(null);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 px-4 py-2 text-sm font-bold text-stone-800 cursor-pointer"
          >
            <ArrowRight className="h-4 w-4" />
            <span>بازگشت به نقشه کل سرزمین‌ها</span>
          </button>
          <span className="text-sm font-bold text-stone-600">
            محتوای رسمی {gradeInfo.title}
          </span>
        </div>

        {/* Realm Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-[#E5DAC5] bg-[#131B2E]">
          <img
            src={selectedRealm.imageUrl}
            alt={selectedRealm.name}
            referrerPolicy="no-referrer"
            className="h-56 sm:h-64 w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101828]/90 via-[#101828]/35 to-transparent flex flex-col justify-end p-6 sm:p-8">
            <p className="text-xs sm:text-sm font-semibold text-amber-200">
              {selectedRealm.bookTitle} · راهنما: {selectedRealm.guardianName}
            </p>
            <h2
              className="mt-1 text-3xl sm:text-4xl text-white"
              style={{ fontFamily: '"Lalezar", "Vazirmatn", sans-serif' }}
            >
              {selectedRealm.name}
            </h2>
            <p className="mt-1 text-sm text-amber-50/90 max-w-2xl">{selectedRealm.tagline}</p>
          </div>
        </div>

        {/* Grade-Locked Missions in this Realm */}
        <div className="space-y-3">
          <h3 className="text-lg font-extrabold text-stone-900">
            مأموریت‌های {selectedRealm.bookTitle} ویژه {gradeInfo.shortTitle} ({formatPersianDigits(realmMissions.length)} مأموریت)
          </h3>

          {realmMissions.length === 0 ? (
            <div className="rounded-2xl border border-[#E5DAC5] bg-white p-8 text-center text-sm text-stone-600">
              هنوز مأموریتی برای این درس در پایه انتخابی ثبت نشده است. معلمان می‌توانند از پنل معلم سؤال اضافه کنند.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {realmMissions.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-[#E5DAC5] bg-white p-5 flex flex-col justify-between gap-4 hover:border-amber-500 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-stone-500">
                      <span>{m.chapterId}</span>
                      <span>
                        {QUESTION_TYPE_LABELS[m.questionType]} · {DIFFICULTY_LABELS[m.difficulty]}
                      </span>
                    </div>
                    {(m.classroomId != null ||
                      m.contentSource === 'teacher' ||
                      m.contentSource === 'ai_generated') && (
                      <p className="text-[11px] font-bold text-teal-800 inline-flex items-center gap-1">
                        <GraduationCap className="h-3.5 w-3.5" />
                        <span>
                          سؤال معلم کلاس{m.classroomName ? ` (${m.classroomName})` : ''}
                        </span>
                      </p>
                    )}
                    <h4 className="text-base font-extrabold text-stone-900">{m.topicId}</h4>
                    <p className="text-sm text-stone-600 leading-relaxed">{m.storyIntro}</p>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#F1E8D8] pt-3">
                    {m.completed ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        تکمیل‌شده (قابل مرور مجدد)
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-amber-800">پاداش: +۲۵ سکه · +۴۰ امتیاز</span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        onSelectMission(m);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-bold text-white cursor-pointer whitespace-nowrap"
                    >
                      <Play className="h-4 w-4" />
                      <span>{m.completed ? 'مرور دوباره' : 'شروع مأموریت'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Global Announcements Banner */}
      {(world.globalAnnouncements || []).length > 0 && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 px-5 py-3.5 space-y-1.5">
          <p className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
            <Megaphone className="h-4 w-4 text-indigo-700" />
            <span>اطلاعیه مدیریت سامانه</span>
          </p>
          {world.globalAnnouncements.slice(0, 2).map((ga) => (
            <p key={ga.id} className="text-xs sm:text-sm font-semibold text-indigo-900">
              {ga.title ? `${ga.title}: ` : ''}
              {ga.message}
            </p>
          ))}
        </div>
      )}

      {/* Gentle Break Suggestion Banner when daily limit reached */}
      {needsBreak && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 flex items-center gap-3 text-sm font-bold text-amber-950">
          <Coffee className="h-5 w-5 text-amber-700 shrink-0" />
          <span>
            قهرمان عزیز، امروز به اندازه برنامه روزانه ({formatPersianDigits(world.student.dailyLimitMinutes)} دقیقه) تمرین کردی!
            پیشنهاد می‌کنیم چند دقیقه استراحت کنی، آب بنوشی و چشم‌هایت را تازه کنی.
          </span>
        </div>
      )}

      {/* Hero Level, Daily Streak & Daily Quest Strip */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 rounded-3xl border border-[#E5DAC5] bg-white p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <motion.div
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 2.2, repeat: Infinity }}
                >
                  <Flame className="h-6 w-6" />
                </motion.div>
              </div>
              <div>
                <p className="text-xs font-bold text-stone-500">استریک فعالیت پیوسته</p>
                <p className="tabular-nums text-lg font-extrabold text-stone-900">
                  {toPersianDigits(currentStreak)} روز متوالی
                </p>
              </div>
            </div>
            <div className="text-left">
              <span className="text-xs font-bold text-teal-800">
                سطح {toPersianDigits(heroLevel.level)}: {heroLevel.title}
              </span>
              <p className="tabular-nums text-[11px] text-stone-500">
                {toPersianDigits(heroLevel.xpToNext)} XP تا سطح بعدی
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-stone-600 tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                نوار پیشرفت تجربه (XP)
              </span>
              <span>
                {toPersianDigits(heroLevel.currentLevelXp)} / {toPersianDigits(heroLevel.xpPerLevel)}
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[#EFE6D5]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${heroLevel.progressPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-l from-amber-500 to-teal-600"
              />
            </div>
          </div>
        </div>

        <div className="relative lg:col-span-7 overflow-hidden rounded-3xl border border-amber-300 bg-gradient-to-l from-amber-50/90 via-white to-[#FBF7EF] p-5 flex flex-col justify-between gap-4">
          <ConfettiBurst active={questConfetti} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-stone-950 shadow-xs">
                <Gift className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-amber-800">چالش روزانه امروز</p>
                <h3 className="text-base font-extrabold text-stone-900">{dailyQuest.title}</h3>
                <p className="mt-0.5 text-xs text-stone-600">{dailyQuest.description}</p>
              </div>
            </div>

            {!isDemoMode && (
              <button
                type="button"
                disabled={!dailyQuest.completed || dailyQuest.claimed || claimingQuest}
                onClick={handleClaimDailyQuest}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-2xl px-4 py-2.5 text-xs font-extrabold transition ${
                  dailyQuest.claimed
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                    : dailyQuest.completed
                      ? 'bg-amber-500 text-stone-950 shadow-md hover:bg-amber-400 animate-pulse cursor-pointer'
                      : 'bg-[#EFE6D5] text-stone-500 cursor-not-allowed'
                }`}
              >
                <Gift className="h-4 w-4" />
                {dailyQuest.claimed
                  ? 'جایزه امروز دریافت شد ✓'
                  : claimingQuest
                    ? 'در حال ثبت...'
                    : 'دریافت جایزه (۵۰ سکه + ۱۰۰ XP)'}
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-stone-700 tabular-nums">
              <span>پیشرفت چالش امروز</span>
              <span>
                {toPersianDigits(dailyQuest.progress)} از {toPersianDigits(dailyQuest.target)} مأموریت
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[#EFE6D5]">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${questPct}%` }}
                transition={{ duration: 0.55 }}
                className="h-full rounded-full bg-gradient-to-l from-emerald-500 to-amber-500"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Teacher Class Tasks: Pending / Revision Homeworks, Unattempted Exams & Teacher Questions */}
      {hasTeacherTasks && (
        <section className="rounded-3xl border border-teal-200 bg-white p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 border border-teal-100">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-stone-900">
                  برنامه، تکالیف، آزمون‌ها و سؤالات معلم کلاس
                </h2>
                <p className="text-xs text-stone-600">
                  موارد ارسال‌شده توسط معلم را همین‌جا انجام بده؛ پاسخ‌های تو بلافاصله برای معلم ارسال می‌شوند.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-teal-800 tabular-nums">
              {toPersianDigits(pendingHomeworks.length + pendingExams.length + teacherMissions.filter((m) => !m.completed).length)}{' '}
              مورد در انتظار پاسخ
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {pendingHomeworks.map((hw) => {
              const needsRev = hw.submission?.status === 'needs_revision';
              return (
                <div
                  key={`hw-${hw.id}`}
                  className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${
                    needsRev
                      ? 'border-amber-400 bg-amber-50/50'
                      : 'border-[#EFE6D5] bg-[#FBF7EF]'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                      <span className={needsRev ? 'text-amber-800 inline-flex items-center gap-1' : 'text-teal-800 inline-flex items-center gap-1'}>
                        {needsRev ? (
                          <>
                            <AlertCircle className="h-3.5 w-3.5" />
                            نیازمند اصلاح و ارسال مجدد
                          </>
                        ) : (
                          <>
                            <BookOpenCheck className="h-3.5 w-3.5" />
                            تکلیف معلم
                          </>
                        )}
                      </span>
                      <span className="text-stone-500 tabular-nums">مهلت: {hw.dueDate}</span>
                    </div>
                    <p className="text-sm font-extrabold text-stone-900 line-clamp-1">{hw.title}</p>
                    <p className="text-xs text-stone-600 line-clamp-1">
                      {hw.classroomName ? `کلاس ${hw.classroomName} · ` : ''}
                      {toPersianDigits(hw.questions.length)} تمرین
                    </p>
                    {needsRev && hw.submission?.teacherFeedback && (
                      <p className="text-[11px] font-semibold text-amber-900 line-clamp-2">
                        بازخورد معلم: {hw.submission.teacherFeedback}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onGoToHomework?.()}
                    className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
                  >
                    {needsRev ? 'اصلاح و ارسال مجدد' : 'شروع مأموریت تکلیف'}
                  </button>
                </div>
              );
            })}

            {pendingExams.map((ex) => (
              <div
                key={`exam-${ex.id}`}
                className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-indigo-800">
                    <span className="inline-flex items-center gap-1">
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      آزمون در انتظار شرکت
                    </span>
                    <span className="text-stone-500 tabular-nums">
                      {toPersianDigits(ex.durationMinutes)} دقیقه
                    </span>
                  </div>
                  <p className="text-sm font-extrabold text-stone-900 line-clamp-1">{ex.title}</p>
                  <p className="text-xs text-stone-600 tabular-nums">
                    {ex.classroomName ? `کلاس ${ex.classroomName} · ` : ''}
                    {toPersianDigits(ex.questions.length)} سؤال · بارم {toPersianDigits(ex.maxScore)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onGoToExams?.()}
                  className="w-full rounded-xl bg-indigo-700 hover:bg-indigo-800 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
                >
                  شرکت در آزمون
                </button>
              </div>
            ))}

            {teacherMissions.map((m) => (
              <div
                key={`tm-${m.id}`}
                className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
                    <span className="text-amber-900 inline-flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5" />
                      سؤال معلم{m.classroomName ? ` · ${m.classroomName}` : ''}
                    </span>
                    {m.completed ? (
                      <span className="text-emerald-700 inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        پاسخ داده شده
                      </span>
                    ) : (
                      <span className="text-amber-800">در انتظار پاسخ</span>
                    )}
                  </div>
                  <p className="text-sm font-extrabold text-stone-900 line-clamp-1">{m.topicId}</p>
                  <p className="text-xs text-stone-700 line-clamp-2">{m.promptText}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onSelectMission(m);
                  }}
                  className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 px-3.5 py-2 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
                >
                  {m.completed ? 'مرور دوباره' : 'پاسخ به سؤال معلم'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Smart Anti-Repetition Recommended Next Mission Strip */}
      {recommendedMission && (
        <section className="rounded-3xl border border-[#E5DAC5] bg-white p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <HeroAvatarSvg
              heroClass={world.student.heroClass}
              equippedOutfit={world.student.equippedOutfit}
              equippedPet={world.student.equippedPet}
              avatarColor={world.student.avatarColor}
              size={76}
              className="shrink-0"
            />
            <div>
              <p className="text-xs font-bold text-teal-800">
                پیشنهاد هوشمند امروز (ضدتکرار) · {gradeInfo.title}
              </p>
              <h2 className="mt-0.5 text-lg sm:text-xl font-extrabold text-stone-900">
                {recommendedMission.topicId} — {QUESTION_TYPE_LABELS[recommendedMission.questionType]}
              </h2>
              <p className="mt-1 text-sm text-stone-600">{recommendedMission.storyIntro}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              onSelectMission(recommendedMission);
            }}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 hover:bg-amber-700 px-6 py-3.5 text-base font-extrabold text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Compass className="h-5 w-5" />
            <span>شروع مأموریت پیشنهادی</span>
          </button>
        </section>
      )}

      {/* Adaptive Smart Practice Mode Card */}
      {!isDemoMode && adaptiveData && adaptiveData.missions.length > 0 && (
        <section className="rounded-3xl border border-indigo-200 bg-gradient-to-l from-indigo-50/70 via-white to-teal-50/50 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-xs">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-stone-900">
                  تمرین هوشمند اختصاصی تو
                </h3>
                <p className="text-xs text-stone-600 mt-0.5">
                  {adaptiveData.weakTopics.length > 0
                    ? `چند مأموریت هدفمند روی مباحث نیازمند تمرین (${adaptiveData.weakTopics.join('، ')}) برایت چیدیم:`
                    : 'سؤال‌های منتخب پایه تحصیلی تو برای تسلط و مرور بیشتر آماده شده‌اند:'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                onSelectMission(adaptiveData.missions[0]);
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-700 cursor-pointer"
            >
              <Play className="h-4 w-4" />
              شروع تمرین هوشمند
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {adaptiveData.missions.slice(0, 3).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onSelectMission(m);
                }}
                className="rounded-2xl border border-indigo-100 bg-white p-3.5 text-right hover:border-indigo-400 transition cursor-pointer"
              >
                <p className="text-[11px] font-bold text-indigo-700">{m.chapterId}</p>
                <p className="mt-1 text-xs font-extrabold text-stone-900 line-clamp-1">
                  {m.topicId}
                </p>
                <p className="mt-1 text-[11px] text-stone-500 line-clamp-1">{m.promptText}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Interactive Illustrated World Map */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-stone-900">
            نقشه ماجراجویی ۵ سرزمین ({gradeInfo.title})
          </h2>
          <span className="text-xs font-semibold text-stone-500">
            روی هر سرزمین در نقشه یا کارت‌های زیر کلیک کن تا وارد درس‌های آن شوی
          </span>
        </div>

        <div className="relative overflow-hidden rounded-3xl border-2 border-[#D8C7A8] bg-[#131B2E]">
          <img
            src={WORLD_BACKDROP_URL}
            alt="نقشه تعاملی سرزمین دانش‌آموزان قهرمان"
            referrerPolicy="no-referrer"
            className="w-full h-[300px] sm:h-[420px] object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#101828]/55 via-transparent to-[#101828]/20 pointer-events-none" />

          {/* Interactive Realm Map Pins */}
          {REALMS.map((realm) => {
            const countInRealm = world.missions.filter((m) => m.realmId === realm.id).length;
            const doneInRealm = world.missions.filter(
              (m) => m.realmId === realm.id && m.completed
            ).length;
            return (
              <button
                key={realm.id}
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setSelectedRealmId(realm.id);
                }}
                style={{
                  left: `${realm.mapPos.x}%`,
                  top: `${realm.mapPos.y}%`,
                }}
                className="absolute -translate-x-1/2 -translate-y-1/2 group flex flex-col items-center cursor-pointer focus:outline-none"
              >
                <span className="rounded-xl border-2 border-amber-200 bg-[#131B2E]/90 group-hover:bg-amber-500 group-hover:text-stone-950 px-3 py-1.5 text-xs sm:text-sm font-extrabold text-amber-50 shadow-lg transition-transform duration-150 group-hover:scale-105 whitespace-nowrap">
                  {realm.name}
                  <span className="mr-1.5 opacity-80 tabular-nums">
                    ({formatPersianDigits(doneInRealm)}/{formatPersianDigits(countInRealm)})
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Five Illustrated Realm Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {REALMS.map((realm) => {
          const realmList = world.missions.filter((m) => m.realmId === realm.id);
          const done = realmList.filter((m) => m.completed).length;
          return (
            <button
              key={realm.id}
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setSelectedRealmId(realm.id);
              }}
              className="group overflow-hidden rounded-2xl border border-[#E5DAC5] bg-white text-right hover:border-amber-500 transition-all duration-150 flex flex-col cursor-pointer"
            >
              <div className="relative h-40 w-full overflow-hidden bg-stone-200">
                <img
                  src={realm.imageUrl}
                  alt={realm.name}
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-transparent to-transparent" />
                <div className="absolute bottom-3 right-4 left-4 flex items-end justify-between text-white">
                  <span
                    className="text-2xl leading-none"
                    style={{ fontFamily: '"Lalezar", "Vazirmatn", sans-serif' }}
                  >
                    {realm.name}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-amber-200">
                    {formatPersianDigits(done)} از {formatPersianDigits(realmList.length)}
                  </span>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between gap-2">
                <p className="text-xs font-bold text-teal-800">{realm.bookTitle}</p>
                <p className="text-sm text-stone-600 leading-relaxed">{realm.tagline}</p>
              </div>
            </button>
          );
        })}
      </section>

      {/* My Classes & Parental-Controlled Classroom Join */}
      {!isDemoMode && (
        <section className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-teal-700" />
              <span>کلاس‌های من و عضویت با کد</span>
            </h3>
          </div>

          {world.student.allowClassJoin === false ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs sm:text-sm font-bold text-amber-950 flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-700 shrink-0" />
              <span>عضویت در کلاس توسط والدین محدود شده است.</span>
            </div>
          ) : (
            <form onSubmit={handleStudentJoinClass} className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Link2 className="h-4 w-4 text-stone-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="کد کلاس معلم را وارد کن (مثلاً HR3-A1B2)"
                  className="w-full rounded-xl border border-stone-300 pr-9 pl-3 py-2 text-sm font-mono uppercase"
                />
              </div>
              <button
                type="submit"
                disabled={joinLoading}
                className="rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-60 px-5 py-2 text-sm font-bold text-white cursor-pointer"
              >
                {joinLoading ? 'در حال عضویت...' : 'عضویت در کلاس'}
              </button>
            </form>
          )}

          {joinFeedback && (
            <p
              className={`text-xs font-bold ${
                joinFeedback.ok ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {joinFeedback.text}
            </p>
          )}

          {world.enrollments.length === 0 ? (
            <p className="text-xs text-stone-500">
              هنوز عضو کلاسی نشده‌ای. پس از دریافت کد از معلم می‌توانی وارد کلاس شوی.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {world.enrollments.map((en) => (
                <div
                  key={en.enrollmentId}
                  className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-stone-900">{en.classroomName}</span>
                    <span
                      className={`font-extrabold ${
                        en.isActive === false ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {en.isActive === false ? 'بسته‌شده' : 'فعال'}
                    </span>
                  </div>
                  <p className="text-stone-600">
                    معلم: {en.teacherName || 'معلم کلاس'} · پایه {formatPersianDigits(en.gradeId)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Safe Classroom Leaderboard (Only nickname, heroClass, avatar, xp, rank — zero PII) */}
      {!isDemoMode && leaderboard.length > 0 && (
        <section className="space-y-4">
          {leaderboard.map((clsLb) => {
            const top3 = clsLb.rankings.slice(0, 3);
            return (
              <div
                key={clsLb.classroomId}
                className="rounded-3xl border border-[#E5DAC5] bg-white p-6 space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-600" />
                    <h3 className="text-lg font-extrabold text-stone-900">
                      جدول قهرمانان کلاس «{clsLb.classroomName}»
                    </h3>
                  </div>
                  <span className="text-xs font-semibold text-stone-500">
                    رتبه‌بندی دوستانه بر اساس امتیاز تجربه (XP)
                  </span>
                </div>

                {/* Top 3 Podium */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {top3.map((entry) => {
                    const medalStyle =
                      entry.rank === 1
                        ? 'border-amber-300 bg-amber-50/90 text-amber-800'
                        : entry.rank === 2
                          ? 'border-stone-300 bg-stone-50 text-stone-700'
                          : 'border-orange-200 bg-orange-50/70 text-orange-800';
                    return (
                      <div
                        key={`${clsLb.classroomId}-${entry.rank}`}
                        className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${medalStyle} ${
                          entry.isSelf ? 'ring-2 ring-teal-500' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white font-extrabold text-sm shadow-xs"
                            style={{ backgroundColor: entry.avatarColor }}
                          >
                            {toPersianDigits(entry.rank)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-stone-900 truncate">
                              {entry.nickname} {entry.isSelf ? '(تو)' : ''}
                            </p>
                            <p className="tabular-nums text-xs font-bold opacity-80">
                              {toPersianDigits(entry.xp)} XP
                            </p>
                          </div>
                        </div>
                        <Crown className="h-5 w-5 shrink-0" />
                      </div>
                    );
                  })}
                </div>

                {/* Remaining Ranks */}
                {clsLb.rankings.length > 3 && (
                  <div className="space-y-1.5">
                    {clsLb.rankings.slice(3, 10).map((entry) => (
                      <div
                        key={`${clsLb.classroomId}-row-${entry.rank}`}
                        className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-xs ${
                          entry.isSelf
                            ? 'border-teal-400 bg-teal-50 font-extrabold text-teal-950'
                            : 'border-[#EFE6D5] bg-[#FBF7EF]/60 font-semibold text-stone-700'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="tabular-nums w-6 text-center font-extrabold">
                            #{toPersianDigits(entry.rank)}
                          </span>
                          <span
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: entry.avatarColor }}
                          />
                          <span>
                            {entry.nickname} {entry.isSelf ? '(تو)' : ''}
                          </span>
                        </div>
                        <span className="tabular-nums font-extrabold">
                          {toPersianDigits(entry.xp)} XP
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Compact Trophy Shelf */}
      <BadgeShowcase earnedIds={earnedBadges} compact title="نشان‌ها و افتخارات من" />

      {/* Teacher Videos & Classroom Safe Announcements (Always Visible Section) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Teacher Videos */}
        <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
          <h3 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
            <Video className="h-5 w-5 text-teal-700" />
            <span>ویدیوهای آموزشی کلاس</span>
          </h3>
          {world.videos.length === 0 ? (
            <p className="text-sm text-stone-500">هنوز فیلم آموزشی در کلاس‌های تو منتشر نشده است.</p>
          ) : (
            <div className="space-y-3">
              {world.videos.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-extrabold text-stone-900">{v.title}</p>
                    <p className="text-xs text-stone-600">
                      {v.classroomName ? `${v.classroomName} · ` : ''}
                      {v.chapterId} · مدت {v.durationLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveVideo(v);
                      setVideoQuizChoice(null);
                      setVideoQuizDone(false);
                    }}
                    className="rounded-xl bg-teal-700 hover:bg-teal-800 px-3.5 py-2 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                  >
                    مشاهده و پرسش
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Safe One-Way Classroom Announcements */}
        <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
          <h3 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-600" />
            <span>اطلاعیه‌های کلاس و پیام معلم</span>
          </h3>
          {world.announcements.length === 0 ? (
            <p className="text-sm text-stone-500">پیام جدیدی از کلاس ثبت نشده است.</p>
          ) : (
            <div className="space-y-3">
              {world.announcements.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-[#EFE6D5] bg-[#FBF7EF] p-3.5 text-sm text-stone-800"
                >
                  <p className="text-xs font-bold text-amber-800">
                    معلم {a.senderName}
                    {a.classroomName ? ` (${a.classroomName})` : ''}
                    {a.scheduledDate ? ` · تاریخ: ${a.scheduledDate}` : ''}
                  </p>
                  <p className="mt-1">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Teacher Video Viewer + Follow-up Comprehension Check Modal (Ad-Free!) */}
      {activeVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-[#E5DAC5] bg-white p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-teal-800">{activeVideo.chapterId}</p>
                <h3 className="text-lg font-extrabold text-stone-900">{activeVideo.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveVideo(null)}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 cursor-pointer"
              >
                بستن
              </button>
            </div>

            <p className="text-sm text-stone-600">{activeVideo.description}</p>

            <div className="rounded-2xl border border-stone-200 bg-[#FBF7EF] p-4 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-stone-700 truncate">
                لینک فیلم آموزشی معلم: {activeVideo.videoUrl}
              </span>
              <a
                href={activeVideo.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 px-3.5 py-2 text-xs font-bold text-white shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>باز کردن فیلم</span>
              </a>
            </div>

            {/* Post-Video Comprehension Question */}
            <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 space-y-3">
              <p className="text-xs font-bold text-teal-900">سؤال سنجش یادگیری پس از تماشای فیلم:</p>
              <p className="text-sm font-extrabold text-stone-900">
                {activeVideo.followUpQuestion.promptText}
              </p>
              <div className="space-y-2">
                {activeVideo.followUpQuestion.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setVideoQuizChoice(opt);
                      setVideoQuizDone(true);
                      if (opt === activeVideo.followUpQuestion.correctAnswer) {
                        soundEngine.playCorrect();
                      } else {
                        soundEngine.playWrong();
                      }
                    }}
                    className={`w-full rounded-xl border-2 px-4 py-2.5 text-right text-sm font-bold cursor-pointer ${
                      videoQuizChoice === opt
                        ? opt === activeVideo.followUpQuestion.correctAnswer
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                          : 'border-rose-500 bg-rose-50 text-rose-950'
                        : 'border-stone-200 bg-white text-stone-800 hover:border-teal-500'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {videoQuizDone && (
                <p className="text-xs font-bold text-emerald-800">
                  پاسخ درست: {activeVideo.followUpQuestion.correctAnswer}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
