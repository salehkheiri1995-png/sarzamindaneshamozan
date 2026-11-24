import { Router } from 'express';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adEvents,
  announcements,
  classroomEnrollments,
  classrooms,
  educationalContent,
  examAttempts,
  exams,
  homeworkSubmissions,
  homeworks,
  missionAttempts,
  studentProfiles,
  teacherVideos,
  users,
} from '../db/schema.ts';
import { ensureCurriculumSeeded } from '../db/seed.ts';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { hashPassword } from '../lib/auth-crypto.ts';
import { SHOP_ITEMS, BookId } from '../shared/curriculum.ts';
import {
  normalizeUsername,
  resolveCallerUser,
  safeJsonParse,
  sanitizeStudent,
  verifyStudentAccess,
} from '../lib/server-helpers.ts';

export const studentsRouter = Router();

studentsRouter.post('/students', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    const isParentSession = req.user?.role === 'parent';
    if (
      caller.isStudentSession ||
      (!isParentSession && caller.role !== 'parent' && caller.role !== 'admin')
    ) {
      return res.status(403).json({ error: 'فقط حساب والدین می‌تواند پروفایل دانش‌آموز ایجاد کند.' });
    }

    const {
      nickname,
      gradeId,
      academicYear,
      age,
      heroClass,
      avatarColor,
      username: rawUsername,
      password: rawPassword,
    } = req.body as {
      nickname?: string;
      gradeId?: number;
      academicYear?: string;
      age?: number;
      heroClass?: string;
      avatarColor?: string;
      username?: string;
      password?: string;
    };

    const cleanName = String(nickname || '').trim().slice(0, 40);
    const parsedGrade = Number(gradeId);
    if (!cleanName || !Number.isInteger(parsedGrade) || parsedGrade < 1 || parsedGrade > 6) {
      return res
        .status(400)
        .json({ error: 'نام مستعار و پایه تحصیلی معتبر (اول تا ششم) الزامی است.' });
    }

    let finalUsername: string | null = null;
    let finalHash: string | null = null;
    if (rawUsername && String(rawUsername).trim()) {
      const normalized = normalizeUsername(rawUsername);
      if (normalized.length < 3) {
        return res
          .status(400)
          .json({ error: 'نام کاربری دانش‌آموز باید حداقل ۳ حرف یا عدد انگلیسی باشد.' });
      }
      if (!rawPassword || String(rawPassword).length < 4) {
        return res.status(400).json({ error: 'رمز عبور دانش‌آموز باید حداقل ۴ کاراکتر باشد.' });
      }
      const dupStudent = await db
        .select({ id: studentProfiles.id })
        .from(studentProfiles)
        .where(eq(studentProfiles.username, normalized))
        .limit(1);
      const dupUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, normalized))
        .limit(1);
      if (dupStudent.length > 0 || dupUser.length > 0) {
        return res.status(409).json({ error: 'این نام کاربری قبلاً استفاده شده است.' });
      }
      finalUsername = normalized;
      finalHash = hashPassword(String(rawPassword));
    }

    const allowedClasses = ['explorer', 'scholar', 'inventor', 'guardian'];
    const safeClass = allowedClasses.includes(String(heroClass)) ? String(heroClass) : 'explorer';

    const [created] = await db
      .insert(studentProfiles)
      .values({
        parentUid: caller.uid,
        nickname: cleanName,
        username: finalUsername,
        passwordHash: finalHash,
        gradeId: parsedGrade,
        academicYear: String(academicYear || '1404-1405').slice(0, 20),
        age: age && Number(age) >= 5 && Number(age) <= 14 ? Number(age) : null,
        heroClass: safeClass,
        avatarColor: /^#[0-9A-Fa-f]{6}$/.test(String(avatarColor || ''))
          ? String(avatarColor)
          : '#D97706',
      })
      .returning();

    res.status(201).json({ student: sanitizeStudent(created) });
  } catch (error: unknown) {
    console.error('POST /api/students failed:', error);
    res.status(500).json({ error: 'خطا در ایجاد پروفایل دانش‌آموز.' });
  }
});

