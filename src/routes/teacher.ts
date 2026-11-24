import { Router } from 'express';
import crypto from 'crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
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
} from '../db/schema.ts';
import { ensureCurriculumSeeded } from '../db/seed.ts';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import {
  BookId,
  QuestionType,
  REALMS,
  REALM_BY_BOOK,
} from '../shared/curriculum.ts';
import {
  analyzePerformanceWithAI,
  convertHomeworkWithAI,
  explainMistakeWithAI,
  generateTeacherQuestionWithAI,
} from '../lib/gemini.ts';
import {
  isValidHttpUrl,
  isValidSafeImage,
  resolveCallerUser,
  safeJsonParse,
  sanitizeUser,
  verifyStudentAccess,
} from '../lib/server-helpers.ts';

export const teacherRouter = Router();

teacherRouter.get('/teacher/dashboard', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureCurriculumSeeded();
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'teacher' && caller.role !== 'admin')
    ) {
      return res
        .status(403)
        .json({ error: 'دسترسی به پنل معلم فقط برای حساب‌های معلم مجاز است.' });
    }
    const uid = caller.uid;

    const myClasses = await db
      .select()
      .from(classrooms)
      .where(eq(classrooms.teacherUid, uid))
      .orderBy(desc(classrooms.createdAt));

    const classIds = myClasses.map((c) => c.id);

    const enrollments =
      classIds.length > 0
        ? await db
            .select({
              classroomId: classroomEnrollments.classroomId,
              studentId: studentProfiles.id,
              nickname: studentProfiles.nickname,
              gradeId: studentProfiles.gradeId,
              xp: studentProfiles.xp,
              coins: studentProfiles.coins,
            })
            .from(classroomEnrollments)
            .innerJoin(studentProfiles, eq(classroomEnrollments.studentId, studentProfiles.id))
            .where(inArray(classroomEnrollments.classroomId, classIds))
        : [];

    const studentIds = [...new Set(enrollments.map((e) => e.studentId))];

    const myQuestions = await db
      .select()
      .from(educationalContent)
      .where(eq(educationalContent.authorUid, uid))
      .orderBy(desc(educationalContent.createdAt));

    const myHomeworks = await db
      .select()
      .from(homeworks)
      .where(eq(homeworks.creatorUid, uid))
      .orderBy(desc(homeworks.createdAt));

    const hwIds = myHomeworks.map((h) => h.id);
    const submissions =
      hwIds.length > 0
        ? await db
            .select({
              id: homeworkSubmissions.id,
              homeworkId: homeworkSubmissions.homeworkId,
              studentId: homeworkSubmissions.studentId,
              studentName: studentProfiles.nickname,
              autoScore: homeworkSubmissions.autoScore,
              teacherScore: homeworkSubmissions.teacherScore,
              teacherFeedback: homeworkSubmissions.teacherFeedback,
              status: homeworkSubmissions.status,
              answersJson: homeworkSubmissions.answersJson,
              submittedAt: homeworkSubmissions.submittedAt,
            })
            .from(homeworkSubmissions)
            .innerJoin(studentProfiles, eq(homeworkSubmissions.studentId, studentProfiles.id))
            .where(inArray(homeworkSubmissions.homeworkId, hwIds))
            .orderBy(desc(homeworkSubmissions.submittedAt))
        : [];

    const myExams = await db
      .select()
      .from(exams)
      .where(eq(exams.creatorUid, uid))
      .orderBy(desc(exams.createdAt));

    const myExamIds = myExams.map((e) => e.id);

    const studentMissionAttempts =
      studentIds.length > 0
        ? await db
            .select()
            .from(missionAttempts)
            .where(inArray(missionAttempts.studentId, studentIds))
        : [];

    const studentExamAttemptsRaw =
      myExamIds.length > 0 || studentIds.length > 0
        ? await db
            .select({
              id: examAttempts.id,
              examId: examAttempts.examId,
              examTitle: exams.title,
              classroomId: exams.classroomId,
              studentId: examAttempts.studentId,
              studentName: studentProfiles.nickname,
              score: examAttempts.score,
              maxScore: examAttempts.maxScore,
              correctCount: examAttempts.correctCount,
              totalQuestions: examAttempts.totalQuestions,
              teacherScore: examAttempts.teacherScore,
              teacherFeedback: examAttempts.teacherFeedback,
              completedAt: examAttempts.completedAt,
            })
            .from(examAttempts)
            .innerJoin(exams, eq(examAttempts.examId, exams.id))
            .innerJoin(studentProfiles, eq(examAttempts.studentId, studentProfiles.id))
            .orderBy(desc(examAttempts.completedAt))
        : [];

    const studentIdSet = new Set(studentIds);
    const myExamIdSet = new Set(myExamIds);
    const relevantExamAttempts = studentExamAttemptsRaw.filter(
      (ea) => myExamIdSet.has(ea.examId) || studentIdSet.has(ea.studentId)
    );

    const classStudentStats = enrollments.map((en) => {
      const mAtt = studentMissionAttempts.filter((a) => a.studentId === en.studentId);
      const solvedMissionsCount = mAtt.filter((a) => a.isCorrect).length;
      const correctRate =
        mAtt.length > 0 ? Math.round((solvedMissionsCount / mAtt.length) * 100) : 0;

      const wrongTopicCounts = new Map<string, number>();
      for (const a of mAtt) {
        if (!a.isCorrect) {
          wrongTopicCounts.set(a.topicId, (wrongTopicCounts.get(a.topicId) || 0) + 1);
        }
      }
      const weakTopics = [...wrongTopicCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([t]) => t);

      const classHws = myHomeworks.filter((h) => h.classroomId === en.classroomId);
      const classHwIds = new Set(classHws.map((h) => h.id));
      const submittedHomeworksCount = submissions.filter(
        (s) => s.studentId === en.studentId && classHwIds.has(s.homeworkId)
      ).length;

      const sExams = relevantExamAttempts.filter((ea) => ea.studentId === en.studentId);
      const avgExamScorePct =
        sExams.length > 0
          ? Math.round(
              sExams.reduce(
                (acc, ea) => acc + (ea.maxScore > 0 ? (ea.score / ea.maxScore) * 100 : 0),
                0
              ) / sExams.length
            )
          : null;

      return {
        classroomId: en.classroomId,
        studentId: en.studentId,
        nickname: en.nickname,
        gradeId: en.gradeId,
        xp: en.xp,
        coins: en.coins,
        solvedMissionsCount,
        totalAttempts: mAtt.length,
        correctRate,
        submittedHomeworksCount,
        totalClassHomeworks: classHws.length,
        examCount: sExams.length,
        avgExamScorePct,
        weakTopics,
      };
    });

    const myVideos = await db
      .select()
      .from(teacherVideos)
      .where(eq(teacherVideos.teacherUid, uid))
      .orderBy(desc(teacherVideos.createdAt));

    const myAnnouncements =
      classIds.length > 0
        ? await db
            .select()
            .from(announcements)
            .where(inArray(announcements.classroomId, classIds))
            .orderBy(desc(announcements.createdAt))
        : [];

    const globalAnnouncements = await db
      .select()
      .from(announcements)
      .where(
        and(
          isNull(announcements.classroomId),
          inArray(announcements.targetAudience, ['all', 'teachers'])
        )
      )
      .orderBy(desc(announcements.createdAt))
      .limit(15);

    res.json({
      user: sanitizeUser(caller.user),
      classrooms: myClasses,
      enrollments,
      classStudentStats,
      questions: myQuestions.map((q) => ({
        ...q,
        payload: safeJsonParse<Record<string, unknown>>(q.payloadJson, {}),
      })),
      homeworks: myHomeworks,
      submissions,
      exams: myExams,
      examAttempts: relevantExamAttempts,
      videos: myVideos,
      announcements: myAnnouncements,
      globalAnnouncements,
    });
  } catch (error: unknown) {
    console.error('GET /api/teacher/dashboard failed:', error);
    res.status(500).json({ error: 'بارگذاری داشبورد معلم با خطا مواجه شد.' });
  }
});

