import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export interface AuthenticatedRequest {
  userId: string;
  email?: string;
}

/**
 * Verify Firebase ID token from Authorization header.
 * Returns userId + email on success, or a 401 NextResponse on failure.
 */
export async function verifyAuth(
  request: NextRequest
): Promise<AuthenticatedRequest | NextResponse> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in.' },
        { status: 401 }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    if (!token || token === 'null' || token === 'undefined') {
      return NextResponse.json(
        { error: 'Invalid authentication token.' },
        { status: 401 }
      );
    }

    const decodedToken = await getAdminAuth().verifyIdToken(token);
    return {
      userId: decodedToken.uid,
      email: decodedToken.email,
    };
  } catch (error: any) {
    console.error('Auth verification failed:', error.message);
    
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json(
        { error: 'Session expired. Please sign in again.' },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { error: 'Authentication failed.' },
      { status: 401 }
    );
  }
}

/**
 * Helper to check if verifyAuth returned an error response
 */
export function isAuthError(
  result: AuthenticatedRequest | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
