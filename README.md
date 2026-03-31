# 🍃 Tea Factory — Scheduling & Resource Management System

A full-stack web application for managing daily machine operator allocation in a tea packaging factory. Features role-based access control, drag-and-drop shift planning, capability management, and approval workflows.

---

## Tech Stack

| Layer      | Technology                              |
|------------|-----------------------------------------|
| Frontend   | React 18 + Vite, dnd-kit, Zustand, CSS Modules |
| Backend    | Node.js + Express.js                    |
| Database   | PostgreSQL                              |
| Auth       | JWT (8h expiry)                         |
| Styling    | Custom dark design system, DM Sans font |

---

## Role Access Matrix

| Feature            | Admin | Engineer | Technician | Operator |
|--------------------|:-----:|:--------:|:----------:|:--------:|
| Dashboard          | ✓     | ✓        | ✓          | ✓        |
| Planning board     | ✓     | ✓        | ✓ own line | View only|
| User master        | ✓     | ✓        | ✗          | ✗        |
| Machine types      | ✓     | ✓        | ✗          | ✗        |
| User management    | ✓     | ✗        | ✗          | ✗        |

---

## Business Rules Enforced

- **Capability gate** — operators can only be assigned to machines they are certified for
- **Shift isolation** — an operator assigned to Day shift is hard-blocked from Night shift (same day)
- **Same-shift overload** — an operator can exceed load 1.0 on the same shift with technician confirmation; requires manager approval
- **Line isolation** — technicians plan their own line team only; cross-line transfers require engineer/admin
- **Approval workflow** — Draft → Submitted → Approved / Rejected
- **Capability updates** — only engineers/admins can grant or revoke machine certifications
- **User management** — only admins can create/edit/deactivate users and change roles

---

## Project Structure

```
tea-factory/
├── backend/
│   ├── src/
│   │   ├── server.js              # Express app entry
│   │   ├── routes/index.js        # All API routes
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── usersController.js
│   │   │   ├── machinesController.js
│   │   │   ├── capabilitiesController.js
│   │   │   └── schedulingController.js
│   │   ├── middleware/
│   │   │   ├── auth.js            # JWT + RBAC middleware
│   │   │   └── audit.js           # Audit log helper
│   │   └── db/
│   │       ├── pool.js            # pg connection pool
│   │       ├── migrate.js         # Schema migration
│   │       └── seed.js            # Demo data seed
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── api/
    │   │   ├── client.js          # Axios instance + interceptors
    │   │   └── services.js        # All API service functions
    │   ├── store/
    │   │   └── authStore.js       # Zustand auth store
    │   ├── components/
    │   │   ├── shared/
    │   │   │   └── Layout.jsx     # Sidebar navigation
    │   │   └── planning/
    │   │       ├── OperatorCard.jsx
    │   │       ├── MachineCard.jsx
    │   │       ├── PlanStatusBar.jsx
    │   │       └── OverloadConfirmModal.jsx
    │   ├── pages/
    │   │   ├── LoginPage.jsx
    │   │   ├── DashboardPage.jsx
    │   │   ├── PlanningPage.jsx
    │   │   ├── UserMasterPage.jsx
    │   │   ├── MachineTypesPage.jsx
    │   │   └── UserManagementPage.jsx
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css              # Global design system
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Setup & Installation

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Clone and install

```bash
# Backend
cd tea-factory/backend
npm install

# Frontend
cd tea-factory/frontend
npm install
```

### 2. Configure environment

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL credentials and a strong JWT_SECRET
```

### 3. Create database

```sql
-- In psql:
CREATE DATABASE tea_factory;
```

### 4. Run migrations and seed

```bash
cd backend
npm run db:migrate
npm run db:seed
```

### 5. Start development servers

```bash
# Terminal 1 — Backend (port 5000)
cd backend
npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend
npm run dev
```

Open **http://localhost:5173**

---

## Demo Accounts

| Role       | Login        | Password      |
|------------|-------------|---------------|
| Admin      | `ADM001`    | `Password@123`|
| Engineer   | `ENG001`    | `Password@123`|
| Technician | `TC001`     | `Password@123`|
| Operator   | `OP001`     | `Password@123`|

Operators log in with their **employee number**. Engineers, technicians, and admins can use **employee number or email**.

---

## API Reference

### Auth
| Method | Route                        | Access  | Description         |
|--------|------------------------------|---------|---------------------|
| POST   | `/api/auth/login`            | Public  | Login               |
| GET    | `/api/auth/me`               | Any     | Current user info   |
| PUT    | `/api/auth/change-password`  | Any     | Change own password |

### Users (Admin only)
| Method | Route                           | Description              |
|--------|---------------------------------|--------------------------|
| GET    | `/api/users`                    | List users (filterable)  |
| POST   | `/api/users`                    | Create user              |
| PUT    | `/api/users/:id`                | Update user              |
| POST   | `/api/users/:id/reset-password` | Reset user's password    |

### Machine Types (Engineer+)
| Method | Route                   | Description             |
|--------|-------------------------|-------------------------|
| GET    | `/api/machine-types`    | List all types          |
| POST   | `/api/machine-types`    | Create custom type      |
| DELETE | `/api/machine-types/:id`| Delete custom type      |

### Capabilities (Engineer+)
| Method | Route                                        | Description         |
|--------|----------------------------------------------|---------------------|
| GET    | `/api/capabilities`                          | Full capability matrix |
| POST   | `/api/capabilities/:operatorId/:typeId`      | Grant certification |
| DELETE | `/api/capabilities/:operatorId/:typeId`      | Revoke certification|

### Scheduling (Technician+)
| Method | Route                                   | Description              |
|--------|-----------------------------------------|--------------------------|
| GET    | `/api/plans`                            | List plans               |
| GET    | `/api/plans/:date/:shift/:line`         | Get/create plan          |
| POST   | `/api/plans/:planId/assignments`        | Assign operator          |
| DELETE | `/api/plans/:planId/assignments/:id`    | Remove assignment        |
| POST   | `/api/plans/:planId/submit`             | Submit for approval      |
| POST   | `/api/plans/:planId/review`             | Approve or reject (Eng+) |

---

## Database Schema

8 tables:
- `users` — all user accounts with roles and line assignment
- `machine_types` — system + custom machine types
- `machines` — physical machines on the floor
- `operator_capabilities` — certification records (operator × machine type)
- `schedule_plans` — daily shift plans (date + shift + line, unique)
- `assignments` — operator → machine assignments within a plan
- `operator_transfers` — cross-line transfer audit trail
- `audit_logs` — full system audit log

---

## Production Deployment

```bash
# Build frontend
cd frontend
npm run build
# Serve dist/ folder via nginx or a CDN

# Backend
# Set NODE_ENV=production
# Use PM2 or similar process manager
# Configure a reverse proxy (nginx) to forward /api to :5000
# Use SSL (Let's Encrypt)
# Set a strong JWT_SECRET (min 32 chars)
```

---

## Extending to 12 Lines

The system is designed for 12 lines. The demo seeds 3 lines (L1–L3). To add more:

1. Add lines L4–L12 to the `LINES` array in the frontend constants
2. Create technician users with `dedicated_line = 'L4'` etc. via User Management
3. Add machines via the Machine Types page
4. No code changes required — the line filtering is fully data-driven
