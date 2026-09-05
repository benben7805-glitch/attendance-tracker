-- ============================================================================
-- SUPABASE ATTENDANCE TRACKER SCHEMA
-- Run this script in the Supabase SQL Editor to set up your database.
-- ============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create students table
CREATE TABLE IF NOT EXISTS students (
    roll_number TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Create subjects table
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'theory' CHECK (type IN ('theory', 'practical', 'clinics')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2a. Migration for existing databases: add the "type" column to subjects
-- (safe to run multiple times - it does nothing if the column already exists)
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'theory'
CHECK (type IN ('theory', 'practical', 'clinics'));

-- 2b. Migration for existing databases: remove the weekly_schedule table
-- (the weekly schedule feature has been removed from the app)
DROP TABLE IF EXISTS weekly_schedule;

-- 3. Create classes table (actual class instances held on specific dates)
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_subject_date_time UNIQUE (subject_id, date, start_time)
);

-- 5. Create attendance table (tracks student presence/absence for a class)
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
    student_roll_number TEXT REFERENCES students(roll_number) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_class_student UNIQUE (class_id, student_roll_number)
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- By default, tables are secured. For simplicity in Next.js Server Actions,
-- we will access Supabase using the service role key or standard connection
-- with simple policies, but since Server Actions execute server-side,
-- they bypass client-side RLS if using the service role, or we can enable 
-- RLS with public select/write access for the app connection.
-- Below is a standard open configuration for client-side API requests, 
-- or you can use server actions.
-- ============================================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for application access (Next.js server-side / client-side)
-- DROP IF EXISTS makes the script safe to re-run (Supabase has no CREATE POLICY IF NOT EXISTS)
DROP POLICY IF EXISTS "Allow read/write access for all users" ON students;
CREATE POLICY "Allow read/write access for all users" ON students FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow read/write access for all users" ON subjects;
CREATE POLICY "Allow read/write access for all users" ON subjects FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow read/write access for all users" ON classes;
CREATE POLICY "Allow read/write access for all users" ON classes FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow read/write access for all users" ON attendance;
CREATE POLICY "Allow read/write access for all users" ON attendance FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- BATCH MANAGEMENT
-- ============================================================================

-- 6. Create batches table (optional groupings per subject)
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_subject_batch_name UNIQUE (subject_id, name)
);

-- 7. Create batch_students junction table
CREATE TABLE IF NOT EXISTS batch_students (
    batch_id UUID REFERENCES batches(id) ON DELETE CASCADE NOT NULL,
    student_roll_number TEXT REFERENCES students(roll_number) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (batch_id, student_roll_number)
);

-- 7a. Migration: add batch_id to classes (nullable for backward compatibility)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;

-- 7b. Migration: allow the same subject/date/time to have multiple classes for
-- different batches. The original unique constraint only allowed one class per
-- subject/date/start_time. It is recreated with batch_id so that two classes can
-- run at the same time for different batches (batch_id is NULL for "all students").
ALTER TABLE classes DROP CONSTRAINT IF EXISTS unique_subject_date_time;
ALTER TABLE classes ADD CONSTRAINT unique_subject_date_time UNIQUE (subject_id, date, start_time, batch_id);

ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read/write access for all users" ON batches;
CREATE POLICY "Allow read/write access for all users" ON batches FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow read/write access for all users" ON batch_students;
CREATE POLICY "Allow read/write access for all users" ON batch_students FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- EVENTS / CALENDAR
-- ============================================================================

-- 8. Create events table
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read/write access for all users" ON events;
CREATE POLICY "Allow read/write access for all users" ON events FOR ALL USING (true) WITH CHECK (true);