teacherRouter.post('/teacher/classrooms', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res
        .status(403)
        .json({ error: 'حساب معلم شما هنوز توسط مدیر سامانه تأیید نشده است.' });
    }

    const { name, gradeId, subjects } = req.body as {
      name?: string;
      gradeId?: number;
      subjects?: string[];
    };
    const g = Number(gradeId);
    if (!name?.trim() || !Number.isInteger(g) || g < 1 || g > 6) {
      return res.status(400).json({ error: 'نام کلاس و پایه تحصیلی معتبر الزامی است.' });
    }

    const joinCode = `HR${g}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const [created] = await db
      .insert(classrooms)
      .values({
        teacherUid: caller.uid,
        name: name.trim().slice(0, 80),
        gradeId: g,
        subjects: JSON.stringify(
          Array.isArray(subjects) && subjects.length ? subjects : ['math', 'persian', 'science']
        ),
        joinCode,
      })
      .returning();

    res.status(201).json({ classroom: created });
  } catch (error: unknown) {
    console.error('POST /api/teacher/classrooms failed:', error);
    res.status(500).json({ error: 'ساخت کلاس جدید با خطا مواجه شد.' });
  }
});

teacherRouter.patch('/teacher/classrooms/:id/status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const [cls] = await db.select().from(classrooms).where(eq(classrooms.id, id)).limit(1);
    if (!cls) return res.status(404).json({ error: 'کلاس یافت نشد.' });
    if (cls.teacherUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط معلم این کلاس یا مدیر کل مجاز به تغییر وضعیت است.' });
    }

    const isActive = Boolean(req.body.isActive);
    const [updated] = await db
      .update(classrooms)
      .set({ isActive })
      .where(eq(classrooms.id, id))
      .returning();

    res.json({ classroom: updated });
  } catch (error) {
    console.error('PATCH /api/teacher/classrooms/:id/status failed:', error);
    res.status(500).json({ error: 'بروزرسانی وضعیت کلاس با خطا مواجه شد.' });
  }
});

teacherRouter.post('/teacher/questions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده و مدیر است.' });
    }

    const {
      gradeId,
      bookId,
      chapterId,
      topicId,
      difficulty,
      learningObjective,
      storyIntro,
      hintText,
      questionType,
      promptText,
      imageDataUrl,
      payload,
      correctAnswer,
      explanation,
      contentSource,
      reviewStatus,
    } = req.body as {
      gradeId: number;
      bookId: BookId;
      chapterId: string;
      topicId: string;
      difficulty: string;
      learningObjective: string;
      storyIntro: string;
      hintText: string;
      questionType: QuestionType;
      promptText: string;
      imageDataUrl?: string | null;
      payload: Record<string, unknown>;
      correctAnswer: string;
      explanation: string;
      contentSource?: string;
      reviewStatus?: string;
    };

    const g = Number(gradeId);
    if (!Number.isInteger(g) || g < 1 || g > 6 || !promptText?.trim() || !correctAnswer?.trim()) {
      return res.status(400).json({ error: 'پایه تحصیلی، متن سؤال و پاسخ صحیح الزامی است.' });
    }

    const safeImage = imageDataUrl ? isValidSafeImage(imageDataUrl) : null;
    if (imageDataUrl && !safeImage) {
      return res
        .status(400)
        .json({ error: 'فرمت تصویر مجاز نیست (فقط JPG/PNG/WebP کمتر از ۲ مگابایت).' });
    }

    const realmId = REALM_BY_BOOK[bookId] || 'city_numbers';
    const isAi = contentSource === 'ai_generated';
    const resolvedSource = isAi
      ? 'ai_generated'
      : caller.role === 'admin' && contentSource === 'official_curriculum'
        ? 'official_curriculum'
        : 'teacher';

    // Only admin can publish directly; teacher-authored questions always enter pending_review
    const resolvedStatus =
      caller.role === 'admin' && reviewStatus === 'approved' ? 'approved' : 'pending_review';

    const [created] = await db
      .insert(educationalContent)
      .values({
        gradeId: g,
        bookId: bookId || 'math',
        realmId,
        chapterId: (chapterId || 'فصل اختیاری معلم').slice(0, 80),
        topicId: (topicId || 'مبحث کلاسی').slice(0, 80),
        difficulty: difficulty || 'medium',
        learningObjective: (learningObjective || 'تثبیت یادگیری درس').slice(0, 200),
        storyIntro: (storyIntro || 'مأموریت ویژه معلم کلاس برای قهرمانان!').slice(0, 240),
        hintText: (hintText || 'صورت سؤال را با دقت بخوان.').slice(0, 200),
        questionType: questionType || 'mcq',
        promptText: promptText.trim().slice(0, 450),
        imageDataUrl: safeImage,
        payloadJson: JSON.stringify(payload || { options: ['گزینه ۱', 'گزینه ۲'] }),
        correctAnswer: correctAnswer.trim(),
        explanation: (explanation || 'پاسخ درست را با دقت مرور کن.').slice(0, 450),
        contentSource: resolvedSource,
        reviewStatus: resolvedStatus,
        rejectionReason: null,
        authorUid: caller.uid,
      })
      .returning();

    res.status(201).json({ question: created });
  } catch (error: unknown) {
    console.error('POST /api/teacher/questions failed:', error);
    res.status(500).json({ error: 'ذخیره سؤال جدید با خطا مواجه شد.' });
  }
});

// Teacher edits own pending/rejected question and resubmits for admin approval
teacherRouter.patch('/teacher/questions/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const [existing] = await db
      .select()
      .from(educationalContent)
      .where(eq(educationalContent.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'سؤال یافت نشد.' });
    if (existing.authorUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط طراح سؤال مجاز به ویرایش آن است.' });
    }
    if (caller.role !== 'admin' && existing.reviewStatus === 'approved') {
      return res.status(403).json({ error: 'سؤال‌های منتشرشده فقط توسط مدیر کل قابل ویرایش هستند.' });
    }

    const { promptText, correctAnswer, topicId, chapterId, hintText, explanation, gradeId, bookId } =
      req.body as {
        promptText?: string;
        correctAnswer?: string;
        topicId?: string;
        chapterId?: string;
        hintText?: string;
        explanation?: string;
        gradeId?: number;
        bookId?: BookId;
      };

    const updates: Partial<typeof educationalContent.$inferInsert> = {};
    if (typeof promptText === 'string' && promptText.trim()) {
      updates.promptText = promptText.trim().slice(0, 450);
    }
    if (typeof correctAnswer === 'string' && correctAnswer.trim()) {
      updates.correctAnswer = correctAnswer.trim();
    }
    if (typeof topicId === 'string' && topicId.trim()) {
      updates.topicId = topicId.trim().slice(0, 80);
    }
    if (typeof chapterId === 'string' && chapterId.trim()) {
      updates.chapterId = chapterId.trim().slice(0, 80);
    }
    if (typeof hintText === 'string' && hintText.trim()) {
      updates.hintText = hintText.trim().slice(0, 200);
    }
    if (typeof explanation === 'string' && explanation.trim()) {
      updates.explanation = explanation.trim().slice(0, 450);
    }
    if (gradeId !== undefined) {
      const g = Number(gradeId);
      if (Number.isInteger(g) && g >= 1 && g <= 6) updates.gradeId = g;
    }
    if (bookId && REALM_BY_BOOK[bookId]) {
      updates.bookId = bookId;
      updates.realmId = REALM_BY_BOOK[bookId];
    }

    // Resubmit to pending_review if edited by teacher
    if (caller.role !== 'admin') {
      updates.reviewStatus = 'pending_review';
      updates.rejectionReason = null;
    }

    const [updated] = await db
      .update(educationalContent)
      .set(updates)
      .where(eq(educationalContent.id, id))
      .returning();

    res.json({ question: updated });
  } catch (error) {
    console.error('PATCH /api/teacher/questions/:id failed:', error);
    res.status(500).json({ error: 'ویرایش سؤال با خطا مواجه شد.' });
  }
});

teacherRouter.delete('/teacher/questions/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const [existing] = await db
      .select()
      .from(educationalContent)
      .where(eq(educationalContent.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'سؤال یافت نشد.' });
    if (existing.authorUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط طراح سؤال مجاز به حذف آن است.' });
    }
    if (caller.role !== 'admin' && existing.reviewStatus === 'approved') {
      return res.status(403).json({ error: 'سؤال‌های منتشرشده فقط توسط مدیر کل قابل حذف هستند.' });
    }

    await db.delete(educationalContent).where(eq(educationalContent.id, id));
    res.json({ deleted: true, id });
  } catch (error) {
    console.error('DELETE /api/teacher/questions/:id failed:', error);
    res.status(500).json({ error: 'حذف سؤال با خطا مواجه شد.' });
  }
});

// Admin-only content approval / rejection with optional rejectionReason
teacherRouter.patch('/teacher/questions/:id/approve', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || !caller.user || caller.role !== 'admin') {
      return res.status(403).json({ error: 'تأیید یا رد نهایی سؤالات فقط توسط مدیر کل انجام می‌شود.' });
    }

    const [q] = await db
      .select()
      .from(educationalContent)
      .where(eq(educationalContent.id, id))
      .limit(1);
    if (!q) return res.status(404).json({ error: 'سؤال یافت نشد.' });

    const nextStatus = req.body.reviewStatus === 'rejected' ? 'rejected' : 'approved';
    const rawReason =
      nextStatus === 'rejected' && typeof req.body.rejectionReason === 'string'
        ? req.body.rejectionReason.trim().slice(0, 300) || 'نیازمند اصلاح و بازبینی محتوایی'
        : null;

    const [updated] = await db
      .update(educationalContent)
      .set({ reviewStatus: nextStatus, rejectionReason: rawReason })
      .where(eq(educationalContent.id, id))
      .returning();

    res.json({ question: updated });
  } catch (error: unknown) {
    console.error('PATCH /api/teacher/questions/:id/approve failed:', error);
    res.status(500).json({ error: 'بروزرسانی وضعیت تأیید سؤال با خطا مواجه شد.' });
  }
});

teacherRouter.post('/teacher/videos', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const {
      classroomId,
      gradeId,
      bookId,
      chapterId,
      title,
      description,
      durationLabel,
      videoUrl,
      followUpQuestion,
    } = req.body as {
      classroomId?: number;
      gradeId: number;
      bookId: BookId;
      chapterId: string;
      title: string;
      description: string;
      durationLabel?: string;
      videoUrl: string;
      followUpQuestion?: {
        promptText: string;
        options: string[];
        correctAnswer: string;
      };
    };

    if (!title?.trim() || !videoUrl?.trim() || !isValidHttpUrl(videoUrl.trim())) {
      return res
        .status(400)
        .json({ error: 'عنوان و لینک معتبر ویدیو (http/https) الزامی است.' });
    }

    const safeFollowUp = followUpQuestion?.promptText
      ? followUpQuestion
      : {
          promptText: `آیا نکته کلیدی فیلم «${title.trim()}» را به خوبی یاد گرفتی؟`,
          options: ['بله، کاملاً یاد گرفتم', 'می‌خواهم دوباره ببینم'],
          correctAnswer: 'بله، کاملاً یاد گرفتم',
        };

    const [created] = await db
      .insert(teacherVideos)
      .values({
        classroomId: classroomId ? Number(classroomId) : null,
        teacherUid: caller.uid,
        gradeId: Number(gradeId) || 1,
        bookId: bookId || 'math',
        chapterId: (chapterId || 'درس آموزشی').slice(0, 80),
        title: title.trim().slice(0, 120),
        description: (description || '').trim().slice(0, 400),
        durationLabel: (durationLabel || '05:00').slice(0, 15),
        videoUrl: videoUrl.trim().slice(0, 500),
        followUpQuestionJson: JSON.stringify(safeFollowUp),
      })
      .returning();

    if (classroomId) {
      await db.insert(announcements).values({
        classroomId: Number(classroomId),
        senderUid: caller.uid,
        senderName: caller.user.displayName,
        targetAudience: 'classroom',
        kind: 'video',
        message: `فیلم آموزشی جدید منتشر شد: ${created.title}`,
      });
    }

    res.status(201).json({ video: created });
  } catch (error: unknown) {
    console.error('POST /api/teacher/videos failed:', error);
    res.status(500).json({ error: 'انتشار فیلم آموزشی با خطا مواجه شد.' });
  }
});

teacherRouter.delete('/teacher/videos/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const [existing] = await db
      .select()
      .from(teacherVideos)
      .where(eq(teacherVideos.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'ویدیو یافت نشد.' });
    if (existing.teacherUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط معلم منتشرکننده مجاز به حذف این ویدیو است.' });
    }

    await db.delete(teacherVideos).where(eq(teacherVideos.id, id));
    res.json({ deleted: true, id });
  } catch (error) {
    console.error('DELETE /api/teacher/videos/:id failed:', error);
    res.status(500).json({ error: 'حذف ویدیوی آموزشی با خطا مواجه شد.' });
  }
});

teacherRouter.patch('/teacher/submissions/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلم است.' });
    }

    const [sub] = await db
      .select()
      .from(homeworkSubmissions)
      .where(eq(homeworkSubmissions.id, id))
      .limit(1);
    if (!sub) return res.status(404).json({ error: 'ارسال تکلیف یافت نشد.' });

    const [hw] = await db
      .select()
      .from(homeworks)
      .where(eq(homeworks.id, sub.homeworkId))
      .limit(1);
    if (caller.role !== 'admin' && (!hw || hw.creatorUid !== caller.uid)) {
      return res.status(403).json({ error: 'فقط معلم تعریف‌کننده این تکلیف مجاز به تصحیح است.' });
    }

    const { teacherScore, teacherFeedback, status } = req.body as {
      teacherScore?: number;
      teacherFeedback?: string;
      status?: string;
    };

    const safeStatus = ['graded', 'needs_revision'].includes(String(status))
      ? String(status)
      : 'graded';
    const [updated] = await db
      .update(homeworkSubmissions)
      .set({
        teacherScore:
          teacherScore !== undefined && teacherScore !== null
            ? Math.max(0, Math.min(20, Number(teacherScore)))
            : null,
        teacherFeedback: (teacherFeedback || '').trim().slice(0, 400),
        status: safeStatus,
      })
      .where(eq(homeworkSubmissions.id, id))
      .returning();

    res.json({ submission: updated });
  } catch (error: unknown) {
    console.error('PATCH /api/teacher/submissions/:id failed:', error);
    res.status(500).json({ error: 'ثبت تصحیح تکلیف با خطا مواجه شد.' });
  }
});

teacherRouter.patch('/teacher/exam-attempts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلم تأییدشده است.' });
    }

    const [attempt] = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.id, id))
      .limit(1);
    if (!attempt) return res.status(404).json({ error: 'کارنامه آزمون یافت نشد.' });

    const { teacherScore, teacherFeedback } = req.body as {
      teacherScore?: number | null;
      teacherFeedback?: string;
    };

    const [updated] = await db
      .update(examAttempts)
      .set({
        teacherScore:
          teacherScore !== undefined && teacherScore !== null
            ? Math.max(0, Math.min(attempt.maxScore, Number(teacherScore)))
            : attempt.teacherScore,
        teacherFeedback: (teacherFeedback || '').trim().slice(0, 400) || null,
      })
      .where(eq(examAttempts.id, id))
      .returning();

    res.json({ examAttempt: updated });
  } catch (error) {
    console.error('PATCH /api/teacher/exam-attempts/:id failed:', error);
    res.status(500).json({ error: 'ثبت بازخورد آزمون با خطا مواجه شد.' });
  }
});

teacherRouter.post('/teacher/announcements', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const { classroomId, kind, title, message, scheduledDate } = req.body as {
      classroomId: number;
      kind?: string;
      title?: string;
      message: string;
      scheduledDate?: string;
    };

    if (!classroomId || !message?.trim()) {
      return res.status(400).json({ error: 'انتخاب کلاس و متن پیام آموزشی الزامی است.' });
    }

    const [cls] = await db
      .select()
      .from(classrooms)
      .where(eq(classrooms.id, Number(classroomId)))
      .limit(1);
    if (!cls || (cls.teacherUid !== caller.uid && caller.role !== 'admin')) {
      return res.status(403).json({ error: 'فقط معلم این کلاس مجاز به ارسال اطلاعیه است.' });
    }

    const [created] = await db
      .insert(announcements)
      .values({
        classroomId: Number(classroomId),
        senderUid: caller.uid,
        senderName: caller.user.displayName,
        targetAudience: 'classroom',
        title: title ? String(title).trim().slice(0, 120) : null,
        kind: kind || 'encouragement',
        message: message.trim().slice(0, 400),
        scheduledDate: scheduledDate ? String(scheduledDate).slice(0, 30) : null,
      })
      .returning();

    res.status(201).json({ announcement: created });
  } catch (error: unknown) {
    console.error('POST /api/teacher/announcements failed:', error);
    res.status(500).json({ error: 'ارسال اعلان آموزشی با خطا مواجه شد.' });
  }
});

teacherRouter.post('/ai/explain', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { gradeId, bookId, promptText, studentAnswer, correctAnswer } = req.body as {
      gradeId: number;
      bookId: BookId;
      promptText: string;
      studentAnswer: string;
      correctAnswer: string;
    };
    const realm = REALMS.find((r) => r.bookId === bookId);
    const explanation = await explainMistakeWithAI({
      gradeId: Number(gradeId) || 1,
      bookTitle: realm?.bookTitle || 'درسی',
      promptText: String(promptText || ''),
      studentAnswer: String(studentAnswer || ''),
      correctAnswer: String(correctAnswer || ''),
    });
    res.json({ explanation });
  } catch (error: unknown) {
    console.error('POST /api/ai/explain failed:', error);
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : 'ارتباط با دستیار آموزشی هوش مصنوعی برقرار نشد.',
    });
  }
});

teacherRouter.post('/ai/generate-question', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی به تولید سؤال هوشمند ویژه معلمان تأییدشده است.' });
    }

    const { gradeId, bookId, chapterId, topicId, difficulty, questionType } = req.body as {
      gradeId: number;
      bookId: BookId;
      chapterId: string;
      topicId: string;
      difficulty: string;
      questionType: 'mcq' | 'true_false' | 'fill_blank' | 'pattern_puzzle';
    };

    const realm = REALMS.find((r) => r.bookId === bookId);
    const generated = await generateTeacherQuestionWithAI({
      gradeId: Number(gradeId) || 3,
      bookId: bookId || 'math',
      bookTitle: realm?.bookTitle || 'ریاضی',
      chapterId: chapterId || 'فصل جاری',
      topicId: topicId || 'تمرین اصلی',
      difficulty: difficulty || 'medium',
      questionType: questionType || 'mcq',
    });

    const payload =
      questionType === 'fill_blank'
        ? { choices: generated.options }
        : questionType === 'pattern_puzzle'
          ? { sequence: generated.sequence || ['۲', '۴', '۶', '؟'], options: generated.options }
          : { options: generated.options };

    const [savedDraft] = await db
      .insert(educationalContent)
      .values({
        gradeId: Number(gradeId) || 3,
        bookId: bookId || 'math',
        realmId: REALM_BY_BOOK[bookId] || 'city_numbers',
        chapterId: (chapterId || 'فصل جاری').slice(0, 80),
        topicId: (topicId || 'مبحث هوشمند').slice(0, 80),
        difficulty: difficulty || 'medium',
        learningObjective: generated.learningObjective,
        storyIntro: generated.storyIntro,
        hintText: generated.hintText,
        questionType: questionType || 'mcq',
        promptText: generated.promptText,
        payloadJson: JSON.stringify(payload),
        correctAnswer: generated.correctAnswer,
        explanation: generated.explanation,
        contentSource: 'ai_generated',
        reviewStatus: 'pending_review',
        rejectionReason: null,
        authorUid: caller.uid,
      })
      .returning();

    res.status(201).json({ draft: savedDraft });
  } catch (error: unknown) {
    console.error('POST /api/ai/generate-question failed:', error);
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : 'تولید سؤال هوشمند با خطا مواجه شد.',
    });
  }
});

teacherRouter.post('/ai/convert-homework', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession) {
      return res.status(403).json({ error: 'تبدیل تکلیف توسط والدین یا معلم انجام می‌شود.' });
    }
    const { gradeId, bookId, rawText, imageBase64, imageMimeType } = req.body as {
      gradeId: number;
      bookId: BookId;
      rawText?: string;
      imageBase64?: string;
      imageMimeType?: string;
    };

    const realm = REALMS.find((r) => r.bookId === bookId);
    const result = await convertHomeworkWithAI({
      gradeId: Number(gradeId) || 3,
      bookTitle: realm?.bookTitle || 'ریاضی',
      rawText: String(rawText || ''),
      imageBase64,
      imageMimeType,
    });

    res.json(result);
  } catch (error: unknown) {
    console.error('POST /api/ai/convert-homework failed:', error);
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : 'تبدیل تکلیف به مأموریت بازی با خطا مواجه شد.',
    });
  }
});

teacherRouter.post('/ai/analyze-progress', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { studentId } = req.body as { studentId: number };
    const access = await verifyStudentAccess(Number(studentId), req);
    if (access.status !== 'ok' || access.caller.isStudentSession) {
      return res.status(403).json({ error: 'دسترسی به تحلیل این دانش‌آموز مجاز نیست.' });
    }
    const { student } = access;

    const attempts = await db
      .select()
      .from(missionAttempts)
      .where(eq(missionAttempts.studentId, student.id))
      .orderBy(desc(missionAttempts.createdAt))
      .limit(30);

    const examHistory = await db
      .select()
      .from(examAttempts)
      .where(eq(examAttempts.studentId, student.id))
      .orderBy(desc(examAttempts.completedAt))
      .limit(10);

    const total = attempts.length;
    const correct = attempts.filter((a) => a.isCorrect).length;
    const weakTopics = attempts.filter((a) => !a.isCorrect).map((a) => a.topicId);
    const strongTopics = attempts.filter((a) => a.isCorrect).map((a) => a.topicId);

    const summaryText = `تعداد مأموریت‌های اخیر: ${total} (پاسخ درست: ${correct}).
مباحث قوی: ${[...new Set(strongTopics)].slice(0, 6).join('، ') || 'در حال ارزیابی'}.
مباحث نیازمند تمرین: ${[...new Set(weakTopics)].slice(0, 6).join('، ') || 'بدون خطای ثبت‌شده'}.
تعداد آزمون‌های شرکت‌کرده: ${examHistory.length}، آخرین نمره: ${
      examHistory[0] ? `${examHistory[0].score} از ${examHistory[0].maxScore}` : 'ثبت نشده'
    }.`;

    const analysis = await analyzePerformanceWithAI({
      studentName: student.nickname,
      gradeId: student.gradeId,
      summaryText,
    });

    res.json({ analysis });
  } catch (error: unknown) {
    console.error('POST /api/ai/analyze-progress failed:', error);
    res.status(502).json({
      error:
        error instanceof Error
          ? error.message
          : 'تحلیل هوشمند پیشرفت با خطا مواجه شد.',
    });
  }
});
