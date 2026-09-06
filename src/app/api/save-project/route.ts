import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyAuthOptional } from '@/lib/auth-middleware';
import { rateLimit, getRateLimitKey } from '@/utils/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // 1. Authenticate (optional during beta)
  const auth = await verifyAuthOptional(request);

  // 2. Rate limit
  const rateLimitKey = getRateLimitKey(auth.userId, request);
  const limiter = rateLimit(rateLimitKey, 20, 60 * 1000);
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded.', resetIn: limiter.resetIn },
      { status: 429 }
    );
  }

  try {
    const { projectData, projectId } = await request.json();

    if (!projectData) {
      return NextResponse.json({ error: 'Project data is required' }, { status: 400 });
    }

    const db = getAdminDb();

    // If updating existing project, verify ownership (IDOR fix)
    if (projectId) {
      const existingDoc = await db.collection('projects').doc(projectId).get();
      if (existingDoc.exists) {
        const existingData = existingDoc.data();
        if (existingData?.userId && existingData.userId !== auth.userId) {
          return NextResponse.json(
            { error: 'You do not have permission to modify this project.' },
            { status: 403 }
          );
        }
      }
    }

    const projectRef = projectId
      ? db.collection('projects').doc(projectId)
      : db.collection('projects').doc();

    const { userId: _clientUserId, ...safeProjectData } = projectData;

    await projectRef.set({
      ...safeProjectData,
      userId: auth.userId,
      updatedAt: new Date().toISOString(),
      ...(projectId ? {} : { createdAt: new Date().toISOString() }),
    }, { merge: true });

    return NextResponse.json({
      success: true,
      projectId: projectRef.id,
    });
  } catch (error: any) {
    console.error('Save project error:', error);
    return NextResponse.json(
      { error: 'Failed to save project', details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // 1. Authenticate (optional during beta)
  const auth = await verifyAuthOptional(request);

  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection('projects')
      .where('userId', '==', auth.userId)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ projects });
  } catch (error: any) {
    console.error('Fetch projects error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects', details: error.message },
      { status: 500 }
    );
  }
}
