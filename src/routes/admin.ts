import { Router } from 'express';
import { count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  adEvents,
  announcements,
  classroomEnrollments,
  classrooms,
  educationalContent,
  examAttempts,
  missionAttempts,
  studentProfiles,
  users,
} from '../db/schema.ts';
import { ensureCurriculumSeeded } from '../db/seed.ts';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import {
  resolveCallerUser,
  sanitizeStudent,
  sanitizeUser,
} from '../lib/server-helpers.ts';

export const adminRouter = Router();

adminRouter.get('/admin/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureCurriculumSeeded();
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'این بخش مخصوص مدیر کل سامانه است.' });
    }

    const allUsersRaw = await db.select().from(users).orderBy(desc(users.createdAt));
    const userNameMap = new Map(allUsersRaw.map((u) => [u.uid, u.displayName]));
    const allUsers = allUsersRaw.map(sanitizeUser);

    const allStudents = (
      await db.select().from(studentProfiles).orderBy(desc(studentProfiles.createdAt))
    ).map(sanitizeStudent);

    const allClassroomsRaw = await db.select().from(classrooms).orderBy(desc(classrooms.createdAt));
    const allEnrollments = await db
      .select({
        classroomId: classroomEnrollments.classroomId,
        studentId: studentProfiles.id,
        nickname: studentProfiles.nickname,
        gradeId: studentProfiles.gradeId,
      })
      .from(classroomEnrollments)
      .innerJoin(studentProfiles, eq(classroomEnrollments.studentId, studentProfiles.id));

    const enrichedClassrooms = allClassroomsRaw.map((cls) => ({
      ...cls,
      teacherName: userNameMap.get(cls.teacherUid) || 'معلم سامانه',
      members: allEnrollments
        .filter((e) => e.classroomId === cls.id)
        .map((e) => ({ studentId: e.studentId, nickname: e.nickname, gradeId: e.gradeId })),
    }));

    const [{ attemptCount }] = await db.select({ attemptCount: count() }).from(missionAttempts);
    const [{ examAttemptCount }] = await db.select({ examAttemptCount: count() }).from(examAttempts);
    const allContent = await db
      .select()
      .from(educationalContent)
      .orderBy(desc(educationalContent.createdAt));
    const allAds = await db.select().from(adEvents).orderBy(desc(adEvents.createdAt)).limit(200);
    const globalAnnouncements = await db
      .select()
      .from(announcements)
      .where(isNull(announcements.classroomId))
      .orderBy(desc(announcements.createdAt));

    const rewardedCompleted = allAds.filter((a) => a.eventType === 'reward_completed').length;
    const rewardedSkipped = allAds.filter((a) => a.eventType === 'skipped').length;
    const totalCoinsPaid = allAds.reduce((sum, a) => sum + (a.rewardCoins || 0), 0);

    res.json({
      stats: {
        usersCount: allUsers.length,
        studentCount: allStudents.length,
        classCount: allClassroomsRaw.length,
        attemptCount: Number(attemptCount),
        examAttemptCount: Number(examAttemptCount),
        contentCount: allContent.length,
        pendingReviewCount: allContent.filter((c) => c.reviewStatus === 'pending_review').length,
      },
      adReport: {
        rewardedCompleted,
        rewardedSkipped,
        completionRate:
          rewardedCompleted + rewardedSkipped > 0
            ? Math.round((rewardedCompleted / (rewardedCompleted + rewardedSkipped)) * 100)
            : 0,
        totalCoinsPaid,
        estimatedTomanRevenue: rewardedCompleted * 450,
        confirmedTapsellRevenue: 0,
        tapsellConfigured: Boolean(
          process.env.TAPSELL_APP_KEY && process.env.TAPSELL_REWARDED_ZONE_ID
        ),
      },
      users: allUsers,
      students: allStudents,
      classrooms: enrichedClassrooms,
      globalAnnouncements,
      allContent: allContent.map((c) => ({
        id: c.id,
        gradeId: c.gradeId,
        bookId: c.bookId,
        chapterId: c.chapterId,
        topicId: c.topicId,
        questionType: c.questionType,
        promptText: c.promptText,
        correctAnswer: c.correctAnswer,
        hasImage: Boolean(c.imageDataUrl),
        contentSource: c.contentSource,
        reviewStatus: c.reviewStatus,
        rejectionReason: c.rejectionReason,
      })),
      pendingContent: allContent.filter((c) => c.reviewStatus === 'pending_review'),
      contentByGrade: [1, 2, 3, 4, 5, 6].map((g) => ({
        gradeId: g,
        total: allContent.filter((c) => c.gradeId === g && c.reviewStatus === 'approved').length,
      })),
    });
  } catch (error: unknown) {
    console.error('GET /api/admin/overview failed:', error);
    res.status(500).json({ error: 'خطا در دریافت آمار پنل مدیریت.' });
  }
});

