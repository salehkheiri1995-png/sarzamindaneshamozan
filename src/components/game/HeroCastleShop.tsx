import React, { useState } from 'react';
import { StudentProfile } from '../../context/AuthContext';
import { SHOP_ITEMS, ShopItem, formatPersianDigits } from '../../shared/curriculum';
import { HeroAvatarSvg } from './HeroAvatarSvg';
import { apiFetch } from '../../lib/api';
import { soundEngine } from '../../lib/sound';
import { Gift, Check, Coins, ShieldAlert, PlayCircle } from 'lucide-react';

interface HeroCastleShopProps {
  student: StudentProfile;
  rewardedChestsToday: number;
  isDemoMode: boolean;
  onStudentUpdate: (updated: StudentProfile) => void;
  onRefresh: () => void;
}

export function HeroCastleShop({
  student,
  rewardedChestsToday,
  isDemoMode,
  onStudentUpdate,
  onRefresh,
}: HeroCastleShopProps) {
  const [filter, setFilter] = useState<'all' | 'outfit' | 'pet' | 'decor'>('all');
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Optional Rewarded Video Chest Modal (Strictly non-educational!)
  const [watchingAd, setWatchingAd] = useState(false);
  const [adSecondsLeft, setAdSecondsLeft] = useState(5);

  const ownedItems: string[] = JSON.parse(student.ownedItems || '[]');
  const castleDecor: string[] = JSON.parse(student.castleDecor || '[]');

  const handleBuyOrEquip = async (item: ShopItem) => {
    setMessage(null);
    const isOwned = ownedItems.includes(item.id);

    if (isDemoMode) {
      if (!isOwned && student.coins < item.price) {
        setMessage('سکه‌های تو برای این آیتم هنوز کافی نیست!');
        return;
      }
      soundEngine.playCoin();
      const nextOwned = isOwned ? ownedItems : [...ownedItems, item.id];
      const nextDecor =
        item.category === 'decor'
          ? castleDecor.includes(item.id)
            ? castleDecor.filter((d) => d !== item.id)
            : [...castleDecor, item.id]
          : castleDecor;
      onStudentUpdate({
        ...student,
        coins: isOwned ? student.coins : student.coins - item.price,
        ownedItems: JSON.stringify(nextOwned),
        equippedOutfit: item.category === 'outfit' ? item.id : student.equippedOutfit,
        equippedPet: item.category === 'pet' ? item.id : student.equippedPet,
        castleDecor: JSON.stringify(nextDecor),
      });
      setMessage(isOwned ? `«${item.name}» در قلعه و شخصیت تو فعال شد!` : `«${item.name}» با موفقیت خریداری شد!`);
      return;
    }

    setBusyItem(item.id);
    try {
      if (!isOwned) {
        const res = await apiFetch<{ student: StudentProfile }>(
          `/api/students/${student.id}/shop/buy`,
          {
            method: 'POST',
            body: JSON.stringify({ itemId: item.id }),
          }
        );
        soundEngine.playCoin();
        onStudentUpdate(res.student);
        setMessage(`آفرین! «${item.name}» به کلکسیون تو اضافه شد.`);
      } else {
        const body: Record<string, unknown> = {};
        if (item.category === 'outfit') body.equippedOutfit = item.id;
        if (item.category === 'pet') body.equippedPet = item.id;
        if (item.category === 'decor') {
          const nextDecor = castleDecor.includes(item.id)
            ? castleDecor.filter((d) => d !== item.id)
            : [...castleDecor, item.id];
          body.castleDecor = nextDecor;
        }
        const res = await apiFetch<{ student: StudentProfile }>(`/api/students/${student.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        soundEngine.playClick();
        onStudentUpdate(res.student);
        setMessage(`تغییر ظاهر «${item.name}» ذخیره شد!`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'عملیات فروشگاه انجام نشد.');
    } finally {
      setBusyItem(null);
    }
  };

  const startOptionalRewardedChest = () => {
    if (rewardedChestsToday >= 3) {
      setMessage('سقف امروز صندوق جایزه اختیاری (۳ بار در روز) پر شده است.');
      return;
    }
    soundEngine.playClick();
    setWatchingAd(true);
    setAdSecondsLeft(5);
    const interval = window.setInterval(() => {
      setAdSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const finishRewardedChest = async (completed: boolean) => {
    setWatchingAd(false);
    if (!completed) {
      if (!isDemoMode) {
        apiFetch(`/api/students/${student.id}/ads/reward`, {
          method: 'POST',
          body: JSON.stringify({ completed: false }),
        }).catch(() => {});
      }
      setMessage('ویدیو پیش از پایان بسته شد، بنابراین سکه جایزه اضافه نشد.');
      return;
    }

    if (isDemoMode) {
      soundEngine.playCoin();
      onStudentUpdate({ ...student, coins: student.coins + 30 });
      setMessage('صندوق جایزه باز شد! +۳۰ سکه طلا دریافت کردی.');
      return;
    }

    try {
      const res = await apiFetch<{ student: StudentProfile; rewardCoins: number }>(
        `/api/students/${student.id}/ads/reward`,
        {
          method: 'POST',
          body: JSON.stringify({ completed: true }),
        }
      );
      soundEngine.playCoin();
      onStudentUpdate(res.student);
      onRefresh();
      setMessage(`صندوق جایزه اختیاری با موفقیت باز شد! +${formatPersianDigits(res.rewardCoins)} سکه طلا!`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'دریافت جایزه ممکن نشد.');
    }
  };

  const visibleItems =
    filter === 'all' ? SHOP_ITEMS : SHOP_ITEMS.filter((i) => i.category === filter);

  return (
    <div className="space-y-7">
      {/* Interactive Hero Castle Courtyard Scene */}
      <section className="rounded-3xl border border-[#E5DAC5] bg-white p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-5 flex flex-col items-center text-center">
          <HeroAvatarSvg
            heroClass={student.heroClass}
            equippedOutfit={student.equippedOutfit}
            equippedPet={student.equippedPet}
            avatarColor={student.avatarColor}
            size={150}
          />
          <h2 className="mt-3 text-2xl font-extrabold text-stone-900">قلعه قهرمان {student.nickname}</h2>
          <p className="mt-1 text-sm text-stone-600 tabular-nums">
            سکه موجود: <span className="font-extrabold text-amber-700">{formatPersianDigits(student.coins)}</span> ·
            امتیاز کل: <span className="font-extrabold text-teal-800">{formatPersianDigits(student.xp)}</span>
          </p>
        </div>

        {/* Custom SVG Interactive Castle Courtyard reflecting unlocked decorations */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-[#E5DAC5] bg-[#131B2E] p-4 overflow-hidden">
            <svg viewBox="0 0 560 220" className="w-full h-auto" aria-label="نمای قلعه قهرمان">
              {/* Sky */}
              <rect width="560" height="220" rx="14" fill="#1E293B" />
              <circle cx="80" cy="42" r="20" fill="#FDE68A" opacity="0.9" />
              <circle cx="150" cy="30" r="2.2" fill="#FEF3C7" />
              <circle cx="290" cy="24" r="2" fill="#FEF3C7" />
              <circle cx="440" cy="36" r="2.5" fill="#FEF3C7" />

              {/* Ground courtyard */}
              <rect x="0" y="158" width="560" height="62" fill="#065F46" />
              <path d="M210 158H350L385 220H175L210 158Z" fill="#D6C7AE" />

              {/* Castle Walls & Towers */}
              <rect x="165" y="76" width="230" height="86" fill="#F3E6CE" stroke="#78350F" strokeWidth="3" />
              <rect x="135" y="54" width="52" height="108" fill="#E7D3B0" stroke="#78350F" strokeWidth="3" />
              <rect x="373" y="54" width="52" height="108" fill="#E7D3B0" stroke="#78350F" strokeWidth="3" />
              {/* Turquoise Persian Dome */}
              <path d="M238 76C238 40 322 40 322 76Z" fill="#0D9488" stroke="#134E4A" strokeWidth="3" />
              {/* Arch Door */}
              <path d="M254 162V118C254 102 306 102 306 118V162Z" fill="#78350F" />

              {/* Decor: Star Banner */}
              {castleDecor.includes('banner_star') && (
                <g>
                  <line x1="280" y1="22" x2="280" y2="48" stroke="#F59E0B" strokeWidth="3" />
                  <polygon points="280,22 306,29 280,36" fill="#F59E0B" />
                </g>
              )}

              {/* Decor: Brass Telescope on Right Tower */}
              {castleDecor.includes('decor_telescope') && (
                <g transform="translate(384, 30)">
                  <line x1="14" y1="24" x2="6" y2="10" stroke="#F59E0B" strokeWidth="5" strokeLinecap="round" />
                  <line x1="14" y1="24" x2="14" y2="30" stroke="#92400E" strokeWidth="3" />
                  <circle cx="4" cy="9" r="3" fill="#99F6E4" />
                </g>
              )}

              {/* Decor: Turquoise Courtyard Fountain */}
              {castleDecor.includes('decor_fountain') && (
                <g transform="translate(232, 174)">
                  <ellipse cx="48" cy="18" rx="44" ry="13" fill="#14B8A6" stroke="#FDE68A" strokeWidth="3" />
                  <path d="M48 16V4M48 4C42 4 38 9 38 14M48 4C54 4 58 9 58 14" stroke="#CCFBF1" strokeWidth="2.4" fill="none" />
                </g>
              )}

              {/* Decor: Lanterns */}
              {castleDecor.includes('decor_lanterns') && (
                <g>
                  <circle cx="155" cy="116" r="8" fill="#FBBF24" opacity="0.95" />
                  <circle cx="405" cy="116" r="8" fill="#FBBF24" opacity="0.95" />
                </g>
              )}

              {/* Decor: Magic Library Shelf Wing */}
              {castleDecor.includes('decor_library') && (
                <g transform="translate(46, 112)">
                  <rect x="0" y="0" width="68" height="48" rx="6" fill="#92400E" stroke="#FDE68A" strokeWidth="2" />
                  <rect x="8" y="8" width="12" height="32" fill="#DC2626" />
                  <rect x="24" y="10" width="12" height="30" fill="#0D9488" />
                  <rect x="40" y="6" width="12" height="34" fill="#F59E0B" />
                </g>
              )}
            </svg>
            <p className="mt-2.5 text-center text-xs font-medium text-amber-100/85">
              وسایل تزئینی خریداری‌شده به‌صورت زنده در حیاط قلعه تو قرار می‌گیرند!
            </p>
          </div>
        </div>
      </section>

      {message && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
          {message}
        </div>
      )}

      {/* Optional Rewarded Chest (Separated from Learning Modules & Respects Parental Control!) */}
      {student.allowOptionalAds !== false ? (
        <section className="rounded-2xl border border-[#E5DAC5] bg-white p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shrink-0">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-stone-900">صندوق سکه جایزه‌دار اختیاری (ویژه فروشگاه)</h3>
              <p className="text-xs sm:text-sm text-stone-600">
                کاملاً اختیاری و جدا از درس و آزمون · با تماشای کامل پیام ایمن کودک، +۳۰ سکه تزئینی هدیه بگیر (باقی‌مانده امروز:{' '}
                {formatPersianDigits(Math.max(0, 3 - rewardedChestsToday))} از ۳).
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={rewardedChestsToday >= 3}
            onClick={startOptionalRewardedChest}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 disabled:text-stone-500 px-5 py-2.5 text-sm font-extrabold text-stone-950 cursor-pointer whitespace-nowrap"
          >
            <PlayCircle className="h-4 w-4" />
            <span>باز کردن صندوق اختیاری (+۳۰ سکه)</span>
          </button>
        </section>
      ) : (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/70 px-5 py-3.5 text-xs font-bold text-teal-900">
          فروشگاه در حالت بدون تبلیغ (تنظیم‌شده توسط والدین) قرار دارد. برای دریافت سکه، مأموریت‌ها و آزمون‌های سرزمین‌ها را انجام بده!
        </div>
      )}

      {/* Cosmetic Shop Filter Tabs & Grid */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-extrabold text-stone-900">فروشگاه لباس، حیوان خانگی و تزئین قلعه</h3>
          <div className="flex items-center gap-1 rounded-xl bg-[#EFE6D5] p-1">
            {(
              [
                ['all', 'همه آیتم‌ها'],
                ['outfit', 'لباس قهرمان'],
                ['pet', 'حیوان خانگی'],
                ['decor', 'تزئین قلعه'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setFilter(key);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  filter === key
                    ? 'bg-white text-stone-950 shadow-sm'
                    : 'text-stone-700 hover:text-stone-950'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map((item) => {
            const isOwned = ownedItems.includes(item.id);
            const isEquipped =
              student.equippedOutfit === item.id ||
              student.equippedPet === item.id ||
              castleDecor.includes(item.id);

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-[#E5DAC5] bg-white p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className="h-12 w-12 rounded-xl border border-stone-900/10 shrink-0"
                    style={{ backgroundColor: item.swatch }}
                  />
                  <div>
                    <h4 className="text-base font-extrabold text-stone-900">{item.name}</h4>
                    <p className="mt-0.5 text-xs text-stone-600 leading-relaxed">{item.desc}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-[#F1E8D8] pt-3">
                  <span className="inline-flex items-center gap-1 text-sm font-extrabold text-amber-800 tabular-nums">
                    <Coins className="h-4 w-4 text-amber-600" />
                    {item.price === 0 ? 'رایگان' : `${formatPersianDigits(item.price)} سکه`}
                  </span>

                  <button
                    type="button"
                    disabled={busyItem === item.id}
                    onClick={() => handleBuyOrEquip(item)}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                      isEquipped
                        ? 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200'
                        : isOwned
                          ? 'bg-stone-800 text-white hover:bg-stone-900'
                          : 'bg-amber-600 text-white hover:bg-amber-700'
                    }`}
                  >
                    {isEquipped && <Check className="h-3.5 w-3.5" />}
                    <span>
                      {isEquipped
                        ? item.category === 'decor'
                          ? 'در قلعه نصب شده'
                          : 'فعال'
                        : isOwned
                          ? 'انتخاب و استفاده'
                          : 'خرید با سکه'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Non-educational child-safe banner slot note (Strictly only in Shop, never in missions/exams!) */}
      {student.allowOptionalAds !== false && (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-[#F4EFE4] px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
          <span className="inline-flex items-center gap-2 font-semibold">
            <ShieldAlert className="h-4 w-4 text-teal-700" />
            جایگاه بنر غیرآموزشی (فقط در فروشگاه · مسدودسازی دسته‌های نامناسب کودک)
          </span>
          <span>در صفحات درس، تکلیف و آزمون هیچ تبلیغی نمایش داده نمی‌شود.</span>
        </div>
      )}

      {/* Rewarded Preview Modal */}
      {watchingAd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-300 bg-white p-6 text-center space-y-5">
            <h3 className="text-lg font-extrabold text-stone-900">
              صندوق جایزه اختیاری (حالت آزمایشی ایمن کودک)
            </h3>
            <p className="text-sm text-stone-600 leading-relaxed">
              در نسخه متصل به تپسل، اینجا پیام ویدیویی ایمن کودک پخش می‌شود و پاداش فقط پس از تکمیل کامل تأیید می‌گردد.
            </p>
            <div className="rounded-2xl bg-[#131B2E] py-8 text-amber-300 text-3xl font-extrabold tabular-nums">
              {adSecondsLeft > 0
                ? `${formatPersianDigits(adSecondsLeft)} ثانیه تا باز شدن صندوق...`
                : 'صندوق آماده دریافت است!'}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => finishRewardedChest(false)}
                className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold text-stone-700 cursor-pointer"
              >
                بستن بدون جایزه
              </button>
              <button
                type="button"
                disabled={adSecondsLeft > 0}
                onClick={() => finishRewardedChest(true)}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 px-5 py-2.5 text-sm font-bold text-white cursor-pointer"
              >
                دریافت +۳۰ سکه
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
