# 🏘️ Tole Community Management System
BCA 8th Semester Final Year Project

## 🛠️ Tech Stack
- Frontend: React.js (Create React App / react-scripts) + Recharts
- Backend: Node.js + Express.js
- Database: MongoDB
- Algorithms: K-Means Clustering + Content-Based Filtering (TF-IDF)
- Automation: node-cron (Auto due generation + fine calculation)

> ⚠️ **Note:** Frontend ma Create React App (react-scripts) use gareko cha — `npm start` le
> dev server chalauncha (Vite hoina, `npm run dev` command chaina).

---

## ✅ Prerequisites (Pehile install garnu parcha)
1. **Node.js** — https://nodejs.org (v18+ download)
2. **MongoDB** — https://www.mongodb.com/try/download/community
   - Install garyo pachi MongoDB Compass pani install gara (GUI tool)

---

## 🚀 Step-by-Step Run Instructions

### Step 1: MongoDB Start Gara
```
Windows: MongoDB Compass open gara → Connect to localhost:27017
Mac/Linux: Terminal ma → sudo systemctl start mongod
```

### Step 2: Backend Setup
```bash
cd tole-management/backend
npm install
npm run seed        # ← Demo data create hune (IMPORTANT!)
npm run dev         # ← Server start hune (port 5000)
```

Backend successfully started bhayo bhane dekhaucha:
```
✅ MongoDB Connected: localhost
🚀 Server running on http://localhost:5000
```

### Step 3: Frontend Setup (naya terminal ma)
```bash
cd tole-management/frontend
npm install
npm start           # ← react-scripts dev server start hune (port 3000)
```

Browser ma automatically open huncha: **http://localhost:3000**

---

## 👤 Login Credentials (Demo)
| Role     | Email              | Password    |
|----------|--------------------|-------------|
| Admin    | admin@tole.com     | admin123    |
| Staff    | staff@tole.com     | staff123    |
| Resident | ram@tole.com       | resident123 |

---

## 🤖 AI Features Try Garne Tarika

### K-Means Clustering
→ Login as Admin → "AI Clusters" page open gara
→ Residents automatically 3 group ma divide hune:
   - Regular Payer 🟢
   - Late Payer 🟡
   - Defaulter 🔴

### Content-Based Filtering
→ Complaints page → "+ New Complaint" click gara
→ Title: "paani aaudaina pipe ma" lekha → Submit
→ System le automatically similar past complaints SUGGEST garcha!

### Auto Cron Automation
→ Server start garya pachi background ma automatically:
   - Har mahina 1 tarikh: Monthly dues generate hune
   - Har din midnight: Overdue dues fine update hune

---

## 📁 Project Structure
```
tole-management/
├── backend/
│   ├── config/db.js           # MongoDB connection
│   ├── controllers/           # Business logic + Algorithms
│   │   ├── authController.js
│   │   ├── dueController.js   # K-Means Clustering here!
│   │   └── complaintController.js  # Content-Based Filtering here!
│   ├── middleware/auth.js     # JWT authentication
│   ├── models/                # MongoDB schemas
│   ├── routes/                # API endpoints
│   ├── utils/seed.js          # Demo data
│   └── server.js              # Main server + Cron jobs
└── frontend/
    └── src/
        ├── context/AuthContext.js
        ├── pages/
        │   ├── Dashboard.js   # Charts + stats
        │   ├── Dues.js        # Payment management
        │   ├── Complaints.js  # AI suggestions
        │   ├── Notices.js
        │   └── Clusters.js    # K-Means visualization
        └── components/Layout.js
```

---

## 📊 API Endpoints
| Method | URL                      | Description              |
|--------|--------------------------|--------------------------|
| POST   | /api/auth/login          | Login                    |
| GET    | /api/houses              | Get all houses           |
| GET    | /api/dues                | Get dues (with filters)  |
| POST   | /api/dues/generate       | Auto generate monthly dues|
| GET    | /api/dues/clusters       | K-Means clustering result|
| PUT    | /api/dues/:id/pay        | Mark due as paid         |
| GET    | /api/complaints          | Get complaints           |
| POST   | /api/complaints          | Submit + get AI suggestions|
| GET    | /api/notices             | Get notices              |

