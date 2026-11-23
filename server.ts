import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { and, desc, eq, inArray, or, isNull, count } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  users,
  studentProfiles,
  classrooms,
  classroomEnrollments,
  educationalContent,
  missionAttempts,
  homeworks,
  homeworkSubmissions,
  exams,
  examAttempts,
  teacherVideos,
  announcements,
  adEvents,
} from './src/db/schema.ts';
import { ensureCurriculumSeeded } from './src/db/seed.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { hashPassword, verifyPassword, signSessionToken } from './src/lib/auth-crypto.ts';
import {
  REALMS,
  REALM_BY_BOOK,
  SHOP_ITEMS,
  BookId,
  QuestionType,
} from './src/shared/curriculum.ts';
import {
  explainMistakeWithAI,
  generateTeacherQuestionWithAI,
  convertHomeworkWithAI,
  analyzePerformanceWithAI,
} from './src/lib/gemini.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_EMAILS = new Set(['salehkheiri1995@gmail.com']);

const app = express();
app.use(express.json({ limit: '6mb' }));

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidSafeImage(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.length > 2_800_000) return null; // ~2MB base64 limit
  if (/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return trimmed;
  }
  if (isValidHttpUrl(trimmed)) {
    return trimmed;
  }
  return null;
}

function toEnglishDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function normalizeUsername(raw: unknown): string {
  return toEnglishDigits(String(raw || ''))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 32);
}

function normalizePassword(raw: unknown): string {
  return toEnglishDigits(String(raw || ''));
}

function sanitizeUser<T extends { passwordHash?: string | null }>(u: T) {
  const { passwordHash: _removed, ...safe } = u;
  return safe;
}

function sanitizeStudent<T extends { passwordHash?: string | null }>(s: T) {
  const { passwordHash: _removed, ...safe } = s;
  return { ...safe, hasPassword: Boolean(_removed) };
}

async function resolveCallerUser(req: AuthRequest) {
  const session = req.user!;
  if (session.role === 'student') {
    return {
      isStudentSession: true as const,
      studentId: session.studentId!,
      uid: session.uid,
      role: 'student' as const,
      user: null,
    };
  }

  const existing = await db.select().from(users).where(eq(users.uid, session.uid)).limit(1);
  if (existing.length > 0) {
    const isAdminEmail = ADMIN_EMAILS.has((session.email || '').toLowerCase());
    if (session.provider === 'firebase' && isAdminEmail && existing[0].role !== 'admin') {
      const [updated] = await db
        .update(users)
        .set({ role: 'admin', teacherApproved: true })
        .where(eq(users.uid, session.uid))
        .returning();
      return {
        isStudentSession: false as const,
        studentId: null,
        uid: updated.uid,
        role: updated.role as 'parent' | 'teacher' | 'admin',
        user: updated,
      };
    }
    return {
      isStudentSession: false as const,
      studentId: null,
      uid: existing[0].uid,
      role: existing[0].role as 'parent' | 'teacher' | 'admin',
      user: existing[0],
    };
  }

  // First-time Firebase Google login -> create user row matching requested portal (if teacher/parent) or admin for owner
  const isAdminEmail = ADMIN_EMAILS.has((session.email || '').toLowerCase());
  const requestedPortal = String(req.headers['x-portal-role'] || '').trim();
  const initialRole = isAdminEmail
    ? 'admin'
    : requestedPortal === 'teacher'
      ? 'teacher'
      : 'parent';

  const [created] = await db
    .insert(users)
    .values({
      uid: session.uid,
      email: session.email || `${session.uid}@heroland.local`,
      displayName: session.name || session.email?.split('@')[0] || 'کاربر قهرمان',
      role: initialRole,
      teacherApproved: isAdminEmail,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: { email: session.email || `${session.uid}@heroland.local` },
    })
    .returning();

  return {
    isStudentSession: false as const,
    studentId: null,
    uid: created.uid,
    role: created.role as 'parent' | 'teacher' | 'admin',
    user: created,
  };
}

