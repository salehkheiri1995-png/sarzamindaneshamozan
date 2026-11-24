import React, { useState } from 'react';
import { LockKeyhole, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { soundEngine } from '../../lib/sound';

interface ChangePasswordCardProps {
  hasPassword?: boolean;
  onChanged?: () => void;
}

export function ChangePasswordCard({ hasPassword = true, onChanged }: ChangePasswordCardProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    if (hasPassword && !currentPassword.trim()) {
      setErrorMsg('لطفاً رمز عبور فعلی خود را وارد کنید.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('رمز عبور جدید و تکرار آن با یکدیگر مطابقت ندارند.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: hasPassword ? currentPassword : '',
          newPassword,
        }),
      });
      soundEngine.playVictory();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMsg(res.message || 'رمز عبور شما با موفقیت بروزرسانی شد.');
      onChanged?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'تغییر رمز عبور ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[#E5DAC5] bg-white p-6 space-y-4"
    >
      <div className="flex items-start gap-2.5">
        <LockKeyhole className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-base font-extrabold text-stone-900">
            {hasPassword ? 'تغییر رمز عبور حساب کاربری' : 'تنظیم رمز عبور برای ورود مستقیم'}
          </h3>
          <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
            {hasPassword
              ? 'برای امنیت بیشتر حساب خود می‌توانید رمز عبور فعلی را با یک رمز جدید (حداقل ۶ کاراکتر) جایگزین کنید.'
              : 'برای این حساب هنوز رمز عبور مستقیم تنظیم نشده است. می‌توانید یک رمز عبور جدید تعیین کنید.'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {hasPassword && (
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">رمز عبور فعلی</label>
            <input
              type="password"
              dir="ltr"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm font-mono text-left"
              required
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-bold text-stone-700 mb-1">
            رمز عبور جدید (حداقل ۶ کاراکتر)
          </label>
          <input
            type="password"
            dir="ltr"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••"
            className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm font-mono text-left"
            required
            minLength={6}
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-stone-700 mb-1">تکرار رمز عبور جدید</label>
          <input
            type="password"
            dir="ltr"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••"
            className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm font-mono text-left"
            required
            minLength={6}
          />
        </div>
      </div>

      {successMsg && (
        <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </p>
      )}
      {errorMsg && (
        <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-60 py-2.5 text-sm font-bold text-white cursor-pointer"
      >
        {saving ? 'در حال ذخیره...' : hasPassword ? 'ثبت رمز عبور جدید' : 'تنظیم رمز عبور'}
      </button>
    </form>
  );
}
