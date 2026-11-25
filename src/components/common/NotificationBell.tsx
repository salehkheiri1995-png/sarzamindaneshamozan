import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bell,
  BookOpen,
  CheckCheck,
  Award,
  FileCheck2,
  Megaphone,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { toPersianDigits } from '../../shared/gamification';
import { NotificationItem } from '../../types/game';

const TYPE_META: Record<
  NotificationItem['type'],
  { label: string; bg: string; iconColor: string; Icon: React.ElementType }
> = {
  homework: { label: 'تکلیف', bg: 'bg-amber-50 border-amber-200', iconColor: 'text-amber-700', Icon: BookOpen },
  exam: { label: 'آزمون', bg: 'bg-indigo-50 border-indigo-200', iconColor: 'text-indigo-700', Icon: FileCheck2 },
  feedback: { label: 'بازخورد', bg: 'bg-teal-50 border-teal-200', iconColor: 'text-teal-700', Icon: MessageSquareText },
  approval: { label: 'تأیید و بررسی', bg: 'bg-emerald-50 border-emerald-200', iconColor: 'text-emerald-700', Icon: ShieldCheck },
  badge: { label: 'نشان قهرمانی', bg: 'bg-orange-50 border-orange-200', iconColor: 'text-orange-600', Icon: Award },
  announcement: { label: 'اطلاعیه', bg: 'bg-sky-50 border-sky-200', iconColor: 'text-sky-700', Icon: Megaphone },
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>(
        '/api/notifications'
      );
      setItems(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // silent background polling error
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const id = window.setInterval(loadNotifications, 30000);
    return () => window.clearInterval(id);
  }, [loadNotifications]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const markAllRead = async () => {
    setLoading(true);
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PATCH' });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const markOneRead = async (id: number) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) loadNotifications();
        }}
        aria-label="مرکز اعلان‌ها"
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5DAC5] bg-white text-stone-700 transition hover:bg-[#EFE6D5]"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="tabular-nums absolute -top-1.5 -left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-extrabold text-white shadow-sm">
            {toPersianDigits(unreadCount > 99 ? '99+' : unreadCount)}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 top-11 z-50 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-[#E5DAC5] bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#EFE6D5] bg-[#FBF7EF] px-4 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-teal-700" />
                <span className="text-xs font-extrabold text-stone-900">مرکز اعلان‌ها</span>
                {unreadCount > 0 && (
                  <span className="tabular-nums rounded-lg bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                    {toPersianDigits(unreadCount)} خوانده‌نشده
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-60"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  خوانده شدن همه
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto p-2.5 space-y-2">
              {items.length === 0 ? (
                <p className="py-6 text-center text-xs text-stone-500">
                  هنوز اعلانی برای شما ثبت نشده است.
                </p>
              ) : (
                items.map((item) => {
                  const meta = TYPE_META[item.type] || TYPE_META.announcement;
                  const Icon = meta.Icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (!item.isRead) markOneRead(item.id);
                      }}
                      className={`w-full rounded-xl border p-3 text-right transition ${
                        item.isRead
                          ? 'border-[#EFE6D5] bg-[#FBF7EF]/50 opacity-80'
                          : `${meta.bg} shadow-xs`
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.iconColor}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-extrabold text-stone-900 truncate">
                              {item.title}
                            </span>
                            {!item.isRead && (
                              <span className="h-2 w-2 shrink-0 rounded-full bg-rose-600" />
                            )}
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-stone-700">{item.body}</p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