async function verifyStudentAccess(studentId: number, req: AuthRequest) {
  const caller = await resolveCallerUser(req);
  const [student] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.id, studentId))
    .limit(1);
  if (!student) return { status: 'not_found' as const };

  if (caller.isStudentSession) {
    if (caller.studentId !== student.id) return { status: 'forbidden' as const };
    return { status: 'ok' as const, student, caller };
  }

  if (student.parentUid !== caller.uid && caller.role !== 'admin') {
    return { status: 'forbidden' as const };
  }
  return { status: 'ok' as const, student, caller };
}

// =========================================================================
// USERNAME + PASSWORD AUTHENTICATION ROUTES (Separated by Role Portal!)
// =========================================================================

app.get('/api/auth/admin-bootstrap-status', async (_req, res) => {
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

app.post('/api/auth/admin-bootstrap', async (req, res) => {
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
    const password = String(req.body.password || '');
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

app.post('/api/auth/register', async (req, res) => {
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
      return res.status(400).json({ error: 'نام کاربری باید حداقل ۳ حرف یا عدد انگلیسی باشد (حروف فارسی مجاز نیست).' });
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
      return res.status(409).json({ error: 'این نام کاربری قبلاً انتخاب شده است. نام دیگری برگزینید.' });
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
        schoolName: role === 'teacher' ? String(schoolName || '').trim().slice(0, 100) || null : null,
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

app.post('/api/auth/login', async (req, res) => {
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
      return res.status(400).json({ error: 'نام کاربری (حروف یا اعداد انگلیسی) و رمز عبور را کامل وارد کنید.' });
    }

    // 1. STUDENT PORTAL LOGIN (Strictly isolated to student account!)
    if (portal === 'student') {
      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(eq(studentProfiles.username, username))
        .limit(1);

      if (!student || !verifyPassword(password, student.passwordHash)) {
        return res.status(401).json({
          error: 'نام کاربری یا رمز عبور دانش‌آموز نادرست است. والدین می‌توانند رمز دانش‌آموز را در پنل والدین تنظیم کنند.',
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

    // 2. ADMIN ENV PASSCODE CHECK (if configured via process.env.ADMIN_PASSCODE)
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

    // 3. PARENT / TEACHER / ADMIN USER LOGIN
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!found || !verifyPassword(password, found.passwordHash)) {
      return res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است.' });
    }

    // Check if user has child profiles (allows a parent who was also approved as teacher to still log into Parent Portal cleanly!)
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

// =========================================================================
// SESSION PROFILE ROUTE (/api/me)
// =========================================================================

app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
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
      return res.json({
        sessionRole: 'student',
        user: null,
        students: [sanitizeStudent(student)],
      });
    }

    const requestedPortal = String(req.headers['x-portal-role'] || '').trim();
    const myStudentsRaw = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.parentUid, caller.uid))
      .orderBy(desc(studentProfiles.createdAt));

    // Resolve isolated sessionRole:
    // - Password sessions always stay strictly in their signed token role
    // - Firebase Google sessions: admins can explicitly enter parent/teacher/admin portals; parents with children can enter parent portal
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

    res.json({
      sessionRole: effectiveRole,
      user: sanitizeUser(caller.user!),
      students,
    });
  } catch (error: unknown) {
    console.error('GET /api/me failed:', error);
    res.status(500).json({ error: 'خطا در دریافت اطلاعات کاربری.' });
  }
});

app.post('/api/teacher/apply', requireAuth, async (req: AuthRequest, res) => {
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

// =========================================================================
// STUDENT PROFILE ROUTES (Created & Managed by Parent, Played by Student!)
// =========================================================================

app.post('/api/students', requireAuth, async (req: AuthRequest, res) => {
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
      return res.status(400).json({ error: 'نام مستعار و پایه تحصیلی معتبر (اول تا ششم) الزامی است.' });
    }

    let finalUsername: string | null = null;
    let finalHash: string | null = null;
    if (rawUsername && String(rawUsername).trim()) {
      const normalized = normalizeUsername(rawUsername);
      if (normalized.length < 3) {
        return res.status(400).json({ error: 'نام کاربری دانش‌آموز باید حداقل ۳ حرف یا عدد انگلیسی باشد.' });
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
        avatarColor: /^#[0-9A-Fa-f]{6}$/.test(String(avatarColor || '')) ? String(avatarColor) : '#D97706',
      })
      .returning();

    res.status(201).json({ student: sanitizeStudent(created) });
  } catch (error: unknown) {
    console.error('POST /api/students failed:', error);
    res.status(500).json({ error: 'خطا در ایجاد پروفایل دانش‌آموز.' });
  }
});

app.patch('/api/students/:id', requireAuth, async (req: AuthRequest, res) => {
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

    // Parent / Admin-only controls (strictly blocked for student sessions!)
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
          return res.status(400).json({ error: 'نام کاربری دانش‌آموز باید حداقل ۳ حرف/عدد انگلیسی باشد.' });
        }
        const dup = await db
          .select({ id: studentProfiles.id })
          .from(studentProfiles)
          .where(eq(studentProfiles.username, normalized))
          .limit(1);
        if (dup.length > 0 && dup[0].id !== student.id) {
          return res.status(409).json({ error: 'این نام کاربری قبلاً برای دانش‌آموز دیگری ثبت شده است.' });
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

    // Cosmetic customization allowed for both student & parent
    if (typeof heroClass === 'string' && ['explorer', 'scholar', 'inventor', 'guardian'].includes(heroClass)) {
      updates.heroClass = heroClass;
    }
    const owned: string[] = JSON.parse(student.ownedItems || '[]');
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

// =========================================================================
// GRADE-LOCKED GAME WORLD, MISSIONS, ANTI-REPETITION & SPACED REPETITION
// =========================================================================

app.get('/api/students/:id/world', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureCurriculumSeeded();
    const studentId = Number(req.params.id);
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });

    const { student } = access;

    // Strict backend grade enforcement + reviewStatus === 'approved'
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
      })
      .from(classroomEnrollments)
      .innerJoin(classrooms, eq(classroomEnrollments.classroomId, classrooms.id))
      .where(eq(classroomEnrollments.studentId, studentId));

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

    const examConditions = [
      and(eq(exams.gradeId, student.gradeId), isNull(exams.classroomId)),
    ];
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
            .limit(15)
        : [];

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
        payload: JSON.parse(m.payloadJson),
        completed: completedIds.has(m.id),
      })),
      recommendedMissionId: recommendedMission?.id ?? null,
      attempts,
      enrollments,
      homeworks: studentHomeworks.map((h) => ({
        ...h,
        questions: JSON.parse(h.questionsJson),
        submission: submissions.find((s) => s.homeworkId === h.id) || null,
      })),
      exams: gradeExams.map((e) => ({
        ...e,
        questions: JSON.parse(e.questionsJson),
      })),
      examAttempts: studentExamAttempts,
      videos: videos.map((v) => ({
        ...v,
        followUpQuestion: JSON.parse(v.followUpQuestionJson),
      })),
      announcements: classAnnouncements,
      rewardedChestsToday,
    });
  } catch (error: unknown) {
    console.error('GET /api/students/:id/world failed:', error);
    res.status(500).json({ error: 'خطا در بارگذاری دنیای بازی دانش‌آموز.' });
  }
});

