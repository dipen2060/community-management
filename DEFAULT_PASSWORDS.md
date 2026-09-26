# Default Passwords — Admin, Staff & Resident Accounts

**Code review only. No code was changed.**

Reviewed: `community-management` (Tole Community Management System)

---

## TL;DR — The short answer

> **There is NO fixed or hardcoded default password in this project.**

When an admin creates a **user**, **staff**, or another **admin**, the backend generates a
**random 24-character temporary password** at that moment. It is different for every single
account, it is never the same twice, an d it is not stored anywhere in the codebase.

So "the default password" cannot be written down, because it does not exist as a fixed value —
it only exists once, at the moment of account creation.

---

## 1. Where the password comes from

Single generator, used by every role:

**`backend/utils/userCredentials.js`** (lines 23–25)

```js
function generateTemporaryPassword() {
  return crypto.randomBytes(18).toString('base64url');
}
```

### Properties of the generated value

| Property | Value |
|---|---|
| Source | Node.js `crypto.randomBytes` (CSPRNG — cryptographically secure) |
| Entropy | 18 bytes = **144 bits** |
| Length | **Exactly 24 characters** (18 bytes divides evenly into 3 base64 blocks, so no `=` padding) |
| Alphabet | `A–Z`, `a–z`, `0–9`, `-`, `_` (URL-safe base64) |
| Uniqueness | Guaranteed unique per call; verified by the test suite |
| Storage | bcrypt hash, cost factor **10** (`backend/models/User.js` line 25) |
| Plaintext retention | **None** — never written to the DB, never logged, never returned by the API |

> Example of the *format* (illustrative only — not a real credential):
> `xK7pQm2Zr9TbL4vNc8WdH3s`

---

## 2. Password behaviour per role

All three roles use the **exact same** generator. There is no per-role difference in how the
password is produced. The only differences are the extra fields each role requires.

### 2.1 Admin

| Item | Behaviour |
|---|---|
| Created via | `POST /api/users` (`userController.createUser`, line 43) with `role: 'admin'` |
| Who can create | Only an existing admin (`routes/users.js` line 16 → `authorize('admin')`) |
| Password | Random 24-char temporary password (identical generator to other roles) |
| `mustChangePassword` | Set to `true` at creation |
| `exportSection` | Forced to `'all'` — set in the model pre-save hook (`User.js` line 23) and the controller (line 75) |
| Specialization | Not applicable / set to `null` |
| Password returned by API? | **No** |
| Password changeable by user? | Yes — via `PUT /api/users/me/profile` (self-service) |

### 2.2 Staff

| Item | Behaviour |
|---|---|
| Created via | `POST /api/users` with `role: 'staff'` |
| Who can create | Admin only |
| Password | Random 24-char temporary password |
| `mustChangePassword` | `true` at creation |
| Extra required field | **`specialization` is mandatory** — controller rejects the request without it (line 56); allowed values: `water`, `electric`, `lift`, `sanitation`, `security`, `general` |
| `exportSection` | Admin-chosen or `null`; controls which report section this staff member may export |
| Password returned by API? | **No** |
| Password changeable by user? | Yes — via `PUT /api/users/me/profile` |

### 2.3 Resident

| Item | Behaviour |
|---|---|
| Created via | `POST /api/users` with `role: 'resident'` (this is also the schema default) |
| Who can create | Admin only — there is **no public self-registration / signup endpoint** |
| Password | Random 24-char temporary password |
| `mustChangePassword` | `true` at creation |
| `specialization` | Forced to `null` |
| `exportSection` | Forced to `null` |
| Password returned by API? | **No** |
| Password changeable by user? | Yes — via `PUT /api/users/me/profile` |

---

## 3. Seeded demo accounts (`npm run seed`)

`backend/utils/seed.js` lines 34–43 creates 8 accounts, each with its own freshly generated
random password via the same helper:

```js
const temporaryPassword = () => ({ password: generateTemporaryPassword(), mustChangePassword: true });
```

| # | Name | Username | Email (login ID) | Role | Specialization | Export section |
|---|---|---|---|---|---|---|
| 1 | Admin Sharma | `admin.sharma` | `admin@tole.com` | admin | — | all |
| 2 | General Staff | `general.staff` | `staff@tole.com` | staff | general | complaints |
| 3 | Bishnu Electrician | `bishnu.electrician` | `electrician@tole.com` | staff | electric | complaints |
| 4 | Krishna Plumber | `krishna.plumber` | `plumber@tole.com` | staff | water | dues |
| 5 | Suresh Guard | `suresh.guard` | `guard@tole.com` | staff | security | *(none)* |
| 6 | Ram Bahadur | `ram.bahadur` | `ram@tole.com` | resident | — | — |
| 7 | Sita Devi | `sita.devi` | `sita@tole.com` | resident | — | — |
| 8 | Hari Prasad | `hari.prasad` | `hari@tole.com` | resident | — | — |

**Password for all 8:** a different random 24-character value each, and **none of them are printed
or recoverable** — see Issue #2 below.

Seed safety guards: refuses to run unless `NODE_ENV=development`, refuses a production-looking
`MONGO_URI`, and **drops the entire database** before seeding.

---

## 4. How login works

`backend/controllers/authController.js` line 12:

- Login identifier is the **email address**, **not** the username.
- `username` (`ram.bahadur`) is a **display identifier only** — it cannot be used to log in.
- Deactivated accounts (`isActive: false`) are rejected even with a correct password.
- The response returns a JWT plus a `mustChangePassword` flag so the frontend can force a
  change-password screen.