studentsRouter.patch('/students/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) {
      return res.status(400).json({ error: 'شناسه دانش‌آموز نامعتبر است.' });
    }
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });

    const { student, caller } = access;
    const {
      gradeId,
      dailyLimitMinutes,
      nickname,
      heroClass,
      equippedOutfit,
      equippedPet,
      castleDecor,
      allowOptionalAds,
      allowClassJoin,
      username: rawUsername,
      password: rawPassword,
    } = req.body as Record<string, unknown>;

    const updates: Partial<typeof studentProfiles.$inferInsert> = {};

    if (!caller.isStudentSession) {
      if (gradeId !== undefined) {
        const g = Number(gradeId);
        if (Number.isInteger(g) && g >= 1 && g <= 6) updates.gradeId = g;
      }
      if (dailyLimitMinutes !== undefined) {
        const lim = Number(dailyLimitMinutes);
        if (Number.isInteger(lim) && lim >= 10 && lim <= 180) updates.dailyLimitMinutes = lim;
      }
      if (typeof nickname === 'string' && nickname.trim()) {
        updates.nickname = nickname.trim().slice(0, 40);
      }
      if (typeof allowOptionalAds === 'boolean') {
        updates.allowOptionalAds = allowOptionalAds;
      }
      if (typeof allowClassJoin === 'boolean') {
        updates.allowClassJoin = allowClassJoin;
      }
      if (typeof rawUsername === 'string' && rawUsername.trim()) {
        const normalized = normalizeUsername(rawUsername);
        if (normalized.length < 3) {
          return res
            .status(400)
            .json({ error: 'نام کاربری دانش‌آموز باید حداقل ۳ حرف/عدد انگلیسی باشد.' });
        }
        const dup = await db
          .select({ id: studentProfiles.id })
          .from(studentProfiles)
          .where(eq(studentProfiles.username, normalized))
          .limit(1);
        if (dup.length > 0 && dup[0].id !== student.id) {
          return res
            .status(409)
            .json({ error: 'این نام کاربری قبلاً برای دانش‌آموز دیگری ثبت شده است.' });
        }
        updates.username = normalized;
      }
      if (typeof rawPassword === 'string' && rawPassword.trim()) {
        if (rawPassword.length < 4) {
          return res.status(400).json({ error: 'رمز عبور دانش‌آموز باید حداقل ۴ کاراکتر باشد.' });
        }
        updates.passwordHash = hashPassword(rawPassword);
      }
    }

    if (
      typeof heroClass === 'string' &&
      ['explorer', 'scholar', 'inventor', 'guardian'].includes(heroClass)
    ) {
      updates.heroClass = heroClass;
    }
    const owned = safeJsonParse<string[]>(student.ownedItems, []);
    if (typeof equippedOutfit === 'string' && owned.includes(equippedOutfit)) {
      updates.equippedOutfit = equippedOutfit;
    }
    if (typeof equippedPet === 'string' && (equippedPet === 'none' || owned.includes(equippedPet))) {
      updates.equippedPet = equippedPet;
    }
    if (Array.isArray(castleDecor)) {
      const validDecor = castleDecor.filter((id) => typeof id === 'string' && owned.includes(id));
      updates.castleDecor = JSON.stringify(validDecor);
    }

    const [updated] = await db
      .update(studentProfiles)
      .set(updates)
      .where(eq(studentProfiles.id, studentId))
      .returning();

    res.json({ student: sanitizeStudent(updated) });
  } catch (error: unknown) {
    console.error('PATCH /api/students/:id failed:', error);
    res.status(500).json({ error: 'خطا در بروزرسانی پروفایل دانش‌آموز.' });
  }
});

studentsRouter.delete('/students/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId)) {
      return res.status(400).json({ error: 'شناسه دانش‌آموز نامعتبر است.' });
    }
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden' || access.caller.isStudentSession) {
      return res.status(403).json({ error: 'فقط والدین یا مدیر مجاز به حذف پروفایل دانش‌آموز هستند.' });
    }

    await db.delete(studentProfiles).where(eq(studentProfiles.id, studentId));
    res.json({ deleted: true, id: studentId });
  } catch (error) {
    console.error('DELETE /api/students/:id failed:', error);
    res.status(500).json({ error: 'حذف پروفایل دانش‌آموز با خطا مواجه شد.' });
  }
});

