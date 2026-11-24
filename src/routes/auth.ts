import { Router } from 'express';
import crypto from 'crypto';
import { desc, eq, inArray, isNull, and } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { announcements, studentProfiles, users } from '../db/schema.ts';
import { ensureCurriculumSeeded } from '../db/seed.ts';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { createRateLimiter } from '../middleware/rate-limit.ts';
import { hashPassword, verifyPassword, signSessionToken } from '../lib/auth-crypto.ts';
import {
  normalizePassword,
  normalizeUsername,
  resolveCallerUser,
  sanitizeStudent,
  sanitizeUser,
} from '../lib/server-helpers.ts';

export const authRouter = Router();

const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 12,
  keyPrefix: 'auth_login',
  message: 'تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.',
});

const registerRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  keyPrefix: 'auth_register',
  message: 'تعداد درخواست‌های ثبت‌نام بیش از حد مجاز است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.',
});

const passwordChangeRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
  keyPrefix: 'auth_change_password',
  message: 'تعداد درخواست‌های تغییر رمز عبور بیش از حد مجاز است. لطفاً کمی بعد دوباره تلاش کنید.',
});

async function fetchGlobalAnnouncementsForRole(role: 'student' | 'parent' | 'teacher' | 'admin') {
  const audiences =
    role === 'student'
      ? ['all']
      : role === 'parent'
        ? ['all', 'parents']
        : role === 'teacher'
          ? ['all', 'teachers']
          : ['all', 'teachers', 'parents'];

  return db
    .select()
    .from(announcements)
    .where(and(isNull(announcements.classroomId), inArray(announcements.targetAudience, audiences)))
    .orderBy(desc(announcements.createdAt))
    .limit(20);
}

authRouter.get('/auth/admin-bootstrap-status', async (_req, res) => {
  try {
    const envConfigured = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim());
    const existingAdmins = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.role, 'admin'));
    const hasPasswordAdmin = existingAdmins.some((a) => Boolean(a.passwordHash));
    res.json({
      needsBootstrap: !envConfigured && !hasPasswordAdmin,
      envPasscodeConfigured: envConfigured,
    });
  } catch (error) {
    console.error('GET /api/auth/admin-bootstrap-status failed:', error);
    res.status(500).json({ error: 'خطا در بررسی وضعیت مدیر سامانه.' });
  }
});

authRouter.post('/auth/admin-bootstrap', registerRateLimiter, async (req, res) => {
  try {
    if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim()) {
      return res.status(403).json({ error: 'رمز مدیر از طریق تنظیمات سرور فعال شده است.' });
    }
    const existingAdmins = await db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.role, 'admin'));
    if (existingAdmins.some((a) => Boolean(a.passwordHash))) {
      return res.status(403).json({ error: 'حساب مدیر قبلاً ثبت و قفل شده است.' });
    }

    const username = normalizeUsername(req.body.username);
    const password = normalizePassword(req.body.password);
    const displayName = String(req.body.displayName || 'مدیر سامانه').trim().slice(0, 80);

    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({
        error: 'نام کاربری حداقل ۳ کاراکتر انگلیسی و رمز عبور حداقل ۶ کاراکتر باشد.',
      });
    }

    const uid = `admin_${crypto.randomBytes(8).toString('hex')}`;
    const [created] = await db
      .insert(users)
      .values({
        uid,
        email: `${username}@heroland.local`,
        username,
        passwordHash: hashPassword(password),
        displayName,
        role: 'admin',
        teacherApproved: true,
        isActive: true,
      })
      .returning();

    const token = signSessionToken({
      uid: created.uid,
      role: 'admin',
      username,
      displayName: created.displayName,
    });

    res.status(201).json({ token, sessionRole: 'admin', user: sanitizeUser(created) });
  } catch (error) {
    console.error('POST /api/auth/admin-bootstrap failed:', error);
    res.status(500).json({ error: 'ثبت اولیه حساب مدیر با خطا مواجه شد.' });
  }
});

