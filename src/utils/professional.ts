import { getAdminDb } from '@/lib/firebase-admin';

/**
 * Approved professionals (architects, engineers) get the DXF / IFC export and, later, plan editing.
 * An account is approved when professionals/<its user id> exists with approved: true. Approvals are
 * made by hand, after checking the registration number from the beta sign-up form.
 */
export async function isApprovedProfessional(userId: string): Promise<boolean> {
  if (!userId || userId.startsWith('anon_')) return false;
  try {
    const snap = await getAdminDb().collection('professionals').doc(userId).get();
    return snap.exists && snap.data()?.approved === true;
  } catch {
    return false;
  }
}
