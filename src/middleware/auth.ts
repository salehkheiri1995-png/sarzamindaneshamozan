import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/auth-crypto.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';

export interface AuthSession {
  uid: string;
  email: string;
  name: string;
  provider: 'firebase' | 'password';
  role?: 'student' | 'parent' | 'teacher' | 'admin';
  studentId?: number;
}

export interface AuthRequest extends Request {
  user?: AuthSession;
}

async function ensureAccountActive(uid: string): Promise<boolean> {
  const [found] = await db
    .select({ isActive: users.isActive })
    .from(users)
    .where(eq(users.uid, uid))
    .limit(1);
  if (found && found.isActive === false) {
    return false;
  }
  return true;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'احراز هویت الزامی است. لطفاً ابتدا وارد شوید.' });
  }

  const token = authHeader.split('Bearer ')[1].trim();

  // 1. Check custom username/password signed session token
  if (token.startsWith('hs.')) {
    const payload = verifySessionToken(token);
    if (!payload) {
      return res.status(401).json({ error: 'نشست کاربری نامعتبر یا منقضی شده است.' });
    }
    if (payload.role !== 'student') {
      const active = await ensureAccountActive(payload.uid);
      if (!active) {
        return res.status(403).json({
          error: 'حساب کاربری شما غیرفعال شده است. برای پیگیری با مدیر سامانه تماس بگیرید.',
        });
      }
    }
    req.user = {
      uid: payload.uid,
      email: `${payload.username}@heroland.local`,
      name: payload.displayName,
      provider: 'password',
      role: payload.role,
      studentId: payload.studentId,
    };
    return next();
  }

  // 2. Fallback to Firebase Google ID Token verification
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const active = await ensureAccountActive(decodedToken.uid);
    if (!active) {
      return res.status(403).json({
        error: 'حساب کاربری شما غیرفعال شده است. برای پیگیری با مدیر سامانه تماس بگیرید.',
      });
    }
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name || decodedToken.email?.split('@')[0] || 'کاربر',
      provider: 'firebase',
    };
    return next();
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(401).json({ error: 'نشست کاربری نامعتبر یا منقضی شده است.' });
  }
};
