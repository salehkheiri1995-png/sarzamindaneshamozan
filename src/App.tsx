import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, SessionRole, StudentProfile, useAuth } from './context/AuthContext';
import { TitleScreen } from './components/game/TitleScreen';
import { LoginPortalModal } from './components/auth/LoginPortalModal';
import { StudentOnboarding } from './components/game/StudentOnboarding';
import { WorldHub } from './components/game/WorldHub';
import { MissionPlayer } from './components/game/MissionPlayer';
import { HomeworkNotebook } from './components/game/HomeworkNotebook';
import { ExamCenter } from './components/game/ExamCenter';
import { HeroCastleShop } from './components/game/HeroCastleShop';
import { ParentPanel } from './components/panels/ParentPanel';
import { TeacherPanel } from './components/panels/TeacherPanel';
import { AdminPanel } from './components/panels/AdminPanel';
import { HeroAvatarSvg } from './components/game/HeroAvatarSvg';
import { apiFetch } from './lib/api';
import { soundEngine } from './lib/sound';
import {
  GRADES,
  OFFICIAL_SEED_MISSIONS,
  formatPersianDigits,
} from './shared/curriculum';
import { MissionItem, StudentWorldData } from './types/game';
import {
  Map,
  BookOpenCheck,
  ClipboardCheck,
  Castle,
  Users,
  GraduationCap,
  ShieldCheck,
  Volume2,
  VolumeX,
  LogOut,
  LogIn,
  Coins,
  Star,
  Home,
  Clock,
  Coffee,
} from 'lucide-react';

type ShellMode =
  | 'TITLE_MENU'
  | 'ONBOARDING'
  | 'STUDENT_WORLD'
  | 'ACTIVE_MISSION'
  | 'PARENT_PANEL'
  | 'TEACHER_PANEL'
  | 'ADMIN_PANEL';

type StudentSubTab = 'map' | 'homework' | 'exams' | 'castle';

function buildDemoWorld(gradeId: number): StudentWorldData {
  const gradeMissions: MissionItem[] = OFFICIAL_SEED_MISSIONS.filter((m) => m.gradeId === gradeId).map(
    (m, idx) => ({
      id: gradeId * 100 + idx + 1,
      gradeId: m.gradeId,
      bookId: m.bookId,
      realmId: m.realmId,
      chapterId: m.chapterId,
      topicId: m.topicId,
      academicYear: '1404-1405',
      difficulty: m.difficulty,
      learningObjective: m.learningObjective,
      storyIntro: m.storyIntro,
      hintText: m.hintText,
      questionType: m.questionType,
      promptText: m.promptText,
      imageDataUrl: null,
      payload: m.payload as MissionItem['payload'],
      correctAnswer: m.correctAnswer,
      explanation: m.explanation,
      contentSource: 'official_curriculum',
      reviewStatus: 'approved',
      completed: false,
    })
  );

  const examQuestions = gradeMissions
    .filter((m) => ['mcq', 'true_false', 'fill_blank', 'pattern_puzzle'].includes(m.questionType))
    .map((m, i) => ({
      id: `demo_q_${i}`,
      topicId: m.topicId,
      bookId: m.bookId,
      promptText: m.promptText,
      options: m.payload.options || m.payload.choices || ['درست', 'نادرست'],
      correctAnswer: m.correctAnswer,
      explanation: m.explanation,
    }));

  const gradeInfo = GRADES.find((g) => g.id === gradeId) || GRADES[2];

  return {
    student: {
      id: 0,
      parentUid: 'demo',
      nickname: 'قهرمان مهمان',
      username: null,
      hasPassword: false,
      gradeId,
      academicYear: '1404-1405',
      age: gradeId + 6,
      heroClass: 'explorer',
      avatarColor: '#D97706',
      equippedOutfit: 'cloak_default',
      equippedPet: 'none',
      castleDecor: '["banner_star"]',
      ownedItems: '["cloak_default","banner_star"]',
      coins: 150,
      xp: 40,
      streakDays: 1,
      dailyLimitMinutes: 45,
      minutesUsedToday: 5,
      allowOptionalAds: true,
      allowClassJoin: true,
      lastGameType: null,
    },
    missions: gradeMissions,
    recommendedMissionId: gradeMissions[0]?.id ?? null,
    attempts: [],
    enrollments: [],
    homeworks: [
      {
        id: 999,
        classroomId: null,
        creatorRole: 'teacher',
        gradeId,
        bookId: 'math',
        chapterId: 'فصل جاری',
        topicId: 'تکلیف نمونه کلاس',
        title: `تکلیف روزانه نمونه ${gradeInfo.shortTitle}`,
        description: 'نمونه تبدیل تکلیف مدرسه به مأموریت بازی در شهر اعداد',
        dueDate: '۱۴۰۴/۰۹/۱۰',
        attachmentName: null,
        submission: null,
        questions: examQuestions.slice(0, 2).map((q) => ({
          promptText: q.promptText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
        })),
      },
    ],
    exams: [
      {
        id: 888,
        classroomId: null,
        gradeId,
        bookId: 'math',
        examType: 'placement',
        title: `آزمون تعیین سطح بدون تبلیغ ${gradeInfo.title}`,
        durationMinutes: 10,
        maxScore: 20,
        difficulty: 'medium',
        questions: examQuestions,
      },
    ],
    examAttempts: [],
    videos: [],
    announcements: [],
    globalAnnouncements: [],
    rewardedChestsToday: 0,
  };
}