authRouter.post('/auth/register', registerRateLimiter, async (req, res) => {
  try {
    await ensureCurriculumSeeded();
    const { role, username: rawUsername, password: rawPassword, displayName, schoolName } =
      req.body as {
        role?: string;
        username?: string;
        password?: string;
        displayName?: string;
        schoolName?: string;
      };

    if (role !== 'parent' && role !== 'teacher') {
      return res.status(400).json({ error: 'ثبت‌نام مستقیم فقط برای نقش والدین یا معلم مجاز است.' });
    }

    const username = normalizeUsername(rawUsername);
    const password = normalizePassword(rawPassword);
    const cleanName = String(displayName || '').trim().slice(0, 80);

    if (username.length < 3) {
      return res.status(400).json({
        error: 'نام کاربری باید حداقل ۳ حرف یا عدد انگلیسی باشد (حروف فارسی مجاز نیست).',
      });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
    }
    if (!cleanName) {
      return res.status(400).json({ error: 'نام و نام خانوادگی الزامی است.' });
    }

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    const existingStudent = await db
      .select({ id: studentProfiles.id })
      .from(studentProfiles)
      .where(eq(studentProfiles.username, username))
      .limit(1);

    if (existingUser.length > 0 || existingStudent.length > 0) {
      return res
        .status(409)
        .json({ error: 'این نام کاربری قبلاً انتخاب شده است. نام دیگری برگزینید.' });
    }

    const uid = `usr_${crypto.randomBytes(10).toString('hex')}`;
    const [created] = await db
      .insert(users)
      .values({
        uid,
        email: `${username}@heroland.local`,
        username,
        passwordHash: hashPassword(password),
        displayName: cleanName,
        role,
        teacherApproved: false,
        isActive: true,
        schoolName:
          role === 'teacher' ? String(schoolName || '').trim().slice(0, 100) || null : null,
      })
      .returning();

    const token = signSessionToken({
      uid: created.uid,
      role,
      username,
      displayName: created.displayName,
    });

    res.status(201).json({
      token,
      sessionRole: role,
      user: sanitizeUser(created),
      students: [],
    });
  } catch (error) {
    console.error('POST /api/auth/register failed:', error);
    res.status(500).json({ error: 'ثبت‌نام حساب کاربری با خطا مواجه شد.' });
  }
});

authRouter.post('/auth/login', loginRateLimiter, async (req, res) => {
  try {
    await ensureCurriculumSeeded();
    const { portal, username: rawUsername, password: rawPassword } = req.body as {
      portal?: 'student' | 'parent' | 'teacher' | 'admin';
      username?: string;
      password?: string;
    };

    const username = normalizeUsername(rawUsername);
    const password = normalizePassword(rawPassword);
    if (!portal || !username || !password) {
      return res
        .status(400)
        .json({ error: 'نام کاربری (حروف یا اعداد انگلیسی) و رمز عبور را کامل وارد کنید.' });
    }

    if (portal === 'student') {
      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.username, username))
        .limit(1);

      if (!student || !verifyPassword(password, student.passwordHash)) {
        return res.status(401).json({
          error:
            'نام کاربری یا رمز عبور دانش‌آموز نادرست است. والدین می‌توانند رمز دانش‌آموز را در پنل والدین تنظیم کنند.',
        });
      }

      const token = signSessionToken({
        uid: `student:${student.id}`,
        role: 'student',
        username,
        displayName: student.nickname,
        studentId: student.id,
      });

      return res.json({
        token,
        sessionRole: 'student',
        student: sanitizeStudent(student),
      });
    }

    if (portal === 'admin' && process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim()) {
      const expected = Buffer.from(process.env.ADMIN_PASSCODE.trim());
      const provided = Buffer.from(password);
      if (
        username === 'admin' &&
        expected.length === provided.length &&
        crypto.timingSafeEqual(expected, provided)
      ) {
        const envUid = 'admin_env_root';
        const existing = await db.select().from(users).where(eq(users.uid, envUid)).limit(1);
        const adminRow =
          existing[0] ||
          (
            await db
              .insert(users)
              .values({
                uid: envUid,
                email: 'admin@heroland.local',
                username: 'admin',
                displayName: 'مدیر کل سامانه',
                role: 'admin',
                teacherApproved: true,
                isActive: true,
              })
              .returning()
          )[0];

        const token = signSessionToken({
          uid: adminRow.uid,
          role: 'admin',
          username: 'admin',
          displayName: adminRow.displayName,
        });
        return res.json({ token, sessionRole: 'admin', user: sanitizeUser(adminRow) });
      }
    }

    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!found || !verifyPassword(password, found.passwordHash)) {
      return res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است.' });
    }

    if (found.isActive === false) {
      return res.status(403).json({
        error: 'حساب کاربری شما توسط مدیر سامانه غیرفعال شده است.',
      });
    }

    const ownStudents = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.parentUid, found.uid))
      .orderBy(desc(studentProfiles.createdAt));

    const canEnterPortal =
      found.role === portal ||
      (portal === 'parent' && (found.role === 'admin' || ownStudents.length > 0)) ||
      (portal === 'teacher' && found.role === 'admin');

    if (!canEnterPortal) {
      const roleLabels: Record<string, string> = {
        parent: 'والدین',
        teacher: 'معلم',
        admin: 'مدیر سامانه',
      };
      return res.status(403).json({
        error: `این حساب متعلق به بخش «${roleLabels[found.role] || found.role}» است. لطفاً از درگاه ورود مخصوص نقش خود وارد شوید.`,
      });
    }

    const token = signSessionToken({
      uid: found.uid,
      role: portal as 'parent' | 'teacher' | 'admin',
      username,
      displayName: found.displayName,
    });

    const myStudents = portal === 'parent' ? ownStudents.map(sanitizeStudent) : [];

    res.json({
      token,
      sessionRole: portal,
      user: sanitizeUser(found),
      students: myStudents,
    });
  } catch (error) {
    console.error('POST /api/auth/login failed:', error);
    res.status(500).json({ error: 'ورود به سامانه با خطا مواجه شد.' });
  }
});