---

## 🎓 Viva ma Vannu Parcha
> "Hamro system ma K-Means Clustering algorithm le residents lai payment behavior anusar classify garcha,
> Content-Based Filtering (TF-IDF + Cosine Similarity) le similar complaints suggest garcha,
> ra node-cron le monthly due generation ra fine calculation automate garcha.
> Yo sabai features le system lai intelligent ra practical banaucha!"

---

## 🤖 Smart Complaint Workflow (New!)

1. **Auto Category Detection** — Resident submits complaint with just Title + Description. A keyword-scoring
   algorithm reads the text and detects category (water/electric/lift/sanitation/security) automatically.
2. **Auto-Assignment** — System finds a staff member whose `specialization` matches the detected category,
   picks the **least busy one** (load balancing by active complaint count), and assigns it instantly.
3. **Resolver-Only Resolve** — Only the **assigned staff** (or admin) can mark a complaint as resolved.
   Resolution description is **mandatory** — must explain what was wrong and how it was fixed.
4. **Reopen Lock** — If a complaint is resolved and reopened **twice**, it auto-locks to `closed` status —
   no one (not even admin) can modify it further, preventing back-and-forth disputes.
5. **Contact Info on Match** — When the AI finds a similar past complaint, it now shows who resolved it and
   their phone number, so residents know who to contact.

## 👷 Staff Management (New!)

Admin can create staff with a **specialization** (Electrician, Plumber, Lift Technician, Sanitation, Security, General)
from the **Staff** page (`/staff`). This specialization drives the auto-assignment algorithm above.

| Test Staff Account | Specialization |
|---|---|
| electrician@tole.com / staff123 | Electric |
| plumber@tole.com / staff123 | Water |
| guard@tole.com / staff123 | Security |
| staff@tole.com / staff123 | General |

## 📍 Section-Based Notices (New!)

Houses now belong to a **Section** (Section 1, 2, 3...). When posting a notice, admin/staff can target specific
section(s) — only residents in those sections get notified and see the notice. Leave sections empty to notify everyone.

---

## 👤 Login is Username-Based (Updated!)

Login no longer uses email — it uses **username** in `firstname.lastname` format (auto-generated, lowercase).
Default password is also auto-generated as `firstname@123`.

⚠️ **Important:** Run `npm run seed` again to regenerate accounts with the new username format —
old email-based accounts won't work anymore.

| Role | Username | Password |
|---|---|---|
| Admin | admin.sharma | admin@123 |
| General Staff | general.staff | general@123 |
| Electrician | bishnu.electrician | bishnu@123 |
| Plumber | krishna.plumber | krishna@123 |
| Guard | suresh.guard | suresh@123 |
| Resident (Section 1) | ram.bahadur | ram@123 |
| Resident (Section 1) | sita.devi | sita@123 |
| Resident (Section 2) | hari.prasad | hari@123 |

## 👥 Full User Management (Admin Only) — New!

Admin gets a **User Management** page (`/staff`) with full CRUD for Staff and Residents:
- **Create** — just enter name + phone + role (+ specialization for staff). Username & password auto-generate.
- **Edit** — update name, phone, specialization, role.
- **Reset Password** — resets back to the default `firstname@123`.
- **Activate/Deactivate** — disable login without deleting the account.
- **Delete** — permanently remove a user (admin cannot delete their own account).

🔒 **Residents and Staff cannot edit their own profile** — these endpoints are admin-only at the route level
(`authorize('admin')`), so there's no self-edit path in the UI or API for any other role.

## 📍 Complaint Section/Area Tracking — New!

When a resident submits a complaint, the system automatically looks up **their linked house** and stamps the
complaint with that house's **section** (e.g. "Section 1", "Section 2"). Admin/staff can filter complaints by
section on the Complaints page to see which block/area has the most issues — useful for area-wise dispatch.

A resident must have a house linked to their account (via the Houses page → Add House → Owner dropdown) before
they can submit a complaint.

---

## 🗳️ Community Voting/Polls (New!)

