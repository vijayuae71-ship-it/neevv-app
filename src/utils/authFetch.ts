'use client';

import { auth } from '@/lib/firebase';

/**
 * Authenticated fetch wrapper — attaches Firebase ID token if user is signed in.
 * During beta: works without sign-in (sends request without auth header).
 * After beta: can enforce sign-in by uncommenting the throw.
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);

  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    }
    // Beta: allow unauthenticated requests
    // Post-beta: uncomment below to enforce sign-in
    // else {
    //   throw new Error('Please sign in to continue.');
    // }
  } catch (error) {
    // If token retrieval fails, proceed without auth (beta mode)
    console.warn('Auth token not available, proceeding without auth:', error);
  }

  return fetch(url, { ...options, headers });
}