studentsRouter.delete(
  '/students/:id/enrollments/:enrollmentId',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const studentId = Number(req.params.id);
      const enrollmentId = Number(req.params.enrollmentId);
      if (!Number.isInteger(studentId) || !Number.isInteger(enrollmentId)) {
        return res.status(400).json({ error: 'شناسه نامعتبر است.' });
      }
      const access = await verifyStudentAccess(studentId, req);
      if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
      if (access.status === 'forbidden' || access.caller.isStudentSession) {
        return res.status(403).json({ error: 'لغو عضویت کلاس فقط توسط والدین یا مدیر انجام می‌شود.' });
      }

      await db
        .delete(classroomEnrollments)
        .where(
          and(
            eq(classroomEnrollments.id, enrollmentId),
            eq(classroomEnrollments.studentId, studentId)
          )
        );

      res.json({ deleted: true, enrollmentId });
    } catch (error) {
      console.error('DELETE /api/students/:id/enrollments/:enrollmentId failed:', error);
      res.status(500).json({ error: 'خروج از کلاس با خطا مواجه شد.' });
    }
  }
);

studentsRouter.post('/students/:id/session-tick', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });

    const { student } = access;
    const nextMinutes = Math.min(240, student.minutesUsedToday + 1);
    const [updated] = await db
      .update(studentProfiles)
      .set({ minutesUsedToday: nextMinutes })
      .where(eq(studentProfiles.id, studentId))
      .returning();

    res.json({ student: sanitizeStudent(updated) });
  } catch (error) {
    console.error('POST /api/students/:id/session-tick failed:', error);
    res.status(500).json({ error: 'ثبت زمان استفاده روزانه ناموفق بود.' });
  }
});

