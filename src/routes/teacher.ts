import { Router } from 'express';
import crypto from 'crypto';
import { and, desc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
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
  users,
} from '../db/schema.ts';
import { ensureCurriculumSeeded } from '../db/seed.ts';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import {
  BookId,
  DifficultyLevel,
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
import { createNotifications, notifyAllAdmins } from '../lib/gamification.ts';

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
              heroClass: studentProfiles.heroClass,
              xp: studentProfiles.xp,
              coins: studentProfiles.coins,
              currentStreak: studentProfiles.currentStreak,
              minutesUsedToday: studentProfiles.minutesUsedToday,
              dailyLimitMinutes: studentProfiles.dailyLimitMinutes,
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

    const myQuestionIds = myQuestions.map((q) => q.id);
    const questionResponsesRaw =
      myQuestionIds.length > 0
        ? await db
            .select({
              id: missionAttempts.id,
              contentId: missionAttempts.contentId,
              studentId: missionAttempts.studentId,
              studentName: studentProfiles.nickname,
              studentAnswer: missionAttempts.studentAnswer,
              isCorrect: missionAttempts.isCorrect,
              durationSeconds: missionAttempts.durationSeconds,
              createdAt: missionAttempts.createdAt,
            })
            .from(missionAttempts)
            .innerJoin(studentProfiles, eq(missionAttempts.studentId, studentProfiles.id))
            .where(inArray(missionAttempts.contentId, myQuestionIds))
            .orderBy(desc(missionAttempts.createdAt))
            .limit(250)
        : [];

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
              durationSeconds: examAttempts.durationSeconds,
              wrongTopicsJson: examAttempts.wrongTopicsJson,
              strengthsJson: examAttempts.strengthsJson,
              answersJson: examAttempts.answersJson,
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
    const relevantExamAttempts = studentExamAttemptsRaw
      .filter((ea) => myExamIdSet.has(ea.examId) || studentIdSet.has(ea.studentId))
      .map((ea) => ({
        id: ea.id,
        examId: ea.examId,
        examTitle: ea.examTitle,
        classroomId: ea.classroomId,
        studentId: ea.studentId,
        studentName: ea.studentName,
        score: ea.score,
        maxScore: ea.maxScore,
        correctCount: ea.correctCount,
        totalQuestions: ea.totalQuestions,
        durationSeconds: ea.durationSeconds,
        wrongTopics: safeJsonParse<string[]>(ea.wrongTopicsJson, []),
        strengths: safeJsonParse<string[]>(ea.strengthsJson, []),
        gradedAnswers: safeJsonParse<
          Array<{
            id: string;
            promptText: string;
            selected: string;
            correctAnswer: string;
            topicId: string;
            isCorrect: boolean;
          }>
        >(ea.answersJson, []),
        teacherScore: ea.teacherScore,
        teacherFeedback: ea.teacherFeedback,
        completedAt: ea.completedAt,
      }));

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
        currentStreak: en.currentStreak || 1,
        minutesUsedToday: en.minutesUsedToday || 0,
        dailyLimitMinutes: en.dailyLimitMinutes || 45,
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

    const classKpis = myClasses.map((cls) => {
      const members = enrollments.filter((e) => e.classroomId === cls.id);
      const statsForClass = classStudentStats.filter((s) => s.classroomId === cls.id);
      const classExams = relevantExamAttempts.filter((ea) => ea.classroomId === cls.id);
      const avgExamScorePct =
        classExams.length > 0
          ? Math.round(
              classExams.reduce(
                (acc, ea) => acc + (ea.maxScore > 0 ? (ea.score / ea.maxScore) * 100 : 0),
                0
              ) / classExams.length
            )
          : null;

      const totalExpectedHomeworks = members.length * myHomeworks.filter((h) => h.classroomId === cls.id).length;
      const totalSubmittedHomeworks = statsForClass.reduce((acc, s) => acc + s.submittedHomeworksCount, 0);
      const homeworkDeliveryPct =
        totalExpectedHomeworks > 0
          ? Math.min(100, Math.round((totalSubmittedHomeworks / totalExpectedHomeworks) * 100))
          : null;

      const needsAttentionCount = statsForClass.filter(
        (s) => (s.totalAttempts > 0 && s.correctRate < 60) || s.weakTopics.length > 0
      ).length;

      return {
        classroomId: cls.id,
        classroomName: cls.name,
        memberCount: members.length,
        avgExamScorePct,
        homeworkDeliveryPct,
        needsAttentionCount,
      };
    });

    const classNameMap = new Map(myClasses.map((c) => [c.id, c.name]));

    res.json({
      user: sanitizeUser(caller.user),
      classrooms: myClasses,
      enrollments,
      classStudentStats,
      classKpis,
      questions: myQuestions.map((q) => ({
        ...q,
        classroomName: q.classroomId ? classNameMap.get(q.classroomId) || null : null,
        payload: safeJsonParse<Record<string, unknown>>(q.payloadJson, {}),
      })),
      questionResponses: questionResponsesRaw,
      homeworks: myHomeworks.map((h) => ({
        ...h,
        questions: safeJsonParse<
          Array<{
            promptText: string;
            options: string[];
            correctAnswer: string;
            hintText?: string;
            explanation?: string;
          }>
        >(h.questionsJson, []),
      })),
      submissions: submissions.map((s) => ({
        ...s,
        answers: safeJsonParse<
          Array<{ promptText: string; studentAnswer: string; isCorrect: boolean }>
        >(s.answersJson, []),
      })),
      exams: myExams.map((e) => ({
        ...e,
        questions: safeJsonParse<
          Array<{
            id: string;
            topicId: string;
            bookId: string;
            promptText: string;
            options: string[];
            correctAnswer: string;
            explanation: string;
          }>
        >(e.questionsJson, []),
      })),
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

teacherRouter.patch('/teacher/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'teacher' && caller.role !== 'admin')
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به حساب معلم است.' });
    }

    const { displayName, schoolName } = req.body as {
      displayName?: string;
      schoolName?: string;
    };

    const cleanName = typeof displayName === 'string' ? displayName.trim().slice(0, 80) : '';
    if (!cleanName) {
      return res.status(400).json({ error: 'نام و نام خانوادگی معلم الزامی است.' });
    }

    const [updated] = await db
      .update(users)
      .set({
        displayName: cleanName,
        schoolName:
          typeof schoolName === 'string' ? schoolName.trim().slice(0, 100) || null : caller.user.schoolName,
      })
      .where(eq(users.uid, caller.uid))
      .returning();

    res.json({ user: sanitizeUser(updated) });
  } catch (error) {
    console.error('PATCH /api/teacher/profile failed:', error);
    res.status(500).json({ error: 'بروزرسانی پروفایل معلم با خطا مواجه شد.' });
  }
});

