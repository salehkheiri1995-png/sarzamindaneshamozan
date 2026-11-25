import React, { useEffect, useState } from 'react';
import { Download, Share, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export function PWABanners() {
  const { canPrompt, isIOS, promptInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <>
      {!isOnline && (
        <div className="no-print fixed top-2 left-1/2 z-[75] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 shadow-lg">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-700" />
          <span>اتصال اینترنت قطع است — برخی بخش‌های آنلاین در دسترس نیستند.</span>
        </div>
      )}

      {!dismissed && (canPrompt || isIOS) && (
        <div className="no-print fixed bottom-3 right-3 left-3 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-[#E5DAC5] bg-[#131B2E] px-4 py-3 text-white shadow-xl sm:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold text-amber-300">نصب نسخه اپلیکیشن سرزمین دانش</p>
            {isIOS ? (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-300">
                برای نصب، دکمه <Share className="inline h-3.5 w-3.5 text-amber-300" /> و سپس «Add to Home Screen» را بزنید.
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-slate-300">
                دسترسی سریع‌تر و تمام‌صفحه روی موبایل و تبلت
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {canPrompt && (
              <button
                type="button"
                onClick={promptInstall}
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-extrabold text-stone-950 hover:bg-amber-300"
              >
                <Download className="h-3.5 w-3.5" />
                نصب
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="بستن پیشنهاد نصب"
              className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