studentsRouter.get('/students/:id/world', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureCurriculumSeeded();
    const studentId = Number(req.params.id);
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });

    const { student } = access;

    const missions = await db
      .select()
      .from(educationalContent)
      .where(
        and(
          eq(educationalContent.gradeId, student.gradeId),
          eq(educationalContent.reviewStatus, 'approved')
        )
      )
      .orderBy(educationalContent.id);

    const attempts = await db
      .select()
      .from(missionAttempts)
      .where(eq(missionAttempts.studentId, studentId))
      .orderBy(desc(missionAttempts.createdAt));

    const enrollments = await db
      .select({
        enrollmentId: classroomEnrollments.id,
        classroomId: classrooms.id,
        classroomName: classrooms.name,
        gradeId: classrooms.gradeId,
        joinCode: classrooms.joinCode,
        isActive: classrooms.isActive,
        teacherName: users.displayName,
      })
      .from(classroomEnrollments)
      .innerJoin(classrooms, eq(classroomEnrollments.classroomId, classrooms.id))
      .leftJoin(users, eq(classrooms.teacherUid, users.uid))
      .where(eq(classroomEnrollments.studentId, studentId));

    const classMap = new Map(enrollments.map((e) => [e.classroomId, e]));
    const enrolledClassIds = enrollments.map((e) => e.classroomId);

    const homeworkConditions = [
      and(eq(homeworks.gradeId, student.gradeId), eq(homeworks.creatorUid, student.parentUid)),
    ];
    if (enrolledClassIds.length > 0) {
      homeworkConditions.push(
        and(eq(homeworks.gradeId, student.gradeId), inArray(homeworks.classroomId, enrolledClassIds))
      );
    }
    const studentHomeworks = await db
      .select()
      .from(homeworks)
      .where(or(...homeworkConditions))
      .orderBy(desc(homeworks.createdAt));

    const submissions = await db
      .select()
      .from(homeworkSubmissions)
      .where(eq(homeworkSubmissions.studentId, studentId));

    const examConditions = [and(eq(exams.gradeId, student.gradeId), isNull(exams.classroomId))];
    if (enrolledClassIds.length > 0) {
      examConditions.push(
        and(eq(exams.gradeId, student.gradeId), inArray(exams.classroomId, enrolledClassIds))
      );
    }
    const gradeExams = await db
      .select()
      .from(exams)
      .where(or(...examConditions))
      .orderBy(desc(exams.createdAt));

    const examTitleMap = new Map(gradeExams.map((e) => [e.id, e.title]));

    const studentExamAttempts = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.studentId, studentId))
      .orderBy(desc(examAttempts.completedAt));

    const videos =
      enrolledClassIds.length > 0
        ? await db
            .select()
            .from(teacherVideos)
            .where(
              and(
                eq(teacherVideos.gradeId, student.gradeId),
                inArray(teacherVideos.classroomId, enrolledClassIds)
              )
            )
            .orderBy(desc(teacherVideos.createdAt))
        : [];

    const classAnnouncements =
      enrolledClassIds.length > 0
        ? await db
            .select()
            .from(announcements)
            .where(inArray(announcements.classroomId, enrolledClassIds))
            .orderBy(desc(announcements.createdAt))
            .limit(20)
        : [];

    const globalAudiences = access.caller.isStudentSession ? ['all'] : ['all', 'parents'];
    const globalAnnouncements = await db
      .select()
      .from(announcements)
      .where(
        and(
          isNull(announcements.classroomId),
          inArray(announcements.targetAudience, globalAudiences)
        )
      )
      .orderBy(desc(announcements.createdAt))
      .limit(15);

    const now = new Date();
    const dueReviewAttempts = attempts.filter(
      (a) => !a.isCorrect && a.nextReviewAt && new Date(a.nextReviewAt) <= now
    );
    const completedIds = new Set(
      attempts.filter((a) => a.isCorrect && a.contentId).map((a) => a.contentId!)
    );

    const recommendedMission =
      missions.find(
        (m) =>
          dueReviewAttempts.some((a) => a.contentId === m.id) &&
          m.questionType !== student.lastGameType
      ) ||
      missions.find(
        (m) => !completedIds.has(m.id) && m.questionType !== student.lastGameType
      ) ||
      missions.find((m) => !completedIds.has(m.id)) ||
      missions[0] ||
      null;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayAds = await db
      .select()
      .from(adEvents)
      .where(
        and(
          eq(adEvents.studentId, studentId),
          eq(adEvents.eventType, 'reward_completed')
        )
      );
    const rewardedChestsToday = todayAds.filter(
      (e) => e.createdAt && new Date(e.createdAt) >= startOfDay
    ).length;

    res.json({
      student: sanitizeStudent(student),
      missions: missions.map((m) => ({
        ...m,
        payload: safeJsonParse<Record<string, unknown>>(m.payloadJson, {}),
        completed: completedIds.has(m.id),
      })),
      recommendedMissionId: recommendedMission?.id ?? null,
      attempts,
      enrollments: enrollments.map((e) => ({
        ...e,
        teacherName: e.teacherName || 'معلم کلاس',
      })),
      homeworks: studentHomeworks.map((h) => ({
        ...h,
        classroomName: h.classroomId ? classMap.get(h.classroomId)?.classroomName || null : null,
        classroomIsActive: h.classroomId ? classMap.get(h.classroomId)?.isActive ?? true : true,
        questions: safeJsonParse<unknown[]>(h.questionsJson, []),
        submission: submissions.find((s) => s.homeworkId === h.id) || null,
      })),
      exams: gradeExams.map((e) => ({
        ...e,
        classroomName: e.classroomId ? classMap.get(e.classroomId)?.classroomName || null : null,
        classroomIsActive: e.classroomId ? classMap.get(e.classroomId)?.isActive ?? true : true,
        questions: safeJsonParse<unknown[]>(e.questionsJson, []),
      })),
      examAttempts: studentExamAttempts.map((ea) => ({
        ...ea,
        examTitle: examTitleMap.get(ea.examId) || `آزمون #${ea.examId}`,
      })),
      videos: videos.map((v) => ({
        ...v,
        classroomName: v.classroomId ? classMap.get(v.classroomId)?.classroomName || null : null,
        followUpQuestion: safeJsonParse<Record<string, unknown>>(v.followUpQuestionJson, {}),
      })),
      announcements: classAnnouncements.map((a) => ({
        ...a,
        classroomName: a.classroomId ? classMap.get(a.classroomId)?.classroomName || null : null,
      })),
      globalAnnouncements,
      rewardedChestsToday,
    });
  } catch (error: unknown) {
    console.error('GET /api/students/:id/world failed:', error);
    res.status(500).json({ error: 'خطا در بارگذاری دنیای بازی دانش‌آموز.' });
  }
});

