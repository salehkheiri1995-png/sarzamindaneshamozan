import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { studentProfiles, users } from '../db/schema.ts';
import { AuthRequest } from '../middleware/auth.ts';

export const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'salehkheiri1995@gmail.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isValidSafeImage(value: unknown): string | null {
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

export function toEnglishDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

export function normalizeUsername(raw: unknown): string {
  return toEnglishDigits(String(raw || ''))
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 32);
}

export function normalizePassword(raw: unknown): string {
  return toEnglishDigits(String(raw || ''));
}

export function sanitizeUser<T extends { passwordHash?: string | null }>(u: T) {
  const { passwordHash: _removed, ...safe } = u;
  return { ...safe, hasPassword: Boolean(_removed) };
}

export function sanitizeStudent<T extends { passwordHash?: string | null }>(s: T) {
  const { passwordHash: _removed, ...safe } = s;
  return { ...safe, hasPassword: Boolean(_removed) };
}

export async function resolveCallerUser(req: AuthRequest) {
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

  // First-time Firebase Google login -> create user row matching requested portal or admin for owner
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

export async function verifyStudentAccess(studentId: number, req: AuthRequest) {
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
