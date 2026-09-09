'use client';

import { ensureAuth } from '@/lib/firebase';

/**
 * Authenticated fetch wrapper — ensures user is signed in (at minimum anonymously)
 * and attaches Firebase ID token to every request.
 * 
 * With Firebase Anonymous Auth enabled, every user gets a real auth.uid
 * which makes Firestore security rules work for all users.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);

  try {
    const user = await ensureAuth();
    if (user) {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    }
    // If ensureAuth() returned null (rare edge case), request proceeds
    // without auth — server middleware will fall back to IP-hash
  } catch (error) {
    console.warn('Auth token not available, proceeding without auth:', error);
  }

  return fetch(url, { ...options, headers });
}