studentsRouter.post('/students/:id/attempts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });

    const { student } = access;
    const { contentId, bookId, topicId, questionType, isCorrect, durationSeconds } = req.body as {
      contentId?: number;
      bookId: string;
      topicId: string;
      questionType: string;
      isCorrect: boolean;
      durationSeconds?: number;
    };

    const coinsEarned = isCorrect ? 25 : 5;
    const scoreEarned = isCorrect ? 40 : 10;
    const nextReviewAt = isCorrect
      ? new Date(Date.now() + 7 * 24 * 3600 * 1000)
      : new Date(Date.now() + 12 * 3600 * 1000);

    const [attempt] = await db
      .insert(missionAttempts)
      .values({
        studentId,
        contentId: contentId || null,
        gradeId: student.gradeId,
        bookId: String(bookId || 'math'),
        topicId: String(topicId || 'عمومی'),
        questionType: String(questionType || 'mcq'),
        isCorrect: Boolean(isCorrect),
        scoreEarned,
        coinsEarned,
        durationSeconds: Math.max(1, Math.min(600, Number(durationSeconds) || 15)),
        nextReviewAt,
      })
      .returning();

    const minutesAdded = Math.max(1, Math.round((Number(durationSeconds) || 30) / 60));
    const [updatedStudent] = await db
      .update(studentProfiles)
      .set({
        coins: student.coins + coinsEarned,
        xp: student.xp + scoreEarned,
        minutesUsedToday: student.minutesUsedToday + minutesAdded,
        lastGameType: String(questionType || 'mcq'),
      })
      .where(eq(studentProfiles.id, studentId))
      .returning();

    res.json({ attempt, student: sanitizeStudent(updatedStudent) });
  } catch (error: unknown) {
    console.error('POST /api/students/:id/attempts failed:', error);
    res.status(500).json({ error: 'ثبت نتیجه مأموریت با خطا مواجه شد.' });
  }
});

studentsRouter.post('/students/:id/shop/buy', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });

    const { student } = access;
    const { itemId } = req.body as { itemId?: string };
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'آیتم در فروشگاه یافت نشد.' });

    const owned = safeJsonParse<string[]>(student.ownedItems, []);
    if (owned.includes(item.id)) {
      return res.status(400).json({ error: 'این آیتم قبلاً خریداری شده است.' });
    }
    if (student.coins < item.price) {
      return res
        .status(400)
        .json({ error: 'سکه‌های تو هنوز کافی نیست! چند مأموریت دیگر انجام بده.' });
    }

    const nextOwned = [...owned, item.id];
    const updates: Partial<typeof studentProfiles.$inferInsert> = {
      coins: student.coins - item.price,
      ownedItems: JSON.stringify(nextOwned),
    };
    if (item.category === 'outfit') updates.equippedOutfit = item.id;
    if (item.category === 'pet') updates.equippedPet = item.id;
    if (item.category === 'decor') {
      const decor = safeJsonParse<string[]>(student.castleDecor, []);
      updates.castleDecor = JSON.stringify([...new Set([...decor, item.id])]);
    }

    const [updated] = await db
      .update(studentProfiles)
      .set(updates)
      .where(eq(studentProfiles.id, studentId))
      .returning();

    res.json({ student: sanitizeStudent(updated) });
  } catch (error: unknown) {
    console.error('POST /api/students/:id/shop/buy failed:', error);
    res.status(500).json({ error: 'خطا در خرید آیتم فروشگاه.' });
  }
});

