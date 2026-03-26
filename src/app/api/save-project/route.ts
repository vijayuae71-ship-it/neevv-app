import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    // Verify auth token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const { projectData, projectId } = await request.json();

    const projectRef = projectId
      ? adminDb.collection('projects').doc(projectId)
      : adminDb.collection('projects').doc();

    await projectRef.set({
      ...projectData,
      userId,
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
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userId = decodedToken.uid;

    const snapshot = await adminDb
      .collection('projects')
      .where('userId', '==', userId)
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
