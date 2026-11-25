import React from 'react';

export function SkeletonLoader({ variant = 'panel' }: { variant?: 'panel' | 'world' | 'compact' }) {
  if (variant === 'compact') {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 w-44 rounded-xl bg-[#EFE6D5]" />
        <div className="h-24 w-full rounded-2xl border border-[#E5DAC5] bg-white/80" />
        <div className="h-24 w-full rounded-2xl border border-[#E5DAC5] bg-white/80" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-28 w-full rounded-3xl border border-[#E5DAC5] bg-[#EFE6D5]/70 p-5">
        <div className="h-5 w-48 rounded-lg bg-[#E5DAC5]" />
        <div className="mt-3 h-4 w-72 max-w-full rounded-lg bg-[#E5DAC5]/80" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-2xl border border-[#E5DAC5] bg-white/90 p-4">
            <div className="h-3 w-20 rounded bg-[#EFE6D5]" />
            <div className="mt-3 h-6 w-12 rounded bg-[#E5DAC5]" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-48 rounded-3xl border border-[#E5DAC5] bg-white/90 p-5">
          <div className="h-4 w-36 rounded bg-[#EFE6D5]" />
          <div className="mt-4 space-y-2.5">
            <div className="h-3 w-full rounded bg-[#FBF7EF]" />
            <div className="h-3 w-5/6 rounded bg-[#FBF7EF]" />
            <div className="h-3 w-4/6 rounded bg-[#FBF7EF]" />
          </div>
        </div>
        <div className="h-48 rounded-3xl border border-[#E5DAC5] bg-white/90 p-5">
          <div className="h-4 w-40 rounded bg-[#EFE6D5]" />
          <div className="mt-4 space-y-2.5">
            <div className="h-3 w-full rounded bg-[#FBF7EF]" />
            <div className="h-3 w-5/6 rounded bg-[#FBF7EF]" />
            <div className="h-3 w-3/4 rounded bg-[#FBF7EF]" />
          </div>
        </div>
      </div>
    </div>
  );
}