studentsRouter.post('/students/:id/ads/reward', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });

    const { student } = access;
    if (!student.allowOptionalAds) {
      return res.status(403).json({ error: 'والدین نمایش صندوق جایزه تبلیغاتی را غیرفعال کرده‌اند.' });
    }

    const { completed } = req.body as { completed?: boolean };
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const prior = await db
      .select()
      .from(adEvents)
      .where(
        and(
          eq(adEvents.studentId, studentId),
          eq(adEvents.eventType, 'reward_completed')
        )
      );
    const todayCount = prior.filter((e) => e.createdAt && new Date(e.createdAt) >= startOfDay).length;

    if (!completed) {
      await db.insert(adEvents).values({
        studentId,
        placement: 'rewarded_chest',
        eventType: 'skipped',
        rewardCoins: 0,
      });
      return res.json({ awarded: false, coins: student.coins, rewardedChestsToday: todayCount });
    }

    if (todayCount >= 3) {
      return res
        .status(400)
        .json({ error: 'سقف روزانه صندوق جایزه اختیاری (۳ بار در روز) تکمیل شده است.' });
    }

    const rewardCoins = 30;
    await db.insert(adEvents).values({
      studentId,
      placement: 'rewarded_chest',
      eventType: 'reward_completed',
      rewardCoins,
    });

    const [updated] = await db
      .update(studentProfiles)
      .set({ coins: student.coins + rewardCoins })
      .where(eq(studentProfiles.id, studentId))
      .returning();

    res.json({
      awarded: true,
      rewardCoins,
      student: sanitizeStudent(updated),
      rewardedChestsToday: todayCount + 1,
    });
  } catch (error: unknown) {
    console.error('POST /api/students/:id/ads/reward failed:', error);
    res.status(500).json({ error: 'ثبت جایزه صندوق با خطا مواجه شد.' });
  }
});

studentsRouter.post('/students/:id/join-class', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });

    const { student } = access;
    if (!student.allowClassJoin) {
      return res.status(403).json({ error: 'عضویت در کلاس توسط والدین محدود شده است.' });
    }

    const code = String(req.body.joinCode || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'کد عضویت کلاس را وارد کنید.' });

    const [cls] = await db
      .select()
      .from(classrooms)
      .where(eq(classrooms.joinCode, code))
      .limit(1);

    if (!cls) {
      return res.status(404).json({ error: 'کلاسی با این کد عضویت پیدا نشد.' });
    }
    if (!cls.isActive) {
      return res
        .status(403)
        .json({ error: 'این کلاس توسط معلم یا مدیر سامانه بسته شده است و امکان عضویت جدید ندارد.' });
    }
    if (cls.gradeId !== student.gradeId) {
      return res.status(400).json({
        error: `این کلاس مخصوص پایه ${cls.gradeId} است اما پایه دانش‌آموز ${student.gradeId} ثبت شده است.`,
      });
    }

    const existing = await db
      .select()
      .from(classroomEnrollments)
      .where(
        and(
          eq(classroomEnrollments.classroomId, cls.id),
          eq(classroomEnrollments.studentId, studentId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return res.json({ classroom: cls, alreadyJoined: true });
    }

    await db.insert(classroomEnrollments).values({
      classroomId: cls.id,
      studentId,
      parentApproved: true,
    });

    res.status(201).json({ classroom: cls, alreadyJoined: false });
  } catch (error: unknown) {
    console.error('POST /api/students/:id/join-class failed:', error);
    res.status(500).json({ error: 'عضویت در کلاس با خطا مواجه شد.' });
  }
});