adminRouter.post('/admin/announcements', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin' || !caller.user) {
      return res.status(403).json({ error: 'فقط مدیر کل مجاز به ارسال اطلاعیه سراسری است.' });
    }

    const { title, message, targetAudience, scheduledDate } = req.body as {
      title?: string;
      message?: string;
      targetAudience?: string;
      scheduledDate?: string;
    };

    const safeAudience = ['all', 'teachers', 'parents'].includes(String(targetAudience))
      ? String(targetAudience)
      : 'all';

    if (!message?.trim()) {
      return res.status(400).json({ error: 'متن اطلاعیه سراسری الزامی است.' });
    }

    const [created] = await db
      .insert(announcements)
      .values({
        classroomId: null,
        senderUid: caller.uid,
        senderName: caller.user.displayName,
        targetAudience: safeAudience,
        title: title ? String(title).trim().slice(0, 120) : null,
        kind: 'global',
        message: message.trim().slice(0, 500),
        scheduledDate: scheduledDate ? String(scheduledDate).trim().slice(0, 30) : null,
      })
      .returning();

    res.status(201).json({ announcement: created });
  } catch (error) {
    console.error('POST /api/admin/announcements failed:', error);
    res.status(500).json({ error: 'ارسال اطلاعیه سراسری با خطا مواجه شد.' });
  }
});

adminRouter.delete('/admin/announcements/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط مدیر کل مجاز به حذف اطلاعیه سراسری است.' });
    }
    const id = Number(req.params.id);
    await db.delete(announcements).where(eq(announcements.id, id));
    res.json({ deleted: true, id });
  } catch (error) {
    console.error('DELETE /api/admin/announcements/:id failed:', error);
    res.status(500).json({ error: 'حذف اطلاعیه با خطا مواجه شد.' });
  }
});

// Approval toggle: ONLY updates teacherApproved, NEVER overwrites user's role!
adminRouter.patch('/admin/teachers/:uid/approve', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط مدیر کل مجاز به تأیید حساب‌ها است.' });
    }

    const targetUid = String(req.params.uid);
    const [existing] = await db.select().from(users).where(eq(users.uid, targetUid)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'کاربر یافت نشد.' });
    }
    if (existing.role === 'admin') {
      return res.status(403).json({ error: 'وضعیت مدیر کل قابل تغییر نیست.' });
    }

    const approved = Boolean(req.body.approved);
    const [updated] = await db
      .update(users)
      .set({ teacherApproved: approved })
      .where(eq(users.uid, targetUid))
      .returning();

    res.json({ user: updated ? sanitizeUser(updated) : null });
  } catch (error: unknown) {
    console.error('PATCH /api/admin/teachers/:uid/approve failed:', error);
    res.status(500).json({ error: 'بروزرسانی وضعیت تأیید حساب با خطا مواجه شد.' });
  }
});