teacherRouter.get('/teacher/curriculum-questions', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureCurriculumSeeded();
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const gradeNum = req.query.gradeId ? Number(req.query.gradeId) : null;
    const bookId = typeof req.query.bookId === 'string' && req.query.bookId ? req.query.bookId : null;
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const conditions = [
      or(
        eq(educationalContent.reviewStatus, 'approved'),
        eq(educationalContent.authorUid, caller.uid)
      ),
      inArray(educationalContent.questionType, ['mcq', 'true_false', 'fill_blank', 'pattern_puzzle']),
    ];

    if (gradeNum && Number.isInteger(gradeNum) && gradeNum >= 1 && gradeNum <= 6) {
      conditions.push(eq(educationalContent.gradeId, gradeNum));
    }
    if (bookId && bookId !== 'all') {
      conditions.push(eq(educationalContent.bookId, bookId));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(educationalContent.promptText, pattern),
          ilike(educationalContent.topicId, pattern),
          ilike(educationalContent.chapterId, pattern)
        )!
      );
    }

    const rows = await db
      .select()
      .from(educationalContent)
      .where(and(...conditions))
      .orderBy(desc(educationalContent.id))
      .limit(50);

    const formatted = rows
      .map((q) => {
        const payload = safeJsonParse<Record<string, unknown>>(q.payloadJson, {});
        const rawOptions = Array.isArray(payload.options)
          ? payload.options
          : Array.isArray(payload.choices)
            ? payload.choices
            : ['درست', 'نادرست'];
        const options = rawOptions.map(String).filter(Boolean);
        return {
          id: q.id,
          gradeId: q.gradeId,
          bookId: q.bookId,
          topicId: q.topicId,
          promptText: q.promptText,
          options: options.length >= 2 ? options : [q.correctAnswer, 'سایر موارد'],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          contentSource: q.contentSource,
        };
      });

    res.json({ questions: formatted });
  } catch (error) {
    console.error('GET /api/teacher/curriculum-questions failed:', error);
    res.status(500).json({ error: 'دریافت بانک سؤالات برای آزمون با خطا مواجه شد.' });
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

teacherRouter.patch('/teacher/classrooms/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'شناسه کلاس نامعتبر است.' });
    }
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
      return res.status(403).json({ error: 'فقط معلم این کلاس یا مدیر کل مجاز به ویرایش آن است.' });
    }

    const { name, gradeId, regenerateJoinCode } = req.body as {
      name?: string;
      gradeId?: number;
      regenerateJoinCode?: boolean;
    };

    const updates: Partial<typeof classrooms.$inferInsert> = {};
    if (typeof name === 'string') {
      const cleanName = name.trim().slice(0, 80);
      if (!cleanName) {
        return res.status(400).json({ error: 'نام کلاس نمی‌تواند خالی باشد.' });
      }
      updates.name = cleanName;
    }

    const targetGrade = gradeId !== undefined ? Number(gradeId) : cls.gradeId;
    if (gradeId !== undefined) {
      if (!Number.isInteger(targetGrade) || targetGrade < 1 || targetGrade > 6) {
        return res.status(400).json({ error: 'پایه تحصیلی باید بین ۱ تا ۶ باشد.' });
      }
      updates.gradeId = targetGrade;
    }

    if (regenerateJoinCode) {
      updates.joinCode = `HR${targetGrade}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    }

    if (Object.keys(updates).length === 0) {
      return res.json({ classroom: cls });
    }

    const [updated] = await db
      .update(classrooms)
      .set(updates)
      .where(eq(classrooms.id, id))
      .returning();

    res.json({ classroom: updated });
  } catch (error) {
    console.error('PATCH /api/teacher/classrooms/:id failed:', error);
    res.status(500).json({ error: 'ویرایش اطلاعات کلاس با خطا مواجه شد.' });
  }
});

teacherRouter.delete(
  '/teacher/classrooms/:id/members/:studentId',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const classroomId = Number(req.params.id);
      const studentId = Number(req.params.studentId);
      if (!Number.isInteger(classroomId) || !Number.isInteger(studentId)) {
        return res.status(400).json({ error: 'شناسه کلاس یا دانش‌آموز نامعتبر است.' });
      }
      const caller = await resolveCallerUser(req);
      if (
        caller.isStudentSession ||
        !caller.user ||
        (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
      ) {
        return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
      }

      const [cls] = await db
        .select()
        .from(classrooms)
        .where(eq(classrooms.id, classroomId))
        .limit(1);
      if (!cls) return res.status(404).json({ error: 'کلاس یافت نشد.' });
      if (cls.teacherUid !== caller.uid && caller.role !== 'admin') {
        return res.status(403).json({ error: 'فقط معلم این کلاس مجاز به مدیریت اعضا است.' });
      }

      await db
        .delete(classroomEnrollments)
        .where(
          and(
            eq(classroomEnrollments.classroomId, classroomId),
            eq(classroomEnrollments.studentId, studentId)
          )
        );

      const [st] = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.id, studentId))
        .limit(1);
      if (st) {
        await createNotifications([
          {
            studentId: st.id,
            role: 'student',
            title: `خروج از کلاس ${cls.name}`,
            body: `عضویت شما در کلاس «${cls.name}» توسط معلم تغییر یافت.`,
            type: 'announcement',
          },
          {
            recipientUid: st.parentUid,
            studentId: st.id,
            role: 'parent',
            title: `تغییر عضویت کلاس ${st.nickname}`,
            body: `دانش‌آموز از کلاس «${cls.name}» توسط معلم حذف شد.`,
            type: 'announcement',
          },
        ]);
      }

      res.json({ deleted: true, classroomId, studentId });
    } catch (error) {
      console.error('DELETE /api/teacher/classrooms/:id/members/:studentId failed:', error);
      res.status(500).json({ error: 'حذف دانش‌آموز از کلاس با خطا مواجه شد.' });
    }
  }
);

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
      classroomId,
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
      classroomId?: number | null;
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

    let resolvedClassroomId: number | null = null;
    let resolvedGrade = Number(gradeId);

    if (classroomId) {
      const [cls] = await db
        .select()
        .from(classrooms)
        .where(eq(classrooms.id, Number(classroomId)))
        .limit(1);
      if (!cls || (cls.teacherUid !== caller.uid && caller.role !== 'admin')) {
        return res.status(403).json({ error: 'فقط معلم این کلاس می‌تواند برای آن سؤال ثبت کند.' });
      }
      resolvedClassroomId = cls.id;
      resolvedGrade = cls.gradeId;
    }

    if (!Number.isInteger(resolvedGrade) || resolvedGrade < 1 || resolvedGrade > 6 || !promptText?.trim() || !correctAnswer?.trim()) {
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

    // Classroom-scoped teacher questions publish immediately to enrolled students;
    // global curriculum questions require admin approval (unless created by admin).
    const resolvedStatus = resolvedClassroomId
      ? 'approved'
      : caller.role === 'admin' && reviewStatus === 'approved'
        ? 'approved'
        : 'pending_review';

    const [created] = await db
      .insert(educationalContent)
      .values({
        classroomId: resolvedClassroomId,
        gradeId: resolvedGrade,
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

    if (resolvedClassroomId) {
      const classMembers = await db
        .select({
          studentId: studentProfiles.id,
          parentUid: studentProfiles.parentUid,
        })
        .from(classroomEnrollments)
        .innerJoin(studentProfiles, eq(classroomEnrollments.studentId, studentProfiles.id))
        .where(eq(classroomEnrollments.classroomId, resolvedClassroomId));

      await createNotifications(
        classMembers.map((m) => ({
          studentId: m.studentId,
          role: 'student' as const,
          title: 'سؤال جدید از معلم کلاس',
          body: `${created.topicId}: ${created.promptText.slice(0, 60)}`,
          type: 'homework' as const,
        }))
      );
    } else if (resolvedStatus === 'pending_review') {
      await notifyAllAdmins(
        'سؤال جدید در صف بررسی',
        `${caller.user.displayName} یک سؤال جدید (${created.topicId}) برای تأیید ثبت کرد.`,
        'approval'
      );
    }

    res.status(201).json({ question: created });
  } catch (error: unknown) {
    console.error('POST /api/teacher/questions failed:', error);
    res.status(500).json({ error: 'ذخیره سؤال جدید با خطا مواجه شد.' });
  }
});

// Teacher edits own question (classroom-scoped stays approved; global approved/rejected enters pending_review)
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

    const {
      classroomId,
      promptText,
      correctAnswer,
      topicId,
      chapterId,
      hintText,
      explanation,
      gradeId,
      bookId,
      difficulty,
      payload,
    } = req.body as {
      classroomId?: number | null;
      promptText?: string;
      correctAnswer?: string;
      topicId?: string;
      chapterId?: string;
      hintText?: string;
      explanation?: string;
      gradeId?: number;
      bookId?: BookId;
      difficulty?: DifficultyLevel;
      payload?: Record<string, unknown>;
    };

    const updates: Partial<typeof educationalContent.$inferInsert> = {};
    let nextClassroomId = existing.classroomId;

    if (classroomId !== undefined) {
      if (classroomId === null) {
        nextClassroomId = null;
        updates.classroomId = null;
      } else {
        const [cls] = await db
          .select()
          .from(classrooms)
          .where(eq(classrooms.id, Number(classroomId)))
          .limit(1);
        if (!cls || (cls.teacherUid !== caller.uid && caller.role !== 'admin')) {
          return res.status(403).json({ error: 'فقط معلم این کلاس می‌تواند سؤال را به آن اختصاص دهد.' });
        }
        nextClassroomId = cls.id;
        updates.classroomId = cls.id;
        updates.gradeId = cls.gradeId;
      }
    }

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
    if (gradeId !== undefined && nextClassroomId === null) {
      const g = Number(gradeId);
      if (Number.isInteger(g) && g >= 1 && g <= 6) updates.gradeId = g;
    }
    if (bookId && REALM_BY_BOOK[bookId]) {
      updates.bookId = bookId;
      updates.realmId = REALM_BY_BOOK[bookId];
    }
    if (difficulty && ['easy', 'medium', 'hard', 'challenge'].includes(difficulty)) {
      updates.difficulty = difficulty;
    }
    if (payload && typeof payload === 'object') {
      updates.payloadJson = JSON.stringify(payload);
    }

    // Classroom-scoped questions stay immediately approved for the teacher's class;
    // global questions edited by non-admin enter pending_review.
    if (caller.role !== 'admin') {
      if (nextClassroomId !== null) {
        updates.reviewStatus = 'approved';
        updates.rejectionReason = null;
      } else {
        updates.reviewStatus = 'pending_review';
        updates.rejectionReason = null;
      }
    }

    const [updated] = await db
      .update(educationalContent)
      .set(updates)
      .where(eq(educationalContent.id, id))
      .returning();

    if (caller.role !== 'admin' && nextClassroomId === null) {
      await notifyAllAdmins(
        'بازبینی و ارسال مجدد سؤال',
        `${caller.user.displayName} سؤال «${updated.topicId}» را ویرایش و برای تأیید ارسال کرد.`,
        'approval'
      );
    }

    res.json({
      question: {
        ...updated,
        payload: safeJsonParse<Record<string, unknown>>(updated.payloadJson, {}),
      },
    });
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
    if (caller.role !== 'admin' && existing.reviewStatus === 'approved' && existing.classroomId === null) {
      return res.status(403).json({ error: 'سؤال‌های سراسری منتشرشده فقط توسط مدیر کل قابل حذف هستند.' });
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

    if (q.authorUid) {
      await createNotifications([
        {
          recipientUid: q.authorUid,
          role: 'teacher',
          title:
            nextStatus === 'approved'
              ? 'سؤال شما تأیید و منتشر شد'
              : 'سؤال شما نیازمند اصلاح است',
          body:
            nextStatus === 'approved'
              ? `سؤال «${q.promptText.slice(0, 60)}» در بازی دانش‌آموزان فعال شد.`
              : `دلیل رد سؤال «${q.promptText.slice(0, 50)}»: ${rawReason || 'نیازمند اصلاح'}`,
          type: 'approval',
        },
      ]);
    }

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

      const classMembers = await db
        .select({
          studentId: studentProfiles.id,
          parentUid: studentProfiles.parentUid,
        })
        .from(classroomEnrollments)
        .innerJoin(studentProfiles, eq(classroomEnrollments.studentId, studentProfiles.id))
        .where(eq(classroomEnrollments.classroomId, Number(classroomId)));

      await createNotifications(
        classMembers.flatMap((m) => [
          {
            studentId: m.studentId,
            role: 'student' as const,
            title: 'فیلم آموزشی جدید منتشر شد',
            body: `${created.title} (${created.chapterId})`,
            type: 'announcement' as const,
          },
          {
            recipientUid: m.parentUid,
            studentId: m.studentId,
            role: 'parent' as const,
            title: 'فیلم آموزشی جدید کلاس',
            body: `${created.title} توسط ${caller.user!.displayName} منتشر شد.`,
            type: 'announcement' as const,
          },
        ])
      );
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

    const [st] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.id, sub.studentId))
      .limit(1);
    if (st) {
      const fbText = updated.teacherFeedback
        ? `بازخورد معلم: ${updated.teacherFeedback}`
        : `تکلیف «${hw?.title || 'کلاسی'}» توسط معلم بررسی شد.`;
      await createNotifications([
        {
          studentId: st.id,
          role: 'student',
          title: 'نتیجه بررسی تکلیف ثبت شد',
          body: fbText,
          type: 'feedback',
        },
        {
          recipientUid: st.parentUid,
          studentId: st.id,
          role: 'parent',
          title: `تصحیح تکلیف ${st.nickname}`,
          body: fbText,
          type: 'feedback',
        },
      ]);
    }

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

    const [st] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.id, attempt.studentId))
      .limit(1);
    if (st) {
      const fbText = updated.teacherFeedback
        ? `بازخورد آزمون: ${updated.teacherFeedback}`
        : 'نمره و بازخورد آزمون توسط معلم ثبت شد.';
      await createNotifications([
        {
          studentId: st.id,
          role: 'student',
          title: 'بازخورد آزمون معلم',
          body: fbText,
          type: 'feedback',
        },
        {
          recipientUid: st.parentUid,
          studentId: st.id,
          role: 'parent',
          title: `بازخورد آزمون ${st.nickname}`,
          body: fbText,
          type: 'feedback',
        },
      ]);
    }

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

    const classMembers = await db
      .select({
        studentId: studentProfiles.id,
        parentUid: studentProfiles.parentUid,
      })
      .from(classroomEnrollments)
      .innerJoin(studentProfiles, eq(classroomEnrollments.studentId, studentProfiles.id))
      .where(eq(classroomEnrollments.classroomId, Number(classroomId)));

    await createNotifications(
      classMembers.flatMap((m) => [
        {
          studentId: m.studentId,
          role: 'student' as const,
          title: created.title || `پیام معلم (${cls.name})`,
          body: created.message,
          type: 'announcement' as const,
        },
        {
          recipientUid: m.parentUid,
          studentId: m.studentId,
          role: 'parent' as const,
          title: created.title || `اطلاعیه کلاس ${cls.name}`,
          body: created.message,
          type: 'announcement' as const,
        },
      ])
    );

    res.status(201).json({ announcement: created });
  } catch (error: unknown) {
    console.error('POST /api/teacher/announcements failed:', error);
    res.status(500).json({ error: 'ارسال اعلان آموزشی با خطا مواجه شد.' });
  }
});

teacherRouter.delete('/teacher/announcements/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'شناسه اطلاعیه نامعتبر است.' });
    }
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const [ann] = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!ann) return res.status(404).json({ error: 'اطلاعیه یافت نشد.' });
    if (ann.senderUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط فرستنده اطلاعیه مجاز به حذف آن است.' });
    }

    await db.delete(announcements).where(eq(announcements.id, id));
    res.json({ deleted: true, id });
  } catch (error) {
    console.error('DELETE /api/teacher/announcements/:id failed:', error);
    res.status(500).json({ error: 'حذف اطلاعیه با خطا مواجه شد.' });
  }
});

teacherRouter.patch('/teacher/homeworks/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'شناسه تکلیف نامعتبر است.' });
    }
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const [hw] = await db.select().from(homeworks).where(eq(homeworks.id, id)).limit(1);
    if (!hw) return res.status(404).json({ error: 'تکلیف یافت نشد.' });
    if (hw.creatorUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط معلم سازنده مجاز به ویرایش این تکلیف است.' });
    }

    const { classroomId, gradeId, bookId, title, description, dueDate, questions } = req.body as {
      classroomId?: number | null;
      gradeId?: number;
      bookId?: BookId;
      title?: string;
      description?: string;
      dueDate?: string;
      questions?: Array<{
        promptText: string;
        options: string[];
        correctAnswer: string;
        hintText?: string;
        explanation?: string;
      }>;
    };

    const updates: Partial<typeof homeworks.$inferInsert> = {};

    if (classroomId !== undefined) {
      if (classroomId === null) {
        updates.classroomId = null;
      } else {
        const [cls] = await db
          .select()
          .from(classrooms)
          .where(eq(classrooms.id, Number(classroomId)))
          .limit(1);
        if (!cls || (cls.teacherUid !== caller.uid && caller.role !== 'admin')) {
          return res.status(403).json({ error: 'فقط معلم این کلاس مجاز به ویرایش تکلیف آن است.' });
        }
        updates.classroomId = cls.id;
        updates.gradeId = cls.gradeId;
      }
    }
    if (gradeId !== undefined && classroomId === undefined) {
      const g = Number(gradeId);
      if (Number.isInteger(g) && g >= 1 && g <= 6) updates.gradeId = g;
    }
    if (bookId && REALM_BY_BOOK[bookId]) updates.bookId = bookId;
    if (typeof title === 'string' && title.trim()) updates.title = title.trim().slice(0, 120);
    if (typeof description === 'string') updates.description = description.trim().slice(0, 500);
    if (typeof dueDate === 'string' && dueDate.trim()) updates.dueDate = dueDate.trim().slice(0, 30);
    if (Array.isArray(questions) && questions.length > 0) {
      updates.questionsJson = JSON.stringify(questions.slice(0, 20));
    }

    const [updated] = await db
      .update(homeworks)
      .set(updates)
      .where(eq(homeworks.id, id))
      .returning();

    res.json({
      homework: {
        ...updated,
        questions: safeJsonParse<unknown[]>(updated.questionsJson, []),
      },
    });
  } catch (error) {
    console.error('PATCH /api/teacher/homeworks/:id failed:', error);
    res.status(500).json({ error: 'ویرایش تکلیف با خطا مواجه شد.' });
  }
});

teacherRouter.delete('/teacher/homeworks/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'شناسه تکلیف نامعتبر است.' });
    }
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const [hw] = await db.select().from(homeworks).where(eq(homeworks.id, id)).limit(1);
    if (!hw) return res.status(404).json({ error: 'تکلیف یافت نشد.' });
    if (hw.creatorUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط معلم سازنده مجاز به حذف این تکلیف است.' });
    }

    await db.delete(homeworks).where(eq(homeworks.id, id));
    res.json({ deleted: true, id });
  } catch (error) {
    console.error('DELETE /api/teacher/homeworks/:id failed:', error);
    res.status(500).json({ error: 'حذف تکلیف با خطا مواجه شد.' });
  }
});

teacherRouter.patch('/teacher/exams/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'شناسه آزمون نامعتبر است.' });
    }
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const [ex] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
    if (!ex) return res.status(404).json({ error: 'آزمون یافت نشد.' });
    if (ex.creatorUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط معلم طراح مجاز به ویرایش این آزمون است.' });
    }

    const { classroomId, gradeId, bookId, examType, difficulty, title, durationMinutes, maxScore, questions } =
      req.body as {
        classroomId?: number | null;
        gradeId?: number;
        bookId?: BookId;
        examType?: string;
        difficulty?: string;
        title?: string;
        durationMinutes?: number;
        maxScore?: number;
        questions?: Array<{
          id: string;
          topicId: string;
          bookId: string;
          promptText: string;
          options: string[];
          correctAnswer: string;
          explanation: string;
        }>;
      };

    const updates: Partial<typeof exams.$inferInsert> = {};

    if (classroomId !== undefined) {
      if (classroomId === null) {
        updates.classroomId = null;
      } else {
        const [cls] = await db
          .select()
          .from(classrooms)
          .where(eq(classrooms.id, Number(classroomId)))
          .limit(1);
        if (!cls || (cls.teacherUid !== caller.uid && caller.role !== 'admin')) {
          return res.status(403).json({ error: 'فقط معلم این کلاس مجاز به ویرایش آزمون آن است.' });
        }
        updates.classroomId = cls.id;
        updates.gradeId = cls.gradeId;
      }
    }
    if (gradeId !== undefined && classroomId === undefined && updates.gradeId === undefined) {
      const g = Number(gradeId);
      if (Number.isInteger(g) && g >= 1 && g <= 6) updates.gradeId = g;
    }
    if (bookId && REALM_BY_BOOK[bookId]) updates.bookId = bookId;
    if (typeof examType === 'string' && examType.trim()) updates.examType = examType.trim();
    if (difficulty && ['easy', 'medium', 'hard', 'challenge'].includes(difficulty)) {
      updates.difficulty = difficulty;
    }
    if (typeof title === 'string' && title.trim()) updates.title = title.trim().slice(0, 120);
    if (durationMinutes !== undefined) {
      updates.durationMinutes = Math.max(5, Math.min(90, Number(durationMinutes) || 15));
    }
    if (maxScore !== undefined) {
      updates.maxScore = Math.max(10, Math.min(100, Number(maxScore) || 20));
    }
    if (Array.isArray(questions) && questions.length > 0) {
      updates.questionsJson = JSON.stringify(questions);
    }

    const [updated] = await db
      .update(exams)
      .set(updates)
      .where(eq(exams.id, id))
      .returning();

    res.json({
      exam: {
        ...updated,
        questions: safeJsonParse<unknown[]>(updated.questionsJson, []),
      },
    });
  } catch (error) {
    console.error('PATCH /api/teacher/exams/:id failed:', error);
    res.status(500).json({ error: 'ویرایش آزمون با خطا مواجه شد.' });
  }
});

teacherRouter.delete('/teacher/exams/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'شناسه آزمون نامعتبر است.' });
    }
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const [ex] = await db.select().from(exams).where(eq(exams.id, id)).limit(1);
    if (!ex) return res.status(404).json({ error: 'آزمون یافت نشد.' });
    if (ex.creatorUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط معلم طراح مجاز به حذف این آزمون است.' });
    }

    await db.delete(exams).where(eq(exams.id, id));
    res.json({ deleted: true, id });
  } catch (error) {
    console.error('DELETE /api/teacher/exams/:id failed:', error);
    res.status(500).json({ error: 'حذف آزمون با خطا مواجه شد.' });
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

    const { classroomId, gradeId, bookId, chapterId, topicId, difficulty, questionType } = req.body as {
      classroomId?: number | null;
      gradeId: number;
      bookId: BookId;
      chapterId: string;
      topicId: string;
      difficulty: string;
      questionType: 'mcq' | 'true_false' | 'fill_blank' | 'pattern_puzzle';
    };

    let resolvedClassroomId: number | null = null;
    let resolvedGrade = Number(gradeId) || 3;
    if (classroomId) {
      const [cls] = await db
        .select()
        .from(classrooms)
        .where(eq(classrooms.id, Number(classroomId)))
        .limit(1);
      if (!cls || (cls.teacherUid !== caller.uid && caller.role !== 'admin')) {
        return res.status(403).json({ error: 'فقط معلم این کلاس می‌تواند برای آن سؤال بسازد.' });
      }
      resolvedClassroomId = cls.id;
      resolvedGrade = cls.gradeId;
    }

    const realm = REALMS.find((r) => r.bookId === bookId);
    const generated = await generateTeacherQuestionWithAI({
      gradeId: resolvedGrade,
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
        classroomId: resolvedClassroomId,
        gradeId: resolvedGrade,
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
        reviewStatus: resolvedClassroomId ? 'approved' : 'pending_review',
        rejectionReason: null,
        authorUid: caller.uid,
      })
      .returning();

    if (resolvedClassroomId) {
      const classMembers = await db
        .select({ studentId: studentProfiles.id })
        .from(classroomEnrollments)
        .where(eq(classroomEnrollments.classroomId, resolvedClassroomId));
      await createNotifications(
        classMembers.map((m) => ({
          studentId: m.studentId,
          role: 'student' as const,
          title: 'سؤال جدید از معلم کلاس',
          body: `${savedDraft.topicId}: ${savedDraft.promptText.slice(0, 60)}`,
          type: 'homework' as const,
        }))
      );
    } else {
      await notifyAllAdmins(
        'پیش‌نویس سؤال هوشمند جدید',
        `${caller.user.displayName} یک سؤال هوشمند در مبحث «${savedDraft.topicId}» برای تأیید ارسال کرد.`,
        'approval'
      );
    }

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
