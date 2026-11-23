import React, { useState } from 'react';
import { StudentWorldData, MissionItem, TeacherVideoItem } from '../../types/game';
import {
  GRADES,
  REALMS,
  RealmId,
  WORLD_BACKDROP_URL,
  QUESTION_TYPE_LABELS,
  DIFFICULTY_LABELS,
  formatPersianDigits,
} from '../../shared/curriculum';
import { HeroAvatarSvg } from './HeroAvatarSvg';
import { soundEngine } from '../../lib/sound';
import {
  Compass,
  Play,
  CheckCircle2,
  Video,
  Bell,
  Coffee,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface WorldHubProps {
  world: StudentWorldData;
  onSelectMission: (mission: MissionItem) => void;
}

export function WorldHub({ world, onSelectMission }: WorldHubProps) {
  const [selectedRealmId, setSelectedRealmId] = useState<RealmId | null>(null);
  const [activeVideo, setActiveVideo] = useState<TeacherVideoItem | null>(null);
  const [videoQuizChoice, setVideoQuizChoice] = useState<string | null>(null);
  const [videoQuizDone, setVideoQuizDone] = useState(false);

  const gradeInfo = GRADES.find((g) => g.id === world.student.gradeId) || GRADES[0];
  const recommendedMission = world.missions.find((m) => m.id === world.recommendedMissionId) || world.missions[0];
  const needsBreak = world.student.minutesUsedToday >= world.student.dailyLimitMinutes;

  const selectedRealm = selectedRealmId
    ? REALMS.find((r) => r.id === selectedRealmId) || null
    : null;

  const realmMissions = selectedRealm
    ? world.missions.filter((m) => m.realmId === selectedRealm.id)
    : [];

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
                    <div className="flex items-center justify-between text-xs font-semibold text-stone-500">
                      <span>{m.chapterId}</span>
                      <span>
                        {QUESTION_TYPE_LABELS[m.questionType]} · {DIFFICULTY_LABELS[m.difficulty]}
                      </span>
                    </div>
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

      {/* Teacher Videos & Classroom Safe Announcements */}
      {(world.videos.length > 0 || world.announcements.length > 0) && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Teacher Videos */}
          <div className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4">
            <h3 className="text-lg font-extrabold text-stone-900 flex items-center gap-2">
              <Video className="h-5 w-5 text-teal-700" />
              <span>فیلم‌های آموزشی کلاس من</span>
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
              <span>پیام‌ها و تقویم آموزشی معلم</span>
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
                      معلم {a.senderName} {a.scheduledDate ? `· تاریخ: ${a.scheduledDate}` : ''}
                    </p>
                    <p className="mt-1">{a.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

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