app.post('/api/students/:id/attempts', requireAuth, async (req: AuthRequest, res) => {
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

// =========================================================================
// SHOP & OPTIONAL REWARDED CHEST (Respects Parental Control!)
// =========================================================================

app.post('/api/students/:id/shop/buy', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden') return res.status(403).json({ error: 'دسترسی غیرمجاز.' });

    const { student } = access;
    const { itemId } = req.body as { itemId?: string };
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'آیتم در فروشگاه یافت نشد.' });

    const owned: string[] = JSON.parse(student.ownedItems || '[]');
    if (owned.includes(item.id)) {
      return res.status(400).json({ error: 'این آیتم قبلاً خریداری شده است.' });
    }
    if (student.coins < item.price) {
      return res.status(400).json({ error: 'سکه‌های تو هنوز کافی نیست! چند مأموریت دیگر انجام بده.' });
    }

    const nextOwned = [...owned, item.id];
    const updates: Partial<typeof studentProfiles.$inferInsert> = {
      coins: student.coins - item.price,
      ownedItems: JSON.stringify(nextOwned),
    };
    if (item.category === 'outfit') updates.equippedOutfit = item.id;
    if (item.category === 'pet') updates.equippedPet = item.id;
    if (item.category === 'decor') {
      const decor: string[] = JSON.parse(student.castleDecor || '[]');
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

app.post('/api/students/:id/ads/reward', requireAuth, async (req: AuthRequest, res) => {
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
      return res.status(400).json({ error: 'سقف روزانه صندوق جایزه اختیاری (۳ بار در روز) تکمیل شده است.' });
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

// =========================================================================
// CLASSROOM ENROLLMENT (Parent-Controlled!)
// =========================================================================

app.post('/api/students/:id/join-class', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = Number(req.params.id);
    const access = await verifyStudentAccess(studentId, req);
    if (access.status === 'not_found') return res.status(404).json({ error: 'دانش‌آموز یافت نشد.' });
    if (access.status === 'forbidden' || access.caller.isStudentSession) {
      return res.status(403).json({ error: 'اتصال دانش‌آموز به کلاس فقط با تأیید والدین انجام می‌شود.' });
    }

    const { student } = access;
    if (!student.allowClassJoin) {
      return res.status(403).json({ error: 'امکان عضویت در کلاس برای این پروفایل غیرفعال شده است.' });
    }

    const code = String(req.body.joinCode || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'کد عضویت کلاس را وارد کنید.' });

    const [cls] = await db
      .select()
      .from(classrooms)
      .where(and(eq(classrooms.joinCode, code), eq(classrooms.isActive, true)))
      .limit(1);

    if (!cls) {
      return res.status(404).json({ error: 'کلاس فعالی با این کد عضویت پیدا نشد.' });
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

// =========================================================================
// HOMEWORK ROUTES (Parent & Teacher create -> Student plays as Mission!)
// =========================================================================

app.post('/api/homeworks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || !caller.user) {
      return res.status(403).json({ error: 'تعریف تکلیف جدید فقط توسط والدین یا معلم امکان‌پذیر است.' });
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

app.post('/api/homeworks/:id/submit', requireAuth, async (req: AuthRequest, res) => {
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

// =========================================================================
// EXAM ROUTES (Ad-Free, Grade-Locked, Detailed Report!)
// =========================================================================

app.post('/api/exams', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'برای طراحی آزمون اختصاصی نیاز به تأیید حساب معلم دارید.' });
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

app.post('/api/exams/:id/submit', requireAuth, async (req: AuthRequest, res) => {
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

    const questions = JSON.parse(exam.questionsJson) as Array<{
      id: string;
      topicId: string;
      bookId: string;
      promptText: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
    }>;

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

// =========================================================================
// TEACHER PANEL ROUTES (Strictly Teacher / Admin Only!)
// =========================================================================

app.get('/api/teacher/dashboard', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureCurriculumSeeded();
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || !caller.user || (caller.role !== 'teacher' && caller.role !== 'admin')) {
      return res.status(403).json({ error: 'دسترسی به پنل معلم فقط برای حساب‌های معلم مجاز است.' });
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

    res.json({
      user: sanitizeUser(caller.user),
      classrooms: myClasses,
      enrollments,
      questions: myQuestions,
      homeworks: myHomeworks,
      submissions,
      exams: myExams,
      videos: myVideos,
      announcements: myAnnouncements,
    });
  } catch (error: unknown) {
    console.error('GET /api/teacher/dashboard failed:', error);
    res.status(500).json({ error: 'بارگذاری داشبورد معلم با خطا مواجه شد.' });
  }
});

app.post('/api/teacher/classrooms', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'حساب معلم شما هنوز توسط مدیر سامانه تأیید نشده است.' });
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
        subjects: JSON.stringify(Array.isArray(subjects) && subjects.length ? subjects : ['math', 'persian', 'science']),
        joinCode,
      })
      .returning();

    res.status(201).json({ classroom: created });
  } catch (error: unknown) {
    console.error('POST /api/teacher/classrooms failed:', error);
    res.status(500).json({ error: 'ساخت کلاس جدید با خطا مواجه شد.' });
  }
});

app.post('/api/teacher/questions', requireAuth, async (req: AuthRequest, res) => {
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
      return res.status(400).json({ error: 'فرمت تصویر مجاز نیست (فقط JPG/PNG/WebP کمتر از ۲ مگابایت).' });
    }

    const realmId = REALM_BY_BOOK[bookId] || 'city_numbers';
    const isAi = contentSource === 'ai_generated';
    const resolvedSource = isAi
      ? 'ai_generated'
      : caller.role === 'admin' && contentSource === 'official_curriculum'
        ? 'official_curriculum'
        : 'teacher';
    const resolvedStatus = isAi
      ? 'pending_review'
      : reviewStatus === 'approved'
        ? 'approved'
        : 'pending_review';

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
        authorUid: caller.uid,
      })
      .returning();

    res.status(201).json({ question: created });
  } catch (error: unknown) {
    console.error('POST /api/teacher/questions failed:', error);
    res.status(500).json({ error: 'ذخیره سؤال جدید با خطا مواجه شد.' });
  }
});

