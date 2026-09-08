-- Attendance Tracking System — Phase 1 schema

CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(120) NOT NULL,
  phone_number  VARCHAR(20) UNIQUE NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'employee', -- 'employee' | 'admin'
  pin_hash      VARCHAR(255) NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id              SERIAL PRIMARY KEY,
  employee_id     INTEGER NOT NULL REFERENCES employees(id),
  work_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  sign_in_time    TIMESTAMPTZ,
  sign_out_time   TIMESTAMPTZ,
  sign_in_lat     DOUBLE PRECISION,
  sign_in_lng     DOUBLE PRECISION,
  sign_out_lat    DOUBLE PRECISION,
  sign_out_lng    DOUBLE PRECISION,
  flagged         BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason     VARCHAR(255),
  UNIQUE (employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS guest_records (
  id            SERIAL PRIMARY KEY,
  guest_name    VARCHAR(120) NOT NULL,
  work_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  sign_in_time  TIMESTAMPTZ,
  sign_out_time TIMESTAMPTZ,
  hosted_by     INTEGER REFERENCES employees(id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_records(employee_id, work_date);
