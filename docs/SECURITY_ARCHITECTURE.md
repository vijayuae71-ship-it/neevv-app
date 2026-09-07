# neevv.in Security Architecture

**Audience:** Vijay, App Owner  
**Status:** Beta  
**Purpose:** Explain how neevv.in authenticates users, protects API endpoints, controls usage, and safeguards service credentials.

---

## 1. Executive Summary

neevv.in currently uses a **beta-friendly security model**:

- Signed-in users are identified through Firebase Authentication and their Firebase ID token.
- Anonymous beta users are supported through an IP-derived anonymous identity.
- All three generation/analysis API routes apply per-user rate limits and daily quotas before calling Gemini.
- Gemini credentials are supplied through deployment secrets rather than committed to source code.
- Generated renders are stored under user-scoped paths, and project updates verify ownership.

Authentication is intentionally **optional during beta**. Before a production launch, authentication should be enforced on the protected routes, Firestore rules should be added, and storage access should be tightened further.

> **Important:** The current controls are primarily server-side application controls. They provide useful protection, but they do not yet constitute a fully enforced production isolation model.

---

## 2. Security at a Glance

| Area | Current implementation | Security outcome | Production follow-up |
|---|---|---|---|
| User authentication | Firebase Auth ID tokens; optional during beta | Signed-in users can be tied to a real Firebase user | Replace `verifyAuthOptional()` with `verifyAuth()` when ready |
| Anonymous access | SHA-256 hash of client IP, formatted as `anon_<hash>` | Enables beta access without sign-in and gives anonymous users a repeatable identity | Accept that IP-based identity is approximate and can be shared or change |
| API rate limiting | In-memory limits keyed by user ID | Slows rapid repeated requests | Use a shared/distributed limiter if multiple Cloud Run instances need one global limit |
| Daily quotas | Firestore transactions | Atomic per-user daily counters | Investigate fail-closed behavior for stricter production cost protection |
| Gemini API key | Environment/deployment secret | Key is not hardcoded in application source | Continue using Secret Manager or protected Cloud Build substitutions |
| Render storage | GCS paths scoped by user ID and project ID | Prevents accidental cross-user path reuse at the application layer | Add stronger bucket/object authorization where practical |
| Project updates | Ownership checked; client `userId` stripped | Helps prevent IDOR and user impersonation | Add and test Firestore security rules |
| Firestore access | Server uses Admin SDK | Backend can perform trusted operations | Add rules for direct client access to `projects` and `usage` |

---

## 3. Request Security Flow

When a user clicks **Generate Drawing**, the request follows this sequence:

```text
User clicks "Generate Drawing"
  |
  v
authFetch() wraps the browser request
  |
  +-- Signed in: attaches Authorization: Bearer <Firebase ID token>
  |
  +-- Not signed in: sends request without a token (beta mode)
  |
  v
API route receives the request
  |
  v
verifyAuthOptional()
  |
  +-- Token present: Firebase verifies the token
  |                 -> real Firebase userId
  |
  +-- No token: hash the client IP
                    -> anon_<sha256hash> userId
  |
  v
rateLimit(userId)
  |
  +-- Too many requests -> HTTP 429
  |
  v
checkAndIncrementUsage(userId)
  |
  +-- Daily quota exceeded -> HTTP 429
  |
  v
Call Gemini API using GEMINI_API_KEY
  |
  v
Return the generated result to the browser
```

The same protection pattern is used by:

- `generate-drawing`
- `generate-render`
- `analyze-drawing`

The usage endpoint (`/api/usage`) lets a user check their remaining quota.

---

## 4. Authentication and Identity

### 4.1 Firebase Admin initialization

**File:** `src/lib/firebase-admin.ts`

The server initializes the Firebase Admin SDK as a singleton:

1. On Cloud Run, it uses **Application Default Credentials (ADC)**. This avoids putting service-account credentials in environment variables.
2. For local development, it can fall back to an explicit certificate when the following values are configured:
   - `GCP_PROJECT_ID`
   - `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `FIREBASE_ADMIN_PRIVATE_KEY`

The module exposes:

- `getAdminDb()` for Firestore
- `getAdminAuth()` for Firebase Authentication

Keeping initialization centralized avoids creating unnecessary SDK clients and gives all server routes the same trusted Firebase configuration.

### 4.2 Strict authentication

**Function:** `verifyAuth()`  
**Header required:**

```http
Authorization: Bearer <Firebase ID token>
```

`verifyAuth()` verifies the token with Firebase Authentication and rejects requests when the token is missing, invalid, or expired. Rejected requests receive HTTP `401 Unauthorized`.

This is the intended mode for authenticated production APIs.

### 4.3 Optional authentication for beta

**Function:** `verifyAuthOptional()`

The beta mode behaves as follows:

- If a bearer token is present, it is verified and the request is associated with the real Firebase user ID.
- If no token is present, the request is associated with an anonymous identity derived from the client IP.
- Missing authentication does not produce a `401` response.

The current three API routes use this optional function so users can try the product before signing in.

Anonymous identity is represented conceptually as:

```text
anon_<sha256(client IP)>
```

This avoids storing the raw IP as the user identifier. However, an IP-based identity is not equivalent to an account: multiple people may share an IP address, and a user’s identity may change when their network changes.

### 4.4 Client-side token handling

**File:** `src/utils/authFetch.ts`

All browser API calls should go through `authFetch()`:

- For a signed-in Firebase user, it obtains the current Firebase ID token and adds the `Authorization` header.
- For a beta user who is not signed in, it sends the request without a token.

The client wrapper improves consistency, but it is not a security boundary. The server must always verify tokens itself; a client can be modified or bypassed.

---

## 5. Abuse Prevention and Usage Controls

### 5.1 Per-minute rate limiting

**File:** `src/utils/rateLimit.ts`

Rate limits are keyed by the server-derived `userId`, not by a client-provided user ID or an `X-Forwarded-For` value. This prevents users from simply changing a request field to impersonate another identity.

| Endpoint | Limit |
|---|---:|
| `generate-drawing` | 10 requests/minute |
| `generate-render` | 5 requests/minute |
| `analyze-drawing` | 10 requests/minute |

A request exceeding its short-term limit receives HTTP `429 Too Many Requests`.

The limiter is currently **in memory**. That means its state belongs to a running application instance. In a multi-instance Cloud Run deployment, limits may not be globally synchronized across all instances. A shared rate-limit store would provide stronger, consistent enforcement at scale.

### 5.2 Daily quotas

**File:** `src/utils/usageTracker.ts`  
**Firestore path:**

```text
usage/{userId}/daily/{YYYY-MM-DD}
```

Current daily limits are:

| Operation | Daily limit per identity |
|---|---:|
| Drawings | 50 |
| Renders | 10 |
| Analyses | 20 |

Counters are updated using Firestore transactions. This makes the check-and-increment operation atomic, reducing the chance that simultaneous requests bypass a quota.

If Firestore is unavailable, the current implementation **fails open**: the request is allowed rather than blocked. This favors availability during beta, but it can permit usage beyond the intended quota and may increase Gemini costs during an outage. A production cost-control posture may require a carefully designed fail-closed or degraded-mode strategy.

---

## 6. API Route Protection Order

Each protected generation/analysis route follows this order:

1. **Resolve identity** with `verifyAuthOptional()`.
2. **Apply the per-minute rate limit** using the resolved identity.
3. **Check and increment the daily quota** in Firestore.
4. **Call Gemini** only after the request passes the preceding checks.
5. **Return the result** to the client.

This ordering is important because expensive Gemini work happens only after basic abuse and quota checks succeed.

A simplified server-side pattern is:

```ts
const { userId } = await verifyAuthOptional(request);

if (!rateLimit(userId, operation)) {
  return new Response("Too many requests", { status: 429 });
}

const allowed = await checkAndIncrementUsage(userId, operation);
if (!allowed) {
  return new Response("Daily quota exceeded", { status: 429 });
}