app.patch('/api/teacher/questions/:id/approve', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || !caller.user) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }

    const [q] = await db
      .select()
      .from(educationalContent)
      .where(eq(educationalContent.id, id))
      .limit(1);
    if (!q) return res.status(404).json({ error: 'سؤال یافت نشد.' });
    if (q.authorUid !== caller.uid && caller.role !== 'admin') {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }

    const nextStatus = req.body.reviewStatus === 'rejected' ? 'rejected' : 'approved';
    const [updated] = await db
      .update(educationalContent)
      .set({ reviewStatus: nextStatus })
      .where(eq(educationalContent.id, id))
      .returning();

    res.json({ question: updated });
  } catch (error: unknown) {
    console.error('PATCH /api/teacher/questions/:id/approve failed:', error);
    res.status(500).json({ error: 'بروزرسانی وضعیت تأیید سؤال با خطا مواجه شد.' });
  }
});

app.post('/api/teacher/videos', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const { classroomId, gradeId, bookId, chapterId, title, description, durationLabel, videoUrl, followUpQuestion } =
      req.body as {
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
      return res.status(400).json({ error: 'عنوان و لینک معتبر ویدیو (http/https) الزامی است.' });
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

app.patch('/api/teacher/submissions/:id', requireAuth, async (req: AuthRequest, res) => {
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

    const { teacherScore, teacherFeedback, status } = req.body as {
      teacherScore?: number;
      teacherFeedback?: string;
      status?: string;
    };

    const safeStatus = ['graded', 'needs_revision'].includes(String(status)) ? String(status) : 'graded';
    const [updated] = await db
      .update(homeworkSubmissions)
      .set({
        teacherScore: teacherScore !== undefined ? Math.max(0, Math.min(20, Number(teacherScore))) : null,
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

app.post('/api/teacher/announcements', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (
      caller.isStudentSession ||
      !caller.user ||
      (caller.role !== 'admin' && !(caller.role === 'teacher' && caller.user.teacherApproved))
    ) {
      return res.status(403).json({ error: 'دسترسی محدود به معلمان تأییدشده است.' });
    }

    const { classroomId, kind, message, scheduledDate } = req.body as {
      classroomId: number;
      kind?: string;
      message: string;
      scheduledDate?: string;
    };

    if (!classroomId || !message?.trim()) {
      return res.status(400).json({ error: 'انتخاب کلاس و متن پیام آموزشی الزامی است.' });
    }

    const [created] = await db
      .insert(announcements)
      .values({
        classroomId: Number(classroomId),
        senderUid: caller.uid,
        senderName: caller.user.displayName,
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

// =========================================================================
// ADMIN CENTRAL PANEL ROUTES (Strictly Admin Only!)
// =========================================================================

app.get('/api/admin/overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureCurriculumSeeded();
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'این بخش مخصوص مدیر کل سامانه است.' });
    }

    const allUsers = (await db.select().from(users).orderBy(desc(users.createdAt))).map(sanitizeUser);
    const allStudents = (
      await db.select().from(studentProfiles).orderBy(desc(studentProfiles.createdAt))
    ).map(sanitizeStudent);
    const allClassrooms = await db.select().from(classrooms).orderBy(desc(classrooms.createdAt));
    const [{ attemptCount }] = await db.select({ attemptCount: count() }).from(missionAttempts);
    const [{ examAttemptCount }] = await db.select({ examAttemptCount: count() }).from(examAttempts);
    const allContent = await db
      .select()
      .from(educationalContent)
      .orderBy(desc(educationalContent.createdAt));
    const allAds = await db.select().from(adEvents).orderBy(desc(adEvents.createdAt)).limit(200);

    const rewardedCompleted = allAds.filter((a) => a.eventType === 'reward_completed').length;
    const rewardedSkipped = allAds.filter((a) => a.eventType === 'skipped').length;
    const totalCoinsPaid = allAds.reduce((sum, a) => sum + (a.rewardCoins || 0), 0);

    res.json({
      stats: {
        usersCount: allUsers.length,
        studentCount: allStudents.length,
        classCount: allClassrooms.length,
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
        tapsellConfigured: Boolean(process.env.TAPSELL_APP_KEY && process.env.TAPSELL_REWARDED_ZONE_ID),
      },
      users: allUsers,
      students: allStudents,
      classrooms: allClassrooms,
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

app.patch('/api/admin/teachers/:uid/approve', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);
    if (caller.isStudentSession || caller.role !== 'admin') {
      return res.status(403).json({ error: 'فقط مدیر کل مجاز به تأیید معلمان است.' });
    }

    const targetUid = String(req.params.uid);
    const approved = Boolean(req.body.approved);
    const [updated] = await db
      .update(users)
      .set({ teacherApproved: approved, role: approved ? 'teacher' : 'parent' })
      .where(eq(users.uid, targetUid))
      .returning();

    res.json({ user: updated ? sanitizeUser(updated) : null });
  } catch (error: unknown) {
    console.error('PATCH /api/admin/teachers/:uid/approve failed:', error);
    res.status(500).json({ error: 'بروزرسانی وضعیت معلم با خطا مواجه شد.' });
  }
});

app.patch('/api/admin/classrooms/:id', requireAuth, async (req: AuthRequest, res) => {
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

app.delete('/api/admin/content/:id', requireAuth, async (req: AuthRequest, res) => {
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

// =========================================================================
// EDUCATIONAL AI ROUTES (Server-Side Gemini 4 Hydrogen!)
// =========================================================================

app.post('/api/ai/explain', requireAuth, async (req: AuthRequest, res) => {
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

app.post('/api/ai/generate-question', requireAuth, async (req: AuthRequest, res) => {
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

app.post('/api/ai/convert-homework', requireAuth, async (req: AuthRequest, res) => {
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

app.post('/api/ai/analyze-progress', requireAuth, async (req: AuthRequest, res) => {
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

// =========================================================================
// VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING
// =========================================================================

async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hero Students Land server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