studentsRouter.post('/homeworks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || !caller.user) {
      return res
        .status(403)
        .json({ error: 'تعریف تکلیف جدید فقط توسط والدین یا معلم امکان‌پذیر است.' });
    }
    if (caller.role === 'teacher' && !caller.user.teacherApproved) {
      return res.status(403).json({ error: 'حساب معلم شما هنوز توسط مدیر سامانه تأیید نشده است.' });
    }
    const uid = caller.uid;
    const user = caller.user;

    const {
      classroomId,
      gradeId,
      bookId,
      chapterId,
      topicId,
      title,
      description,
      dueDate,
      questions,
      attachmentName,
    } = req.body as {
      classroomId?: number | null;
      gradeId: number;
      bookId: BookId;
      chapterId?: string;
      topicId?: string;
      title: string;
      description?: string;
      dueDate?: string;
      questions?: Array<{
        promptText: string;
        options: string[];
        correctAnswer: string;
        hintText?: string;
        explanation?: string;
      }>;
      attachmentName?: string;
    };

    const g = Number(gradeId);
    if (!title?.trim() || !Number.isInteger(g) || g < 1 || g > 6) {
      return res.status(400).json({ error: 'عنوان تکلیف و پایه تحصیلی معتبر الزامی است.' });
    }

    if (classroomId) {
      const [cls] = await db
        .select()
        .from(classrooms)
        .where(eq(classrooms.id, Number(classroomId)))
        .limit(1);
      if (!cls || (cls.teacherUid !== uid && user.role !== 'admin')) {
        return res.status(403).json({ error: 'فقط معلم این کلاس می‌تواند برای آن تکلیف ثبت کند.' });
      }
    }

    const safeQuestions =
      Array.isArray(questions) && questions.length > 0
        ? questions.slice(0, 15)
        : [
            {
              promptText: `تمرین تکلیف «${title.trim()}» را با دقت انجام دادی؟`,
              options: ['بله، کامل انجام دادم', 'نیاز به راهنمایی دارم'],
              correctAnswer: 'بله، کامل انجام دادم',
              hintText: 'پس از حل کامل تمرین روی کاغذ یا کتاب درسی، گزینه اول را بزن.',
              explanation: 'آفرین بر تلاش منظم تو در انجام تکالیف مدرسه!',
            },
          ];

    const [created] = await db
      .insert(homeworks)
      .values({
        classroomId: classroomId ? Number(classroomId) : null,
        creatorUid: uid,
        creatorRole: classroomId ? 'teacher' : 'parent',
        gradeId: g,
        bookId: bookId || 'math',
        chapterId: (chapterId || 'فصل جاری').slice(0, 80),
        topicId: (topicId || 'تمرین کلاسی').slice(0, 80),
        title: title.trim().slice(0, 120),
        description: (description || '').trim().slice(0, 500),
        dueDate: (dueDate || '۱۴۰۴/۰۹/۰۵').slice(0, 30),
        questionsJson: JSON.stringify(safeQuestions),
        attachmentName: attachmentName ? String(attachmentName).slice(0, 120) : null,
      })
      .returning();

    if (classroomId) {
      await db.insert(announcements).values({
        classroomId: Number(classroomId),
        senderUid: uid,
        senderName: user.displayName,
        targetAudience: 'classroom',
        kind: 'homework',
        message: `تکلیف جدید ثبت شد: ${created.title} (مهلت: ${created.dueDate})`,
        scheduledDate: created.dueDate,
      });
    }

    res.status(201).json({
      homework: { ...created, questions: safeQuestions },
    });
  } catch (error: unknown) {
    console.error('POST /api/homeworks failed:', error);
    res.status(500).json({ error: 'ثبت تکلیف با خطا مواجه شد.' });
  }
});

studentsRouter.post('/homeworks/:id/submit', requireAuth, async (req: AuthRequest, res) => {
  try {
    const homeworkId = Number(req.params.id);
    const { studentId, answers, autoScore } = req.body as {
      studentId: number;
      answers: Array<{ promptText: string; studentAnswer: string; isCorrect: boolean }>;
      autoScore: number;
    };

    const access = await verifyStudentAccess(Number(studentId), req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    const { student } = access;

    const [hw] = await db.select().from(homeworks).where(eq(homeworks.id, homeworkId)).limit(1);
    if (!hw) return res.status(404).json({ error: 'تکلیف یافت نشد.' });

    const [submission] = await db
      .insert(homeworkSubmissions)
      .values({
        homeworkId,
        studentId: student.id,
        answersJson: JSON.stringify(answers || []),
        autoScore: Math.max(0, Math.min(100, Number(autoScore) || 0)),
        status: 'submitted',
      })
      .returning();

    const rewardCoins = 40;
    const [updatedStudent] = await db
      .update(studentProfiles)
      .set({
        coins: student.coins + rewardCoins,
        xp: student.xp + 60,
      })
      .where(eq(studentProfiles.id, student.id))
      .returning();

    res.status(201).json({ submission, student: sanitizeStudent(updatedStudent), rewardCoins });
  } catch (error: unknown) {
    console.error('POST /api/homeworks/:id/submit failed:', error);
    res.status(500).json({ error: 'ثبت ارسال تکلیف با خطا مواجه شد.' });
  }
});

studentsRouter.post('/exams', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res
        .status(403)
        .json({ error: 'برای طراحی آزمون اختصاصی نیاز به تأیید حساب معلم دارید.' });
    }
    const uid = caller.uid;
    const user = caller.user;

    const { classroomId, gradeId, bookId, examType, title, durationMinutes, maxScore, difficulty, questions } =
      req.body as {
        classroomId?: number | null;
        gradeId: number;
        bookId: BookId;
        examType: string;
        title: string;
        durationMinutes?: number;
        maxScore?: number;
        difficulty?: string;
        questions: Array<{
          id: string;
          topicId: string;
          bookId: string;
          promptText: string;
          options: string[];
          correctAnswer: string;
          explanation: string;
        }>;
      };

    if (!title?.trim() || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'عنوان آزمون و حداقل یک سؤال الزامی است.' });
    }

    const [created] = await db
      .insert(exams)
      .values({
        classroomId: classroomId ? Number(classroomId) : null,
        creatorUid: uid,
        gradeId: Number(gradeId),
        bookId: bookId || 'math',
        examType: examType || 'teacher_custom',
        title: title.trim().slice(0, 120),
        durationMinutes: Math.max(5, Math.min(90, Number(durationMinutes) || 15)),
        maxScore: Math.max(10, Math.min(100, Number(maxScore) || 20)),
        difficulty: difficulty || 'medium',
        questionsJson: JSON.stringify(questions),
      })
      .returning();

    if (classroomId) {
      await db.insert(announcements).values({
        classroomId: Number(classroomId),
        senderUid: uid,
        senderName: user.displayName,
        targetAudience: 'classroom',
        kind: 'exam',
        message: `آزمون جدید منتشر شد: ${created.title} (${created.durationMinutes} دقیقه)`,
      });
    }

    res.status(201).json({ exam: { ...created, questions } });
  } catch (error: unknown) {
    console.error('POST /api/exams failed:', error);
    res.status(500).json({ error: 'ثبت آزمون با خطا مواجه شد.' });
  }
});