authRouter.post(
  '/auth/change-password',
  passwordChangeRateLimiter,
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const caller = await resolveCallerUser(req);
      if (caller.isStudentSession || !caller.user) {
        return res.status(403).json({
          error: 'تغییر رمز عبور دانش‌آموز فقط از طریق پنل والدین انجام می‌شود.',
        });
      }

      const { currentPassword: rawCurrent, newPassword: rawNew } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };

      const currentPassword = normalizePassword(rawCurrent);
      const newPassword = normalizePassword(rawNew);

      if (caller.user.passwordHash) {
        if (!currentPassword || !verifyPassword(currentPassword, caller.user.passwordHash)) {
          return res.status(401).json({ error: 'رمز عبور فعلی نادرست است.' });
        }
      }

      if (newPassword.length < 6 || newPassword.length > 128) {
        return res.status(400).json({ error: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.' });
      }

      const [updated] = await db
        .update(users)
        .set({ passwordHash: hashPassword(newPassword) })
        .where(eq(users.uid, caller.user.uid))
        .returning();

      res.json({
        ok: true,
        user: sanitizeUser(updated),
        message: 'رمز عبور حساب شما با موفقیت تغییر یافت.',
      });
    } catch (error) {
      console.error('POST /api/auth/change-password failed:', error);
      res.status(500).json({ error: 'تغییر رمز عبور با خطا مواجه شد.' });
    }
  }
);

authRouter.get('/announcements/global', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    const role = caller.isStudentSession ? 'student' : caller.role;
    const list = await fetchGlobalAnnouncementsForRole(role);
    res.json({ announcements: list });
  } catch (error) {
    console.error('GET /api/announcements/global failed:', error);
    res.status(500).json({ error: 'خطا در دریافت اطلاعیه‌های سراسری.' });
  }
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureCurriculumSeeded();
    const caller = await resolveCallerUser(req);

    if (caller.isStudentSession) {
      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.id, caller.studentId))
        .limit(1);
      if (!student) return res.status(404).json({ error: 'پروفایل دانش‌آموز یافت نشد.' });
      const globalAnnouncements = await fetchGlobalAnnouncementsForRole('student');
      return res.json({
        sessionRole: 'student',
        user: null,
        students: [sanitizeStudent(student)],
        globalAnnouncements,
      });
    }

    const requestedPortal = String(req.headers['x-portal-role'] || '').trim();
    const myStudentsRaw = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.parentUid, caller.uid))
      .orderBy(desc(studentProfiles.createdAt));

    let effectiveRole: 'parent' | 'teacher' | 'admin' = caller.role;
    if (req.user?.provider === 'password' && req.user.role && req.user.role !== 'student') {
      effectiveRole = req.user.role;
    } else if (
      caller.role === 'admin' &&
      (requestedPortal === 'parent' || requestedPortal === 'teacher' || requestedPortal === 'admin')
    ) {
      effectiveRole = requestedPortal;
    } else if (requestedPortal === 'parent' && myStudentsRaw.length > 0) {
      effectiveRole = 'parent';
    }

    const students = effectiveRole === 'parent' ? myStudentsRaw.map(sanitizeStudent) : [];
    const globalAnnouncements = await fetchGlobalAnnouncementsForRole(effectiveRole);

    res.json({
      sessionRole: effectiveRole,
      user: sanitizeUser(caller.user!),
      students,
      globalAnnouncements,
    });
  } catch (error: unknown) {
    console.error('GET /api/me failed:', error);
    res.status(500).json({ error: 'خطا در دریافت اطلاعات کاربری.' });
  }
});

authRouter.post('/teacher/apply', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || !caller.user) {
      return res.status(403).json({ error: 'حساب دانش‌آموز مجاز به درخواست معلمی نیست.' });
    }
    const user = caller.user;

    const { displayName, schoolName, teachingGrades, teachingSubjects } = req.body as {
      displayName?: string;
      schoolName?: string;
      teachingGrades?: number[];
      teachingSubjects?: string[];
    };

    const safeGrades = Array.isArray(teachingGrades)
      ? teachingGrades.filter((g) => Number.isInteger(g) && g >= 1 && g <= 6)
      : [1, 2, 3];
    const safeSubjects = Array.isArray(teachingSubjects)
      ? teachingSubjects.slice(0, 6).map(String)
      : ['math', 'persian'];

    const isAdmin = user.role === 'admin';
    const [updated] = await db
      .update(users)
      .set({
        displayName: (displayName || user.displayName).trim().slice(0, 80),
        role: isAdmin ? 'admin' : 'teacher',
        teacherApproved: isAdmin ? true : user.teacherApproved,
        schoolName: (schoolName || '').trim().slice(0, 100) || null,
        teachingGrades: JSON.stringify(safeGrades),
        teachingSubjects: JSON.stringify(safeSubjects),
      })
      .where(eq(users.uid, user.uid))
      .returning();

    res.json({ user: sanitizeUser(updated) });
  } catch (error: unknown) {
    console.error('POST /api/teacher/apply failed:', error);
    res.status(500).json({ error: 'ثبت درخواست حساب معلم با خطا مواجه شد.' });
  }
});