adminRouter.patch('/admin/users/:uid/role', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط مدیر کل مجاز به تغییر نقش کاربران است.' });
    }

    const targetUid = String(req.params.uid);
    const nextRole = String(req.body.role || '').trim();
    if (nextRole !== 'parent' && nextRole !== 'teacher') {
      return res.status(400).json({ error: 'نقش جدید باید «والدین» یا «معلم» باشد.' });
    }
    if (targetUid === caller.uid) {
      return res.status(403).json({ error: 'تغییر نقش حساب مدیر فعلی مجاز نیست.' });
    }

    const [existing] = await db.select().from(users).where(eq(users.uid, targetUid)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'کاربر یافت نشد.' });
    }
    if (existing.role === 'admin') {
      return res.status(403).json({ error: 'نقش مدیر کل قابل تغییر نیست.' });
    }

    const [updated] = await db
      .update(users)
      .set({ role: nextRole })
      .where(eq(users.uid, targetUid))
      .returning();

    res.json({ user: sanitizeUser(updated) });
  } catch (error: unknown) {
    console.error('PATCH /api/admin/users/:uid/role failed:', error);
    res.status(500).json({ error: 'تغییر نقش کاربر با خطا مواجه شد.' });
  }
});

adminRouter.patch('/admin/users/:uid/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط مدیر کل مجاز به تغییر وضعیت حساب است.' });
    }

    const targetUid = String(req.params.uid);
    if (targetUid === caller.uid) {
      return res.status(403).json({ error: 'غیرفعال‌سازی حساب مدیر فعلی مجاز نیست.' });
    }

    const [existing] = await db.select().from(users).where(eq(users.uid, targetUid)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'کاربر یافت نشد.' });
    }
    if (existing.role === 'admin') {
      return res.status(403).json({ error: 'حساب مدیر کل قابل غیرفعال‌سازی نیست.' });
    }

    const isActive = Boolean(req.body.isActive);
    const [updated] = await db
      .update(users)
      .set({ isActive })
      .where(eq(users.uid, targetUid))
      .returning();

    res.json({ user: sanitizeUser(updated) });
  } catch (error: unknown) {
    console.error('PATCH /api/admin/users/:uid/status failed:', error);
    res.status(500).json({ error: 'تغییر وضعیت فعال بودن حساب با خطا مواجه شد.' });
  }
});

adminRouter.delete('/admin/users/:uid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط مدیر کل مجاز به حذف حساب کاربری است.' });
    }

    const targetUid = String(req.params.uid);
    if (targetUid === caller.uid) {
      return res.status(403).json({ error: 'حذف حساب مدیر فعلی مجاز نیست.' });
    }

    const [existing] = await db.select().from(users).where(eq(users.uid, targetUid)).limit(1);
    if (!existing) {
      return res.status(404).json({ error: 'کاربر یافت نشد.' });
    }
    if (existing.role === 'admin') {
      return res.status(403).json({ error: 'حساب مدیر کل قابل حذف نیست.' });
    }

    await db.transaction(async (tx) => {
      await tx.delete(studentProfiles).where(eq(studentProfiles.parentUid, targetUid));
      await tx.delete(users).where(eq(users.uid, targetUid));
    });

    res.json({ deleted: true, uid: targetUid });
  } catch (error: unknown) {
    console.error('DELETE /api/admin/users/:uid failed:', error);
    res.status(500).json({ error: 'حذف حساب کاربری با خطا مواجه شد.' });
  }
});

adminRouter.patch('/admin/classrooms/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط مدیر کل مجاز است.' });
    }
    const id = Number(req.params.id);
    const isActive = Boolean(req.body.isActive);
    const [updated] = await db
      .update(classrooms)
      .set({ isActive })
      .where(eq(classrooms.id, id))
      .returning();
    res.json({ classroom: updated });
  } catch (error) {
    console.error('PATCH /api/admin/classrooms/:id failed:', error);
    res.status(500).json({ error: 'تغییر وضعیت کلاس ناموفق بود.' });
  }
});

adminRouter.delete('/admin/content/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط مدیر کل مجاز به حذف محتوا است.' });
    }
    const id = Number(req.params.id);
    await db.delete(educationalContent).where(eq(educationalContent.id, id));
    res.json({ deleted: true, id });
  } catch (error) {
    console.error('DELETE /api/admin/content/:id failed:', error);
    res.status(500).json({ error: 'حذف محتوا با خطا مواجه شد.' });
  }
});