function HeroLandApp() {
  const {
    isAuthenticated,
    sessionRole,
    dbUser,
    students,
    activeStudent,
    loading,
    authError,
    signOut,
    refreshProfile,
    setActiveStudentId,
    updateLocalStudent,
  } = useAuth();

  const [mode, setMode] = useState<ShellMode>('TITLE_MENU');
  const [subTab, setSubTab] = useState<StudentSubTab>('map');
  const [muted, setMuted] = useState(false);
  const [loginModalPortal, setLoginModalPortal] = useState<SessionRole | null>(null);

  const [worldData, setWorldData] = useState<StudentWorldData | null>(null);
  const [worldLoading, setWorldLoading] = useState(false);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [activeMission, setActiveMission] = useState<MissionItem | null>(null);

  const [isDemoMode, setIsDemoMode] = useState(false);

  const loadStudentWorld = useCallback(async (studentId: number) => {
    setWorldLoading(true);
    setWorldError(null);
    try {
      const data = await apiFetch<StudentWorldData>(`/api/students/${studentId}/world`);
      setWorldData(data);
    } catch (err) {
      setWorldError(err instanceof Error ? err.message : 'بارگذاری دنیای بازی ناموفق بود.');
    } finally {
      setWorldLoading(false);
    }
  }, []);

  // Load active student's world for Student sessions OR Parent viewing child reports
  useEffect(() => {
    if (
      isAuthenticated &&
      (sessionRole === 'student' || sessionRole === 'parent') &&
      activeStudent &&
      !isDemoMode
    ) {
      loadStudentWorld(activeStudent.id);
    }
  }, [isAuthenticated, sessionRole, activeStudent, isDemoMode, loadStudentWorld]);

  // Real live daily usage timer (ticks every 60s for active authenticated student sessions)
  useEffect(() => {
    if (
      !isAuthenticated ||
      isDemoMode ||
      sessionRole !== 'student' ||
      (mode !== 'STUDENT_WORLD' && mode !== 'ACTIVE_MISSION') ||
      !worldData?.student
    ) {
      return;
    }
    if (worldData.student.minutesUsedToday >= worldData.student.dailyLimitMinutes) {
      return;
    }
    const studentId = worldData.student.id;
    const intervalId = window.setInterval(async () => {
      try {
        const res = await apiFetch<{ student: StudentProfile }>(
          `/api/students/${studentId}/session-tick`,
          { method: 'POST' }
        );
        updateLocalStudent(res.student);
        setWorldData((prev) => (prev ? { ...prev, student: res.student } : prev));
      } catch {
        // Silent retry on next minute tick
      }
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [
    isAuthenticated,
    isDemoMode,
    sessionRole,
    mode,
    worldData?.student?.id,
    worldData?.student?.minutesUsedToday,
    worldData?.student?.dailyLimitMinutes,
    updateLocalStudent,
  ]);

  // Strict Role Guard: force user back into their own role's workspace if state drifts
  useEffect(() => {
    if (!isAuthenticated || !sessionRole || isDemoMode || mode === 'TITLE_MENU') return;
    if (sessionRole === 'student' && mode !== 'STUDENT_WORLD' && mode !== 'ACTIVE_MISSION') {
      setMode('STUDENT_WORLD');
    } else if (sessionRole === 'parent' && mode !== 'PARENT_PANEL' && mode !== 'ONBOARDING') {
      setMode('PARENT_PANEL');
    } else if (sessionRole === 'teacher' && mode !== 'TEACHER_PANEL') {
      setMode('TEACHER_PANEL');
    } else if (sessionRole === 'admin' && mode !== 'ADMIN_PANEL') {
      setMode('ADMIN_PANEL');
    }
  }, [isAuthenticated, sessionRole, isDemoMode, mode]);

  const handleToggleMute = () => {
    const next = soundEngine.toggleMute();
    setMuted(next);
  };

  const navigateForRole = (role: SessionRole, _studentCount: number) => {
    setIsDemoMode(false);
    if (role === 'student') {
      setMode('STUDENT_WORLD');
      setSubTab('map');
    } else if (role === 'parent') {
      setMode('PARENT_PANEL');
    } else if (role === 'teacher') {
      setMode('TEACHER_PANEL');
    } else if (role === 'admin') {
      setMode('ADMIN_PANEL');
    }
  };

  const handleEnterDemo = (gradeId: number) => {
    setIsDemoMode(true);
    setWorldData(buildDemoWorld(gradeId));
    setMode('STUDENT_WORLD');
    setSubTab('map');
  };

  const handleMissionCompleted = async (result: { isCorrect: boolean; durationSeconds: number }) => {
    if (!activeMission || !worldData) return;
    if (isDemoMode) {
      const coinsEarned = result.isCorrect ? 25 : 5;
      const xpEarned = result.isCorrect ? 40 : 10;
      setWorldData((prev) => {
        if (!prev) return prev;
        const updatedMissions = prev.missions.map((m) =>
          m.id === activeMission.id && result.isCorrect ? { ...m, completed: true } : m
        );
        const nextRec =
          updatedMissions.find((m) => !m.completed && m.questionType !== activeMission.questionType) ||
          updatedMissions.find((m) => !m.completed) ||
          updatedMissions[0];
        return {
          ...prev,
          student: {
            ...prev.student,
            coins: prev.student.coins + coinsEarned,
            xp: prev.student.xp + xpEarned,
            lastGameType: activeMission.questionType,
          },
          missions: updatedMissions,
          recommendedMissionId: nextRec?.id ?? null,
        };
      });
      return;
    }

    try {
      const res = await apiFetch<{ student: StudentProfile }>(
        `/api/students/${worldData.student.id}/attempts`,
        {
          method: 'POST',
          body: JSON.stringify({
            contentId: activeMission.id,
            bookId: activeMission.bookId,
            topicId: activeMission.topicId,
            questionType: activeMission.questionType,
            isCorrect: result.isCorrect,
            durationSeconds: result.durationSeconds,
          }),
        }
      );
      updateLocalStudent(res.student);
      loadStudentWorld(worldData.student.id);
    } catch (err) {
      console.error('Failed to record mission attempt:', err);
    }
  };

  const handleNextMission = () => {
    if (!worldData || !activeMission) return;
    const next =
      worldData.missions.find(
        (m) => m.id !== activeMission.id && !m.completed && m.questionType !== activeMission.questionType
      ) ||
      worldData.missions.find((m) => m.id !== activeMission.id) ||
      activeMission;
    setActiveMission(next);
  };

  const handleSignOut = async () => {
    await signOut();
    setIsDemoMode(false);
    setWorldData(null);
    setActiveMission(null);
    setMode('TITLE_MENU');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#131B2E] flex items-center justify-center text-amber-100 text-base font-bold">
        در حال آماده‌سازی سرزمین دانش‌آموزان قهرمان...
      </div>
    );
  }

  const displayName =
    sessionRole === 'student'
      ? activeStudent?.nickname
      : dbUser?.displayName || undefined;

  // 1. Full-Viewport Game Shell Title Screen + Role-Scoped Login Modal
  if (mode === 'TITLE_MENU') {
    return (
      <>
        <TitleScreen
          isAuthenticated={isAuthenticated}
          sessionRole={sessionRole}
          userDisplayName={displayName}
          authError={authError}
          muted={muted}
          onToggleMute={handleToggleMute}
          onContinueSession={() => {
            if (sessionRole) navigateForRole(sessionRole, students.length);
          }}
          onSignOut={handleSignOut}
          onOpenPortalLogin={(portal) => setLoginModalPortal(portal)}
          onEnterDemo={handleEnterDemo}
        />
        {loginModalPortal && (
          <LoginPortalModal
            portal={loginModalPortal}
            onClose={() => setLoginModalPortal(null)}
            onSuccess={(role, studentCount) => {
              setLoginModalPortal(null);
              navigateForRole(role, studentCount);
            }}
          />
        )}
      </>
    );
  }

  // 2. Parent-only Student Profile Onboarding
  if (mode === 'ONBOARDING' && sessionRole === 'parent') {
    return (
      <StudentOnboarding
        onCreated={async (student) => {
          await refreshProfile();
          setActiveStudentId(student.id);
          await loadStudentWorld(student.id);
          setMode('PARENT_PANEL');
        }}
        onCancel={() => setMode('PARENT_PANEL')}
      />
    );
  }

  const isStudentWorkspace = isDemoMode || sessionRole === 'student';
  const currentStudent = isStudentWorkspace ? worldData?.student || activeStudent : null;
  const isTimeLimitReached = Boolean(
    !isDemoMode &&
      sessionRole === 'student' &&
      currentStudent &&
      currentStudent.minutesUsedToday >= currentStudent.dailyLimitMinutes
  );

  // 3. Dedicated Full-Screen Ad-Free Mission Player (Student or Demo ONLY, blocked if daily limit reached)
  if (
    mode === 'ACTIVE_MISSION' &&
    activeMission &&
    worldData &&
    (isDemoMode || sessionRole === 'student') &&
    !isTimeLimitReached
  ) {
    return (
      <MissionPlayer
        mission={activeMission}
        gradeId={worldData.student.gradeId}
        isDemoMode={isDemoMode}
        onComplete={handleMissionCompleted}
        onExit={() => {
          setActiveMission(null);
          setMode('STUDENT_WORLD');
        }}
        onNextMission={handleNextMission}
      />
    );
  }

  const currentGradeTitle = currentStudent
    ? GRADES.find((g) => g.id === currentStudent.gradeId)?.shortTitle
    : '';
  const remainingMinutesToday = currentStudent
    ? Math.max(0, currentStudent.dailyLimitMinutes - currentStudent.minutesUsedToday)
    : 0;
  const pendingHwCount = worldData ? worldData.homeworks.filter((h) => !h.submission).length : 0;
  const takenExamIds = new Set((worldData?.examAttempts || []).map((a) => a.examId));
  const pendingExamCount = worldData
    ? worldData.exams.filter((e) => !takenExamIds.has(e.id)).length
    : 0;

  return (
    <div className="min-h-screen bg-[#FBF7EF] flex flex-col">
      {/* Strictly Role-Isolated Top Header (NEVER mixes Student / Parent / Teacher / Admin tabs!) */}
      <header className="sticky top-0 z-30 border-b border-[#E5DAC5] bg-[#131B2E] text-amber-50 px-4 sm:px-6 py-3">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3">
          {/* Identity Block */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setMode('TITLE_MENU');
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 cursor-pointer"
              aria-label="صفحه آغازین"
            >
              <Home className="h-5 w-5" />
            </button>

            {isStudentWorkspace && currentStudent ? (
              <div className="flex items-center gap-2.5">
                <HeroAvatarSvg
                  heroClass={currentStudent.heroClass}
                  equippedOutfit={currentStudent.equippedOutfit}
                  equippedPet={currentStudent.equippedPet}
                  avatarColor={currentStudent.avatarColor}
                  size={40}
                />
                <div className="leading-tight">
                  <p className="text-sm font-extrabold text-white">{currentStudent.nickname}</p>
                  <p className="text-xs text-amber-200/90">
                    {currentGradeTitle} {isDemoMode ? '· حالت آزمایشی' : '· حساب دانش‌آموز'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="leading-tight">
                <p
                  className="text-lg text-amber-100"
                  style={{ fontFamily: '"Lalezar", "Vazirmatn", sans-serif' }}
                >
                  سرزمین دانش‌آموزان قهرمان
                </p>
                <p className="text-xs text-amber-200/90">
                  {sessionRole === 'parent' && `پنل اختصاصی والدین · ${dbUser?.displayName || ''}`}
                  {sessionRole === 'teacher' && `پنل اختصاصی معلم · ${dbUser?.displayName || ''}`}
                  {sessionRole === 'admin' && `پنل مدیریت مرکزی · ${dbUser?.displayName || ''}`}
                </p>
              </div>
            )}
          </div>

          {/* Role-Specific Navigation (Strictly Isolated) */}
          <nav className="flex items-center gap-1 overflow-x-auto">
            {isStudentWorkspace && currentStudent && (
              <>
                {(
                  [
                    ['map', 'نقشه سرزمین‌ها', Map, 0],
                    ['homework', 'دفتر تکالیف', BookOpenCheck, pendingHwCount],
                    ['exams', 'آزمون‌ها', ClipboardCheck, pendingExamCount],
                    ['castle', 'قلعه و فروشگاه', Castle, 0],
                  ] as const
                ).map(([key, label, Icon, badgeCount]) => {
                  const active = mode === 'STUDENT_WORLD' && subTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        setMode('STUDENT_WORLD');
                        setSubTab(key);
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-amber-500 text-stone-950'
                          : 'text-amber-100/85 hover:bg-white/10'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                      {badgeCount > 0 && (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums ${
                            active
                              ? 'bg-stone-900 text-amber-300'
                              : 'bg-amber-500 text-stone-950'
                          }`}
                        >
                          {formatPersianDigits(badgeCount)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}

            {!isDemoMode && sessionRole === 'parent' && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-teal-500 px-3.5 py-2 text-xs sm:text-sm font-extrabold text-stone-950 whitespace-nowrap">
                <Users className="h-4 w-4" />
                <span>پنل مدیریت والدین</span>
              </span>
            )}

            {!isDemoMode && sessionRole === 'teacher' && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs sm:text-sm font-extrabold text-stone-950 whitespace-nowrap">
                <GraduationCap className="h-4 w-4" />
                <span>پنل اختصاصی معلمان</span>
              </span>
            )}

            {!isDemoMode && sessionRole === 'admin' && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-400 px-3.5 py-2 text-xs sm:text-sm font-extrabold text-stone-950 whitespace-nowrap">
                <ShieldCheck className="h-4 w-4" />
                <span>پنل مدیریت مرکزی</span>
              </span>
            )}
          </nav>

          {/* Right/End Controls */}
          <div className="flex items-center gap-3">
            {isStudentWorkspace && currentStudent && (
              <div className="hidden md:flex items-center gap-3 text-xs font-extrabold tabular-nums">
                {!isDemoMode && (
                  <span
                    className={`inline-flex items-center gap-1 ${
                      remainingMinutesToday <= 5 ? 'text-rose-300' : 'text-emerald-300'
                    }`}
                    title="سقف زمان روزانه تعیین‌شده توسط والدین"
                  >
                    <Clock className="h-4 w-4" />
                    {formatPersianDigits(remainingMinutesToday)} دقیقه باقی‌مانده
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <Coins className="h-4 w-4" />
                  {formatPersianDigits(currentStudent.coins)}
                </span>
                <span className="inline-flex items-center gap-1 text-teal-300">
                  <Star className="h-4 w-4" />
                  {formatPersianDigits(currentStudent.xp)}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={handleToggleMute}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-amber-100 cursor-pointer"
              aria-label={muted ? 'روشن کردن صدا' : 'قطع کردن صدا'}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {isAuthenticated && !isDemoMode ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-2 text-xs font-bold text-amber-100 cursor-pointer whitespace-nowrap"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>خروج از حساب</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setLoginModalPortal('student')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3.5 py-2 text-xs font-extrabold text-stone-950 cursor-pointer whitespace-nowrap"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>ورود به حساب</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 py-7">
        {isDemoMode && mode === 'STUDENT_WORLD' && (
          <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-amber-950">
                حالت آزمایشی سریع — تمام ۱۱ سبک بازی این پایه قابل اجراست. برای ذخیره ابری در گوگل، وارد حساب خود شوید.
              </span>
              <select
                aria-label="تغییر پایه در حالت آزمایشی"
                value={worldData?.student.gradeId || 3}
                onChange={(e) => setWorldData(buildDemoWorld(Number(e.target.value)))}
                className="rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-xs font-bold text-stone-900"
              >
                {GRADES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsDemoMode(false);
                setMode('TITLE_MENU');
              }}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-1.5 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
            >
              بازگشت به درگاه‌های ورود
            </button>
          </div>
        )}

        {worldError && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-sm font-bold text-rose-900">
            {worldError}
          </div>
        )}

        {/* 1. STUDENT ONLY WORKSPACE */}
        {isStudentWorkspace && (mode === 'STUDENT_WORLD' || mode === 'ACTIVE_MISSION') && (
          <>
            {isTimeLimitReached && currentStudent ? (
              <div className="mx-auto max-w-xl rounded-3xl border border-amber-300 bg-white p-8 sm:p-10 text-center space-y-5 shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <Coffee className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold text-stone-900">
                    وقت استراحت قهرمان!
                  </h2>
                  <p className="text-sm text-stone-600 leading-relaxed">
                    {currentStudent.nickname} عزیز، زمان بازی و تمرین امروزت به پایان رسید (
                    {formatPersianDigits(currentStudent.minutesUsedToday)} از{' '}
                    {formatPersianDigits(currentStudent.dailyLimitMinutes)} دقیقه تعیین‌شده توسط والدین).
                  </p>
                  <p className="text-xs font-bold text-teal-800">
                    چند دقیقه چشم‌هایت را ببند، یک لیوان آب بنوش و فردا دوباره با انرژی برگرد!
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMission(null);
                      setMode('TITLE_MENU');
                    }}
                    className="rounded-xl border border-stone-300 bg-white hover:bg-stone-50 px-5 py-2.5 text-sm font-bold text-stone-800 cursor-pointer"
                  >
                    بازگشت به صفحه آغازین
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2.5 text-sm font-bold text-white cursor-pointer"
                  >
                    خروج از حساب
                  </button>
                </div>
              </div>
            ) : worldLoading && !worldData ? (
              <div className="py-16 text-center text-sm font-bold text-stone-600">
                در حال بارگذاری سرزمین‌ها و مأموریت‌های پایه تحصیلی...
              </div>
            ) : !worldData ? (
              <div className="rounded-3xl border border-[#E5DAC5] bg-white p-10 text-center space-y-4">
                <h2 className="text-xl font-extrabold text-stone-900">پروفایل دانش‌آموز یافت نشد</h2>
              </div>
            ) : (
              <>
                {subTab === 'map' && (
                  <WorldHub
                    world={worldData}
                    isDemoMode={isDemoMode}
                    onRefresh={() => !isDemoMode && loadStudentWorld(worldData.student.id)}
                    onSelectMission={(m) => {
                      setActiveMission(m);
                      setMode('ACTIVE_MISSION');
                    }}
                  />
                )}
                {subTab === 'homework' && (
                  <HomeworkNotebook
                    studentId={worldData.student.id}
                    gradeId={worldData.student.gradeId}
                    homeworks={worldData.homeworks}
                    isDemoMode={isDemoMode}
                    onRefresh={() => !isDemoMode && loadStudentWorld(worldData.student.id)}
                  />
                )}
                {subTab === 'exams' && (
                  <ExamCenter
                    studentId={worldData.student.id}
                    gradeId={worldData.student.gradeId}
                    exams={worldData.exams}
                    examAttempts={worldData.examAttempts}
                    isDemoMode={isDemoMode}
                    onRefresh={() => !isDemoMode && loadStudentWorld(worldData.student.id)}
                  />
                )}
                {subTab === 'castle' && (
                  <HeroCastleShop
                    student={worldData.student}
                    rewardedChestsToday={worldData.rewardedChestsToday}
                    isDemoMode={isDemoMode}
                    onStudentUpdate={(updated) => {
                      setWorldData((prev) => (prev ? { ...prev, student: updated } : prev));
                      if (!isDemoMode) updateLocalStudent(updated);
                    }}
                    onRefresh={() => !isDemoMode && loadStudentWorld(worldData.student.id)}
                  />
                )}
              </>
            )}
          </>
        )}

        {/* 2. PARENT ONLY WORKSPACE */}
        {!isDemoMode && sessionRole === 'parent' && mode === 'PARENT_PANEL' && (
          <ParentPanel
            students={students}
            activeStudent={activeStudent}
            world={worldData}
            onSelectStudent={(id) => setActiveStudentId(id)}
            onAddStudent={() => setMode('ONBOARDING')}
            onRefresh={() => activeStudent && loadStudentWorld(activeStudent.id)}
            onStudentUpdate={(updated) => {
              updateLocalStudent(updated);
              setWorldData((prev) => (prev ? { ...prev, student: updated } : prev));
            }}
          />
        )}

        {/* 3. TEACHER ONLY WORKSPACE */}
        {!isDemoMode && sessionRole === 'teacher' && mode === 'TEACHER_PANEL' && dbUser && (
          <TeacherPanel dbUser={dbUser} onUserRefreshed={refreshProfile} />
        )}

        {/* 4. ADMIN ONLY WORKSPACE */}
        {!isDemoMode && sessionRole === 'admin' && mode === 'ADMIN_PANEL' && <AdminPanel />}
      </main>

      {loginModalPortal && (
        <LoginPortalModal
          portal={loginModalPortal}
          onClose={() => setLoginModalPortal(null)}
          onSuccess={(role, studentCount) => {
            setLoginModalPortal(null);
            navigateForRole(role, studentCount);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HeroLandApp />
    </AuthProvider>
  );
}
