import { Router } from 'express';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { notifications } from '../db/schema.ts';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { resolveCallerUser } from '../lib/server-helpers.ts';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);

    const rows = caller.isStudentSession
      ? await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.studentId, caller.studentId!),
              eq(notifications.role, 'student')
            )
          )
          .orderBy(desc(notifications.createdAt))
          .limit(40)
      : await db
          .select()
          .from(notifications)
          .where(
            or(
              eq(notifications.recipientUid, caller.uid),
              and(isNull(notifications.recipientUid), eq(notifications.role, caller.role))
            )
          )
          .orderBy(desc(notifications.createdAt))
          .limit(40);

    const unreadCount = rows.filter((n) => !n.isRead).length;
    res.json({ notifications: rows, unreadCount });
  } catch (error) {
    console.error('GET /api/notifications failed:', error);
    res.status(500).json({ error: 'دریافت اعلان‌ها با خطا مواجه شد.' });
  }
});

notificationsRouter.patch('/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    const caller = await resolveCallerUser(req);

    if (caller.isStudentSession) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.studentId, caller.studentId!),
            eq(notifications.role, 'student'),
            eq(notifications.isRead, false)
          )
        );
    } else {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            or(
              eq(notifications.recipientUid, caller.uid),
              and(isNull(notifications.recipientUid), eq(notifications.role, caller.role))
            ),
            eq(notifications.isRead, false)
          )
        );
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/notifications/read-all failed:', error);
    res.status(500).json({ error: 'بروزرسانی وضعیت خواندن اعلان‌ها با خطا مواجه شد.' });
  }
});

notificationsRouter.patch('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'شناسه اعلان نامعتبر است.' });
    }
    const caller = await resolveCallerUser(req);
    const [existing] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: 'اعلان یافت نشد.' });
    }

    const owns = caller.isStudentSession
      ? existing.studentId === caller.studentId && existing.role === 'student'
      : existing.recipientUid === caller.uid ||
        (existing.recipientUid === null && existing.role === caller.role);

    if (!owns) {
      return res.status(403).json({ error: 'دسترسی غیرمجاز.' });
    }

    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();

    res.json({ notification: updated });
  } catch (error) {
    console.error('PATCH /api/notifications/:id/read failed:', error);
    res.status(500).json({ error: 'بروزرسانی اعلان با خطا مواجه شد.' });
  }
});
