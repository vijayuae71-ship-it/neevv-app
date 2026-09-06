// Rate limiter keyed on userId (authenticated) or IP (fallback)
// In production with multiple Cloud Run instances, use Redis/Memorystore instead

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function rateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, resetIn: entry.resetTime - now };
}

/**
 * Get rate limit key — prefer userId over IP to prevent header spoofing
 */
export function getRateLimitKey(userId: string | null, request: Request): string {
  if (userId) return `user:${userId}`;
  // Fallback to IP — only used if auth is somehow bypassed
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}

// Keep old export for backward compatibility during transition
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}
