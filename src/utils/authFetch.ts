'use client';

import { auth } from '@/lib/firebase';

/**
 * Authenticated fetch wrapper — automatically attaches Firebase ID token.
 * Use this instead of fetch() for all /api/ calls.
 * Throws if user is not signed in.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in to continue.');
  }

  const token = await user.getIdToken();
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  // Don't override Content-Type for FormData (browser sets boundary automatically)
  return fetch(url, { ...options, headers });
}
