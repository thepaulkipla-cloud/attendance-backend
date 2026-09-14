-- Migration: adds QR-code-based site verification for sign-in/out.
-- Run this AFTER the original schema.sql, against your existing Supabase database.

CREATE TABLE IF NOT EXISTS sites (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(120) NOT NULL,
  qr_token    VARCHAR(64) UNIQUE NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS sign_in_site_id INTEGER REFERENCES sites(id);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS sign_out_site_id INTEGER REFERENCES sites(id);

-- Guest visits also get linked to the site they were logged at, same as employees.
ALTER TABLE guest_records ADD COLUMN IF NOT EXISTS sign_in_site_id INTEGER REFERENCES sites(id);
ALTER TABLE guest_records ADD COLUMN IF NOT EXISTS sign_out_site_id INTEGER REFERENCES sites(id);

-- Weekly sign-off workflow, replacing the paper register's
-- "Completed by / Date signed off / Verified by" fields.
CREATE TABLE IF NOT EXISTS weekly_signoffs (
  id               SERIAL PRIMARY KEY,
  week_start_date  DATE UNIQUE NOT NULL,
  completed_by     INTEGER REFERENCES employees(id),
  completed_at     TIMESTAMPTZ,
  verified_by      INTEGER REFERENCES employees(id),
  verified_at      TIMESTAMPTZ
);

-- Geofencing: each site can optionally have real coordinates + an
-- allowed radius. Sites without coordinates set skip the geofence check
-- entirely (QR-only verification, as before).
ALTER TABLE sites ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS radius_meters INTEGER DEFAULT 100;