---

## 5. Password reset by admin

`PUT /api/users/:id/reset-password` (`userController.resetPassword`, line 181)

- Generates a **new** random 24-character temporary password.
- Sets `mustChangePassword = true`.
- Blocks inactive accounts (404).
- Writes an audit log entry: action `user_password_reset`, reason `default_password_reset`.
- **Password is not returned in the response.**

---

## 6. Self-service password change

`PUT /api/users/me/profile` (`userController.updateMyProfile`, line 258)

- Requires the **current password** to be supplied and verified.
- New password must be **at least 6 characters** (controller line 295) and must match the
  confirmation field on the frontend (`Profile.js` lines 44–54).
- Uses `.save()` deliberately so the bcrypt pre-save hook runs — the code comments warn that
  `findByIdAndUpdate` would store the password in plaintext.

---

## 7. Security measures that are correctly implemented

| Control | Status |
|---|---|
| CSPRNG password generation | ✅ `crypto.randomBytes` |
| 144-bit entropy, 24-char length | ✅ |
| bcrypt hashing, cost 10 | ✅ |
| `password` field excluded from all queries | ✅ `.select('-password')` used throughout |
| Temp password never returned in API response | ✅ |
| Temp password never written to logs (only "generated for &lt;email&gt;" is logged) | ✅ |
| Audit-log redaction of `password`, `currentPassword`, `newPassword`, `token`, `secret` | ✅ `utils/auditLogger.js` |
| `mustChangePassword` flag surfaced to the client | ✅ |
| Admin-only account creation (route level) | ✅ `authorize('admin')` |
| JWT secret validated (≥32 chars, not a placeholder) at boot | ✅ `config/env.js` |
| Login rate limiting | ✅ `express-rate-limit` is a dependency |
| No hardcoded demo credentials in the repo | ✅ |

---

## 8. Issues found during review

### Issue #1 — Frontend expects a password the backend never sends (functional bug)

`frontend/src/pages/Staff.js`

- Line 116–119 (create): reads `res.data.password`
- Line 158 (reset): `if (res.data.username && res.data.password)`

But `userController.createUser` returns credentials **nested under `data`** and deliberately
omits the password (lines 90–94), and `resetPassword` returns **no** password at all (line 192).

**Consequences:**
1. The "credentials" modal always renders a **blank password** (`credentials.password || ''`, line 637).
2. `res.data.username` is also wrong for create — the real username is at `res.data.data.username`.
3. After a reset, the `if` is always false, so the admin only gets a plain `alert()`.

**The admin is told a password exists but can never see or read it anywhere.**

### Issue #2 — Seeded accounts cannot be logged into (documentation/behaviour mismatch)

`README.md` lines 61–63 states:

> "For local development only, `npm run seed` creates demo users and **prints their one-time
> development credentials in the backend terminal**."

But `seed.js` line 89 only prints:

> "Temporary passwords were generated for seeded users and must be delivered through a secure channel."

The plaintext passwords are generated, immediately handed to bcrypt, and **discarded**. They are
never printed, logged, or stored in recoverable form.

**Consequence:** after seeding, all 8 demo accounts (including the only admin) are permanently
unusable. A fresh developer cannot log in at all.

### Issue #3 — No production bootstrap path for the first admin

There is no script, endpoint, or CLI to create the **first** administrator. The only ways to get an
admin are:
- `npm run seed` — blocked unless `NODE_ENV=development`, and it drops the database
- Manual MongoDB insert (would bypass the bcrypt pre-save hook → plaintext password)

`README.md` lines 69–70 acknowledges this and defers it to "a protected deployment/bootstrap
process" that does not exist in the repository.

### Issue #4 — Inconsistent minimum password length

- Temp generated passwords: **24 characters**
- User-chosen passwords: **minimum 6 characters** (line 295)

6 characters is weak by current standards (no complexity requirement, no breach-list check).

### Issue #5 — `specialization: 'lift'` has no staff in seed data

`seed.js` line 75 deliberately leaves a lift complaint unassigned to demonstrate the
"no specialist available" notification. Worth knowing before testing auto-assignment coverage.

---

## 9. Summary table

| Role | Default password | Fixed value? | `mustChangePassword` | Who creates | Changeable by user |
|---|---|---|---|---|---|
| **Admin** | Random 24-char (`crypto.randomBytes(18)`, base64url) | ❌ No | ✅ Yes | Existing admin | ✅ Yes |
| **Staff** | Random 24-char (same generator) | ❌ No | ✅ Yes | Admin only | ✅ Yes |
| **Resident** | Random 24-char (same generator) | ❌ No | ✅ Yes | Admin only | ✅ Yes |

**One generator, three roles, zero fixed defaults.**

---

## 10. Security assessment

The password design itself is **sound** — unpredictable, well-hashed, never leaked over the API,
and never hardcoded. This is stronger than the common `password123` / `admin123` default-credential
pattern and will score well if examined.

The weaknesses are **operational, not cryptographic**:

1. The admin has **no way to obtain** the temporary password (Issue #1 + #2) — the feature is
   half-finished. Either the backend should return the password once at creation time, or the seed
   script should print it in development.
2. There is **no documented or scripted way to create the first production admin** (Issue #3).
3. The 6-character minimum for user-chosen passwords should be raised (Issue #4).

The README already states the intent clearly and correctly: *"Do not share or commit passwords in
documentation."* That principle should be kept — but it needs to be paired with a working
delivery mechanism, otherwise accounts are created that nobody can ever access.
