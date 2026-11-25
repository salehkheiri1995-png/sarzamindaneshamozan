import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

const CONFETTI_PARTICLES = [
  { id: 1, x: -110, y: -90, rotate: -140, color: '#F59E0B', delay: 0 },
  { id: 2, x: -75, y: -125, rotate: 110, color: '#10B981', delay: 0.04 },
  { id: 3, x: -35, y: -140, rotate: -90, color: '#0D9488', delay: 0.02 },
  { id: 4, x: 15, y: -135, rotate: 160, color: '#6366F1', delay: 0.06 },
  { id: 5, x: 65, y: -120, rotate: -110, color: '#EC4899', delay: 0.03 },
  { id: 6, x: 110, y: -85, rotate: 130, color: '#FBBF24', delay: 0.05 },
  { id: 7, x: -95, y: -45, rotate: 85, color: '#14B8A6', delay: 0.07 },
  { id: 8, x: 95, y: -40, rotate: -95, color: '#F97316', delay: 0.04 },
  { id: 9, x: -50, y: -80, rotate: 170, color: '#8B5CF6', delay: 0.08 },
  { id: 10, x: 50, y: -85, rotate: -150, color: '#22C55E', delay: 0.01 },
];

export function ConfettiBurst({ active }: { active: boolean }) {
  const prefersReduced = useReducedMotion();
  if (!active || prefersReduced) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-1/3 z-30 flex items-center justify-center overflow-visible"
    >
      {CONFETTI_PARTICLES.map((p) => (
        <motion.span
          key={p.id}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0.4, rotate: 0 }}
          animate={{
            opacity: [1, 1, 0],
            x: p.x,
            y: [0, p.y, p.y + 70],
            scale: [0.6, 1.15, 0.8],
            rotate: p.rotate,
          }}
          transition={{ duration: 1.05, delay: p.delay, ease: 'easeOut' }}
          style={{ backgroundColor: p.color }}
          className="absolute h-2.5 w-2.5 rounded-sm shadow-xs"
        />
      ))}
    </div>
  );
}