studentsRouter.post('/exams/:id/submit', requireAuth, async (req: AuthRequest, res) => {
  try {
    const examId = Number(req.params.id);
    const { studentId, answers, durationSeconds } = req.body as {
      studentId: number;
      answers: Record<string, string>;
      durationSeconds: number;
    };

    const access = await verifyStudentAccess(Number(studentId), req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    const { student } = access;

    const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
    if (!exam) return res.status(404).json({ error: 'آزمون یافت نشد.' });
    if (exam.gradeId !== student.gradeId) {
      return res.status(403).json({ error: 'این آزمون مربوط به پایه تحصیلی دانش‌آموز نیست.' });
    }

    const questions = safeJsonParse<
      Array<{
        id: string;
        topicId: string;
        bookId: string;
        promptText: string;
        options: string[];
        correctAnswer: string;
        explanation: string;
      }>
    >(exam.questionsJson, []);

    let correctCount = 0;
    const wrongTopics: string[] = [];
    const strengths: string[] = [];
    const gradedAnswers = questions.map((q) => {
      const selected = (answers || {})[q.id] || '';
      const isCorrect = selected === q.correctAnswer;
      if (isCorrect) {
        correctCount += 1;
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
        topicId: q.topicId,
        isCorrect,
      };
    });

    const totalQuestions = Math.max(1, questions.length);
    const score = Math.round((correctCount / totalQuestions) * exam.maxScore);

    const [attempt] = await db
      .insert(examAttempts)
      .values({
        examId,
        studentId: student.id,
        score,
        maxScore: exam.maxScore,
        correctCount,
        totalQuestions,
        durationSeconds: Math.max(5, Number(durationSeconds) || 60),
        wrongTopicsJson: JSON.stringify([...new Set(wrongTopics)]),
        strengthsJson: JSON.stringify([...new Set(strengths)]),
        answersJson: JSON.stringify(gradedAnswers),
      })
      .returning();

    const [updatedStudent] = await db
      .update(studentProfiles)
      .set({
        coins: student.coins + 35,
        xp: student.xp + score * 5,
      })
      .where(eq(studentProfiles.id, student.id))
      .returning();

    res.status(201).json({
      attempt: {
        ...attempt,
        wrongTopics: [...new Set(wrongTopics)],
        strengths: [...new Set(strengths)],
        gradedAnswers,
      },
      student: sanitizeStudent(updatedStudent),
    });
  } catch (error: unknown) {
    console.error('POST /api/exams/:id/submit failed:', error);
    res.status(500).json({ error: 'ثبت نتیجه آزمون با خطا مواجه شد.' });
  }
});
