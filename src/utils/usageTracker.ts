import { getAdminDb } from '@/lib/firebase-admin';

interface UsageLimits {
  drawings: number;    // per day
  renders: number;     // per day
  analyses: number;    // per day
}

const FREE_TIER_LIMITS: UsageLimits = {
  drawings: 50,
  renders: 10,
  analyses: 20,
};

type UsageType = 'drawings' | 'renders' | 'analyses';

/**
 * Check if user has remaining quota and increment usage.
 * Uses Firestore document: usage/{userId}/daily/{YYYY-MM-DD}
 * Returns { allowed, remaining, limit } or throws on Firestore error.
 */
export async function checkAndIncrementUsage(
  userId: string,
  type: UsageType
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const db = getAdminDb();
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const docRef = db.collection('usage').doc(userId).collection('daily').doc(today);
  const limit = FREE_TIER_LIMITS[type];

  try {
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      const data = doc.data() || {};
      const currentCount = data[type] || 0;

      if (currentCount >= limit) {
        return { allowed: false, remaining: 0, limit };
      }

      transaction.set(docRef, {
        ...data,
        [type]: currentCount + 1,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });

      return { allowed: true, remaining: limit - currentCount - 1, limit };
    });

    return result;
  } catch (error) {
    console.error('Usage tracking error:', error);
    // Fail open but log — don't block users on tracking errors
    return { allowed: true, remaining: limit, limit };
  }
}

/**
 * Get current usage for a user (read-only)
 */
export async function getUserUsage(
  userId: string
): Promise<Record<UsageType, number>> {
  const db = getAdminDb();
  const today = new Date().toISOString().split('T')[0];
  const docRef = db.collection('usage').doc(userId).collection('daily').doc(today);

  try {
    const doc = await docRef.get();
    const data = doc.data() || {};
    return {
      drawings: data.drawings || 0,
      renders: data.renders || 0,
      analyses: data.analyses || 0,
    };
  } catch {
    return { drawings: 0, renders: 0, analyses: 0 };
  }
}
