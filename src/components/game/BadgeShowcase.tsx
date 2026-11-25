import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Award,
  BookCheck,
  Calculator,
  Compass,
  Flame,
  Lock,
  Rocket,
  ShoppingBag,
  Sparkles,
  Target,
  Trophy,
  X,
} from 'lucide-react';
import { BADGES, BadgeDefinition, toPersianDigits } from '../../shared/gamification';
import { ConfettiBurst } from './ConfettiBurst';

const ICON_MAP: Record<BadgeDefinition['iconName'], React.ElementType> = {
  Rocket,
  Calculator,
  Target,
  Flame,
  Award,
  ShoppingBag,
  Compass,
  BookCheck,
};

export function BadgeShowcase({
  earnedIds,
  title = 'کلکسیون نشان‌ها و افتخارات',
  compact = false,
}: {
  earnedIds: string[];
  title?: string;
  compact?: boolean;
}) {
  const earnedSet = new Set(earnedIds || []);
  const unlockedCount = BADGES.filter((b) => earnedSet.has(b.id)).length;

  return (
    <div className="rounded-3xl border border-[#E5DAC5] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-stone-900">{title}</h3>
            <p className="text-[11px] text-stone-500">
              {toPersianDigits(unlockedCount)} از {toPersianDigits(BADGES.length)} نشان قهرمانی باز شده
            </p>
          </div>
        </div>
        <div className="tabular-nums rounded-xl bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-800 border border-amber-200">
          {toPersianDigits(Math.round((unlockedCount / BADGES.length) * 100))}٪ تکمیل
        </div>
      </div>

      <div
        className={`mt-4 grid gap-3 ${
          compact ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        }`}
      >
        {BADGES.map((badge) => {
          const unlocked = earnedSet.has(badge.id);
          const Icon = ICON_MAP[badge.iconName] || Award;
          return (
            <div
              key={badge.id}
              className={`relative rounded-2xl border p-3.5 transition ${
                unlocked
                  ? `${badge.bgClass} ${badge.borderClass} shadow-xs`
                  : 'border-[#EFE6D5] bg-[#FBF7EF]/70 opacity-70'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    unlocked
                      ? 'border-white/80 bg-white shadow-xs'
                      : 'border-[#E5DAC5] bg-[#EFE6D5] text-stone-400'
                  }`}
                >
                  {unlocked ? (
                    <Icon className="h-5 w-5" style={{ color: badge.colorHex }} />
                  ) : (
                    <Lock className="h-4 w-4 text-stone-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-extrabold ${
                      unlocked ? badge.textClass : 'text-stone-600'
                    }`}
                  >
                    {badge.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-stone-600">{badge.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BadgeUnlockModal({
  badges,
  onClose,
}: {
  badges: BadgeDefinition[];
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {badges.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-amber-300 bg-[#FBF7EF] p-6 text-center shadow-2xl"
          >
            <ConfettiBurst active />
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن"
              className="absolute left-3 top-3 rounded-xl p-1.5 text-stone-500 hover:bg-[#EFE6D5]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400 text-stone-950 shadow-md">
              <Sparkles className="h-8 w-8" />
            </div>
            <h3 className="mt-3 font-display text-2xl text-stone-900">
              نشان جدید باز شد!
            </h3>
            <p className="mt-1 text-xs font-medium text-stone-600">
              آفرین قهرمان! با تلاش فوق‌العاده‌ات این افتخار را به دست آوردی:
            </p>

            <div className="mt-4 space-y-2.5 text-right">
              {badges.map((badge) => {
                const Icon = ICON_MAP[badge.iconName] || Award;
                return (
                  <div
                    key={badge.id}
                    className={`flex items-center gap-3 rounded-2xl border p-3.5 ${badge.bgClass} ${badge.borderClass}`}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-xs">
                      <Icon className="h-6 w-6" style={{ color: badge.colorHex }} />
                    </div>
                    <div>
                      <p className={`text-sm font-extrabold ${badge.textClass}`}>{badge.title}</p>
                      <p className="text-xs text-stone-600">{badge.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-2xl bg-teal-700 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-teal-800"
            >
              ادامه ماجراجویی
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
