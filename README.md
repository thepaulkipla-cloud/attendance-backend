# Attendance System — Backend API (Phase 1)

## Setup
1. Install dependencies: `npm install`
2. Create a Postgres database and run `src/schema.sql` against it
   (`psql -U postgres -d attendance -f src/schema.sql`, or paste it into
   the Supabase SQL editor if you're hosting there).
3. Copy `.env.example` to `.env` and fill in your DB credentials / `DATABASE_URL`.
4. Run the server: `node src/index.js`
5. Check it's alive: `curl http://localhost:3000/health`

## First admin account
There's no signup route on purpose — Phase 1 mirrors the paper register,
where the company already controls who's on the sheet. Create the first
admin directly in the database:

```sql
-- Generate a bcrypt hash for a PIN first (e.g. via bcryptjs in a node REPL),
-- then insert it here.
INSERT INTO employees (full_name, phone_number, pin_hash, role)
VALUES ('Admin Name', '2547XXXXXXXX', '<bcrypt-hash-of-pin>', 'admin');
```

From there, the admin can create employee accounts via
`POST /auth/employees` (see API reference below).

## API Reference

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | /auth/login | none | Log in with phone_number + pin, returns a JWT |
| POST | /auth/employees | admin | Create a new employee account |
| POST | /attendance/sign-in | employee | Sign in for today (optional lat/lng) |
| POST | /attendance/sign-out | employee | Sign out for today (optional lat/lng) |
| GET | /attendance/me | employee | Own last-30-days history |
| GET | /admin/register?week_start=YYYY-MM-DD | admin | Weekly register, shaped like the paper grid |
| GET | /admin/register/export?week_start=YYYY-MM-DD | admin | CSV export of the week |
| PATCH | /admin/records/:id | admin | Manually correct a record |

Auth header for protected routes: `Authorization: Bearer <token>`

## Next up (not in this package yet)
- Flutter mobile app calling `/auth/login`, `/attendance/sign-in`, `/attendance/sign-out`, `/attendance/me`
- React admin dashboard calling `/admin/*` routes to render the live weekly grid
