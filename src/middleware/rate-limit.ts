import type { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  maxAttempts: number;
  keyPrefix: string;
  message?: string;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, BucketEntry>>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }
}, 5 * 60 * 1000);

if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return String(forwarded[0]).trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function createRateLimiter(options: RateLimitOptions) {
  const store = new Map<string, BucketEntry>();
  stores.set(options.keyPrefix, store);

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const clientIp = getClientIp(req);
    const key = `${options.keyPrefix}:${clientIp}`;

    // Evict expired entry or prevent unbounded growth
    if (store.size > 5000) {
      for (const [k, entry] of store.entries()) {
        if (entry.resetAt <= now) store.delete(k);
      }
    }

    const existing = store.get(key);
    if (!existing || existing.resetAt <= now) {
      store.set(key, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return next();
    }

    if (existing.count >= options.maxAttempts) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error:
          options.message ||
          `تعداد درخواست‌های شما بیش از حد مجاز است. لطفاً ${retryAfterSeconds} ثانیه دیگر دوباره تلاش کنید.`,
      });
    }

    existing.count += 1;
    return next();
  };
}
