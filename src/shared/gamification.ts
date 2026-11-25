export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  iconName: 'Rocket' | 'Calculator' | 'Target' | 'Flame' | 'Award' | 'ShoppingBag' | 'Compass' | 'BookCheck';
  colorHex: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}

export const BADGES: BadgeDefinition[] = [
  {
    id: 'first_hero',
    title: 'شروع قهرمانانه',
    description: 'انجام اولین مأموریت آموزشی با موفقیت',
    iconName: 'Rocket',
    colorHex: '#0D9488',
    bgClass: 'bg-teal-50',
    borderClass: 'border-teal-200',
    textClass: 'text-teal-700',
  },
  {
    id: 'math_star',
    title: 'ستاره ریاضی',
    description: 'پاسخ صحیح به ۵ مأموریت شهر اعداد (ریاضی)',
    iconName: 'Calculator',
    colorHex: '#D97706',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-200',
    textClass: 'text-amber-700',
  },
  {
    id: 'sharpshooter',
    title: 'تک‌تیرانداز بدون خطا',
    description: 'ثبت ۳ پاسخ صحیح پیاپی در مأموریت‌ها',
    iconName: 'Target',
    colorHex: '#059669',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-700',
  },
  {
    id: 'streak_7',
    title: '۷ روز پیوسته',
    description: 'فعالیت پیوسته و درخشان در ۷ روز متوالی',
    iconName: 'Flame',
    colorHex: '#EA580C',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
    textClass: 'text-orange-700',
  },
  {
    id: 'exam_top',
    title: 'آزمون‌دهنده برتر',
    description: 'کسب نمره ۸۰٪ یا بالاتر در یک آزمون آنلاین',
    iconName: 'Award',
    colorHex: '#4338CA',
    bgClass: 'bg-indigo-50',
    borderClass: 'border-indigo-200',
    textClass: 'text-indigo-700',
  },
  {
    id: 'shop_collector',
    title: 'کلکسیونر فروشگاه',
    description: 'جمع‌آوری حداقل ۴ آیتم در قلعه و کمد قهرمان',
    iconName: 'ShoppingBag',
    colorHex: '#B45309',
    bgClass: 'bg-yellow-50',
    borderClass: 'border-yellow-200',
    textClass: 'text-yellow-800',
  },
  {
    id: 'realm_explorer',
    title: 'کاوشگر همه سرزمین‌ها',
    description: 'فتح حداقل یک مأموریت در هر ۵ سرزمین آموزشی',
    iconName: 'Compass',
    colorHex: '#0284C7',
    bgClass: 'bg-sky-50',
    borderClass: 'border-sky-200',
    textClass: 'text-sky-700',
  },
  {
    id: 'homework_champ',
    title: 'قهرمان تکالیف',
    description: 'تحویل کامل حداقل ۳ تکلیف مدرسه یا خانگی',
    iconName: 'BookCheck',
    colorHex: '#7C3AED',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-200',
    textClass: 'text-violet-700',
  },
];

export interface HeroLevelInfo {
  level: number;
  title: string;
  currentLevelXp: number;
  xpPerLevel: number;
  progressPct: number;
  xpToNext: number;
}

const LEVEL_TITLES = [
  'نوآموز',
  'جستجوگر',
  'دانا',
  'قهرمان',
  'استاد بزرگ',
];

export function getHeroLevel(xp: number): HeroLevelInfo {
  const safeXp = Math.max(0, Number(xp) || 0);
  const xpPerLevel = 250;
  const level = Math.floor(safeXp / xpPerLevel) + 1;
  const currentLevelXp = safeXp % xpPerLevel;
  const progressPct = Math.min(100, Math.round((currentLevelXp / xpPerLevel) * 100));
  const titleIndex = Math.min(LEVEL_TITLES.length - 1, level - 1);
  return {
    level,
    title: LEVEL_TITLES[titleIndex],
    currentLevelXp,
    xpPerLevel,
    progressPct,
    xpToNext: xpPerLevel - currentLevelXp,
  };
}

export type DailyQuestKind = 'solve_3_missions' | 'perfect_mission';

export interface DailyQuestState {
  date: string;
  kind: DailyQuestKind;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  rewardCoins: number;
  rewardXp: number;
}

export function buildDailyQuestForDate(dateStr: string): Omit<DailyQuestState, 'progress' | 'completed' | 'claimed'> {
  const dayNum = Number(dateStr.replace(/-/g, '')) || 1;
  const isPerfectQuest = dayNum % 2 === 0;
  if (isPerfectQuest) {
    return {
      date: dateStr,
      kind: 'perfect_mission',
      title: 'چالش تمرکز طلایی امروز',
      description: 'امروز حداقل ۱ مأموریت را بدون اشتباه (درست در اولین تلاش) کامل کن',
      target: 1,
      rewardCoins: 50,
      rewardXp: 100,
    };
  }
  return {
    date: dateStr,
    kind: 'solve_3_missions',
    title: 'چالش قهرمان سه‌گانه امروز',
    description: 'امروز ۳ مأموریت آموزشی را با پاسخ درست به پایان برسان',
    target: 3,
    rewardCoins: 50,
    rewardXp: 100,
  };
}

export function normalizeDailyQuestState(
  rawJson: string | null | undefined,
  dateStr: string
): DailyQuestState {
  const base = buildDailyQuestForDate(dateStr);
  if (!rawJson) {
    return { ...base, progress: 0, completed: false, claimed: false };
  }
  try {
    const parsed = JSON.parse(rawJson) as Partial<DailyQuestState>;
    if (parsed.date !== dateStr) {
      return { ...base, progress: 0, completed: false, claimed: false };
    }
    const progress = Math.min(base.target, Math.max(0, Number(parsed.progress) || 0));
    const completed = Boolean(parsed.completed) || progress >= base.target;
    const claimed = Boolean(parsed.claimed);
    return {
      ...base,
      progress,
      completed,
      claimed,
    };
  } catch {
    return { ...base, progress: 0, completed: false, claimed: false };
  }
}

export function toPersianDigits(val: number | string): string {
  const map = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(val).replace(/\d/g, (d) => map[Number(d)] ?? d);
}
