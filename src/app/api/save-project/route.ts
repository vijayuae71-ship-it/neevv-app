import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await getAdminAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const { projectData, projectId } = await request.json();

    const db = getAdminDb();
    const projectRef = projectId
      ? db.collection('projects').doc(projectId)
      : db.collection('projects').doc();

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
    const decodedToken = await getAdminAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const db = getAdminDb();
    const snapshot = await db
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