// Only now call Gemini.
```

---

## 7. Data and Storage Protection

### 7.1 Render object paths

Generated render files use user-scoped Google Cloud Storage paths:

```text
renders/{userId}/{projectId}/{type}_{timestamp}.png
```

Previously, paths were based only on the project ID:

```text
renders/{projectId}/...
```

Including `userId` reduces the risk that one user can guess or reuse another user’s project path. The current protection is enforced by server-side path construction and access logic; it is not yet equivalent to per-user bucket-level permissions.

### 7.2 Project ownership and IDOR protection

The save-project route:

- Verifies that the project belongs to the requesting user before updating it.
- Removes or ignores a client-supplied `userId` so a caller cannot use the request body to impersonate another user.

This addresses a common **Insecure Direct Object Reference (IDOR)** risk: changing a project ID or user ID in a request should not grant access to another user’s project.

### 7.3 Firestore rules status

Firestore security rules for the `projects` and `usage` collections are not yet complete. Backend operations currently use the Firebase Admin SDK, which bypasses Firestore rules by design.

This means the server-side checks are currently essential. Before allowing direct client access to these collections, rules should be added and tested to ensure users can read or write only their own permitted records.

---

## 8. Secrets and Deployment Security

### 8.1 Gemini API key

The Gemini API key is not hardcoded in the application or deployment script.

- `deploy.sh` now fails if `GEMINI_API_KEY` is not supplied.
- `cloudbuild.yaml` receives the key through the `_GEMINI_API_KEY` substitution variable configured in Cloud Build trigger settings.
- The key should remain in Secret Manager or an equivalently protected deployment configuration.

The previous API key was rotated, old keys were deleted, and the replacement key is configured in the Cloud Build trigger.

### 8.2 Tasklet build notifications

`cloudbuild.yaml` also contains a webhook token for Tasklet build notifications. It should be treated as a secret and kept out of source code and logs wherever the deployment system supports protected substitutions or Secret Manager references.

### 8.3 Operational practices

- Never commit API keys, private keys, bearer tokens, or webhook secrets.
- Avoid printing secrets in build logs or application errors.
- Rotate credentials immediately if they are exposed.
- Grant Cloud Run and Cloud Build only the IAM permissions they need.
- Keep local development credentials outside the repository.

---

## 9. Current Beta Posture

The current configuration intentionally balances frictionless product testing with basic abuse controls:

- Google sign-in is enabled in Firebase Console.
- Anonymous users can still use the app.
- Signed-in users receive a stable Firebase identity.
- Anonymous users receive an IP-derived identity for rate limits and quotas.
- All three primary API routes use optional authentication.

This is appropriate for a controlled beta, but anonymous access makes it harder to guarantee that one person corresponds to one quota. Shared networks, changing IPs, and automated traffic can affect anonymous identities.

---

## 10. Recommended Production Readiness Plan

Before a broad production launch, prioritize the following:

### Priority 1 — Enforce authentication

Replace `verifyAuthOptional()` with `verifyAuth()` on the three primary API routes once sign-in is required. Confirm that the client always obtains and sends a current Firebase ID token.

### Priority 2 — Add Firestore security rules

Define and test rules for `projects` and `usage`, including:

- A user can access only records belonging to that user.
- Clients cannot change ownership fields.
- Usage counters cannot be arbitrarily increased or reset by clients.
- Administrative/server-only operations remain handled through the Admin SDK.

### Priority 3 — Strengthen storage authorization

Retain user-scoped object paths and add stronger authorization around object reads and writes, such as server-mediated downloads, signed URLs with short expiration, or appropriate bucket/IAM controls.

### Priority 4 — Make abuse controls deployment-aware

Move rate-limit state to a shared store if Cloud Run scales across instances. Review quota behavior when Firestore is unavailable, particularly in relation to Gemini cost exposure.

### Priority 5 — Monitor and test

Add monitoring and alerts for:

- Repeated `401` and `429` responses
- Unusual Gemini usage or cost
- Failed Firebase token verification
- Firestore and Cloud Storage errors
- Unexpected cross-user access attempts

Perform tests for IDOR, token replay/expiry, quota races, malformed requests, and secret leakage in logs.

---

## 11. Ownership Checklist

| Item | Beta status | Owner action |
|---|---|---|
| Firebase Google sign-in enabled | Done | Keep provider configuration reviewed |
| API key rotated | Done | Rotate again immediately if exposure occurs |
| API key removed from hardcoded deployment script | Done | Keep secrets in protected deployment configuration |
| Optional authentication | Active | Change to strict authentication for production |
| Per-user rate and daily quotas | Active | Review multi-instance and failure behavior |
| User-scoped render paths | Active | Add stronger object authorization |
| Project ownership check | Active | Keep server-side check and add rules |
| Firestore rules for `projects`/`usage` | Not yet done | Implement, test, and deploy before direct client access |
| Production security monitoring | Not specified | Add alerts and review logs regularly |

---

## 12. Bottom Line

neevv.in already has a solid beta foundation: server-side Firebase identity handling, request throttling, atomic daily quotas, user-scoped render paths, project ownership checks, and protected Gemini credentials.

The most important transition for production is to move from **optional trust for beta users** to **enforced authentication and defense-in-depth**. In practical terms, that means strict token verification, tested Firestore rules, stronger storage authorization, and shared monitoring/rate-limiting controls.
