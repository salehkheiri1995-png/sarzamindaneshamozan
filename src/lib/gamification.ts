import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  examAttempts,
  homeworkSubmissions,
  missionAttempts,
  notifications,
  studentProfiles,
  users,
} from '../db/schema.ts';
import {
  BADGES,
  BadgeDefinition,
  normalizeDailyQuestState,
} from '../shared/gamification.ts';
import { safeJsonParse } from './server-helpers.ts';

export function getTodayDateStr(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getYesterdayDateStr(date = new Date()): string {
  const copy = new Date(date);
  copy.setDate(copy.getDate() - 1);
  return getTodayDateStr(copy);
}

export function computeUpdatedStreakAndQuest(
  student: typeof studentProfiles.$inferSelect,
  isCorrect: boolean
) {
  const today = getTodayDateStr();
  const yesterday = getYesterdayDateStr();

  let currentStreak = Math.max(1, student.currentStreak || student.streakDays || 1);
  let longestStreak = Math.max(currentStreak, student.longestStreak || 1);
  const lastActive = student.lastActiveDate || null;

  if (!lastActive) {
    currentStreak = Math.max(1, currentStreak);
  } else if (lastActive === today) {
    // Already active today; keep currentStreak
  } else if (lastActive === yesterday) {
    currentStreak += 1;
  } else {
    currentStreak = 1;
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
  }

  const quest = normalizeDailyQuestState(student.dailyQuestProgress, today);
  if (isCorrect && !quest.claimed) {
    const nextProgress = Math.min(quest.target, quest.progress + 1);
    quest.progress = nextProgress;
    quest.completed = nextProgress >= quest.target;
  }

  return {
    currentStreak,
    longestStreak,
    streakDays: currentStreak,
    lastActiveDate: today,
    dailyQuestProgress: JSON.stringify(quest),
  };
}

export interface CreateNotificationInput {
  recipientUid?: string | null;
  studentId?: number | null;
  role: 'student' | 'parent' | 'teacher' | 'admin';
  title: string;
  body: string;
  type: 'homework' | 'exam' | 'feedback' | 'approval' | 'announcement' | 'badge';
}

export async function createNotifications(items: CreateNotificationInput[]) {
  if (!items.length) return;
  try {
    await db.insert(notifications).values(
      items.map((item) => ({
        recipientUid: item.recipientUid ?? null,
        studentId: item.studentId ?? null,
        role: item.role,
        title: item.title.slice(0, 120),
        body: item.body.slice(0, 400),
        type: item.type,
        isRead: false,
      }))
    );
  } catch (error) {
    console.error('Failed to insert notifications:', error);
  }
}

export async function notifyAllAdmins(
  title: string,
  body: string,
  type: CreateNotificationInput['type']
) {
  try {
    const admins = await db
      .select({ uid: users.uid })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (!admins.length) return;
    await createNotifications(
      admins.map((a) => ({
        recipientUid: a.uid,
        role: 'admin',
        title,
        body,
        type,
      }))
    );
  } catch (error) {
    console.error('Failed to notify admins:', error);
  }
}

export async function evaluateAndAwardBadges(studentId: number): Promise<BadgeDefinition[]> {
  const [student] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.id, studentId))
    .limit(1);
  if (!student) return [];

  const existingIds = new Set(safeJsonParse<string[]>(student.earnedBadges, []));

  const [attempts, examsList, homeworksList] = await Promise.all([
    db
      .select()
      .from(missionAttempts)
      .where(eq(missionAttempts.studentId, studentId))
      .orderBy(desc(missionAttempts.createdAt))
      .limit(150),
    db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.studentId, studentId))
      .limit(50),
    db
      .select()
      .from(homeworkSubmissions)
      .where(eq(homeworkSubmissions.studentId, studentId))
      .limit(50),
  ]);

  const correctAttempts = attempts.filter((a) => a.isCorrect);
  const mathCorrect = correctAttempts.filter((a) => a.bookId === 'math').length;
  const distinctBooks = new Set(correctAttempts.map((a) => a.bookId));

  let maxConsecutiveCorrect = 0;
  let running = 0;
  for (const att of attempts) {
    if (att.isCorrect) {
      running += 1;
      if (running > maxConsecutiveCorrect) maxConsecutiveCorrect = running;
    } else {
      running = 0;
    }
  }

  const hasTopExam = examsList.some(
    (ea) => ea.maxScore > 0 && ea.score / ea.maxScore >= 0.8
  );
  const ownedItems = safeJsonParse<string[]>(student.ownedItems, []);
  const streak = Math.max(student.currentStreak || 0, student.longestStreak || 0, student.streakDays || 0);

  const qualified = new Set<string>();
  if (correctAttempts.length >= 1) qualified.add('first_hero');
  if (mathCorrect >= 5) qualified.add('math_star');
  if (maxConsecutiveCorrect >= 3) qualified.add('sharpshooter');
  if (streak >= 7) qualified.add('streak_7');
  if (hasTopExam) qualified.add('exam_top');
  if (ownedItems.length >= 4) qualified.add('shop_collector');
  if (distinctBooks.size >= 5) qualified.add('realm_explorer');
  if (homeworksList.length >= 3) qualified.add('homework_champ');

  const newlyUnlockedIds = [...qualified].filter((id) => !existingIds.has(id));
  if (newlyUnlockedIds.length === 0) return [];

  const updatedList = [...new Set([...existingIds, ...newlyUnlockedIds])];
  await db
    .update(studentProfiles)
    .set({ earnedBadges: JSON.stringify(updatedList) })
    .where(eq(studentProfiles.id, studentId));

  const badgeDefs = BADGES.filter((b) => newlyUnlockedIds.includes(b.id));

  if (badgeDefs.length > 0) {
    const notificationsToInsert: CreateNotificationInput[] = [];
    for (const badge of badgeDefs) {
      notificationsToInsert.push({
        studentId: student.id,
        role: 'student',
        title: `نشان جدید «${badge.title}» باز شد!`,
        body: badge.description,
        type: 'badge',
      });
      notificationsToInsert.push({
        recipientUid: student.parentUid,
        studentId: student.id,
        role: 'parent',
        title: `افتخار جدید برای ${student.nickname}: ${badge.title}`,
        body: badge.description,
        type: 'badge',
      });
    }
    await createNotifications(notificationsToInsert);
  }

  return badgeDefs;
}