Admin and staff can create community polls for democratic decision-making. Residents can vote on proposals,
and results are displayed with visual charts.

### Features
- **Create Polls** — Admin/staff can create polls with title, description, and multiple options (minimum 2)
- **Voting Types** — Choose between **Anonymous** (hide who voted) or **Named** (show voters)
- **Section Targeting** — Target specific sections or leave empty for all residents
- **End Date** — Optional end date to automatically close polls
- **One Vote Per User** — Each user can vote only once per poll
- **Real-time Results** — Admin/staff can view detailed results with percentage breakdowns
- **Poll Management** — Close or delete polls as needed

### How to Use
1. **Create Poll** (Admin/Staff only):
   - Navigate to "Polls" page
   - Click "+ Create Poll"
   - Enter title and description
   - Add at least 2 voting options
   - Choose voting type (anonymous/named)
   - Optionally select target sections
   - Optionally set end date
   - Click "Create Poll"

2. **Vote on Poll** (Residents):
   - Navigate to "Polls" page
   - View active polls
   - Click on your preferred option
   - Vote is recorded instantly
   - Cannot vote again on the same poll

3. **View Results** (Admin/Staff only):
   - Click "View Detailed Results" on any poll
   - See vote counts and percentages
   - For named polls, see who voted for each option

### API Endpoints
| Method | URL                      | Description              |
|--------|--------------------------|--------------------------|
| GET    | /api/polls               | Get all polls            |
| GET    | /api/polls/:id           | Get single poll details  |
| POST   | /api/polls               | Create new poll (admin/staff) |
| PUT    | /api/polls/:id           | Update poll (admin/staff) |
| DELETE | /api/polls/:id          | Delete poll (admin only) |
| POST   | /api/polls/:id/vote      | Vote on poll             |
| GET    | /api/polls/:id/results   | Get poll results (admin/staff) |

## Due Payment Verification Workflow

The dues module now uses a resident-to-admin verification flow instead of allowing a user to instantly mark a due as paid.

- Residents only receive dues for houses linked to them as owner or tenant.
- The dues table clearly identifies the house and, for management users, the linked resident(s).
- A resident submits the exact amount due, payment method, optional transaction/reference number, and a JPG/PNG/PDF proof file (max 5 MB).
- Submission changes the due to `verification_pending`; it does not generate a receipt yet.
- Only an `admin` can approve or reject the payment proof. Staff can inspect proofs but cannot approve/reject them.
- Approval changes the due to `paid`, stores the verifying admin, records the paid-by resident, and generates a receipt number.
- Rejection stores the reason and returns the due to `pending` or `overdue`, allowing the resident to submit a corrected proof.
- Residents receive notifications for submission, approval, and rejection; active admins receive a notification when a proof needs review.
- Direct `PUT /api/dues/:id/pay` payment marking is intentionally disabled so the verification process cannot be bypassed.
- A unique database index prevents duplicate monthly dues for the same house.

## Production Hardening Notes

- Resident due visibility is enforced at the API layer by linked house ownership/tenancy.
- Payment status cannot be changed directly to paid by a resident or staff member. Residents submit proof; only admins approve or reject.
- Payment proofs are served through an authenticated API endpoint instead of public static access.
- Rejected payment attempts remain in the due's payment history for auditability.
- Houses are archived instead of hard-deleted so dues, complaints, and payment history remain intact.
- Owner/tenant assignment conflicts are blocked.
- Poll voting is restricted to residents.
- Financial dues generation is restricted to admins; scheduled monthly generation remains automated.
- Do not commit `.env`; configure production secrets/environment variables on the deployment platform.

## Backend environment setup

The backend reads environment variables from `backend/.env` using a path relative to the backend itself, so `npm start` and `npm run seed` work even when launched from the backend directory.

For local development, the project includes a `.env` with:
`MONGO_URI=mongodb://127.0.0.1:27017/tole_management`

Make sure MongoDB is running locally before using:

```bash
cd backend
npm install
npm run seed
npm start
```

For production, replace the local `.env` values—especially `MONGO_URI` and `JWT_SECRET`—with secure production values and never expose them publicly.
