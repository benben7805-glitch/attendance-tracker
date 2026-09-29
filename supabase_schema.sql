-- ============================================================================
-- SUPABASE ENTERPRISE ATTENDANCE TRACKER SCHEMA
-- Run this script in the Supabase SQL Editor to set up or migrate your database.
-- ============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ADMINS & CLASSROOMS TABLE (Enterprise Multi-Tenant Tenant Store)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    classroom_name TEXT NOT NULL,
    classroom_code TEXT NOT NULL,
    pin TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_classroom_code_upper 
ON admins (UPPER(classroom_code));

CREATE INDEX IF NOT EXISTS idx_admins_is_active ON admins(is_active);

-- Default classroom admin for single-tenant backward compatibility
INSERT INTO admins (id, name, classroom_name, classroom_code, pin, is_active)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Primary Administrator',
    'Main Classroom',
    'MAIN',
    '1234',
    true
)
ON CONFLICT (UPPER(classroom_code)) DO NOTHING;

-- ============================================================================
-- 2. ENTERPRISE AUDIT LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_role TEXT NOT NULL,            -- 'super_admin' | 'admin'
    actor_id TEXT NOT NULL,              -- admin UUID or 'super_admin'
    classroom_id UUID REFERENCES admins(id) ON DELETE SET NULL,
    action TEXT NOT NULL,                -- e.g. 'CREATE_ADMIN', 'RESET_PIN', 'SAVE_ATTENDANCE'
    details JSONB,                       -- Action metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_classroom ON audit_logs(classroom_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- 3. STUDENTS TABLE (Scoped per Admin / Classroom)
-- ============================================================================
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE NOT NULL,
    roll_number TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_admin_roll UNIQUE (admin_id, roll_number)
);

-- Backward compatibility columns and constraints if table existed prior
ALTER TABLE students ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE students SET admin_id = 'a0000000-0000-0000-0000-000000000001' WHERE admin_id IS NULL;
ALTER TABLE students ALTER COLUMN admin_id SET NOT NULL;

-- Drop legacy single-column constraints if migrating
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_roll_number_fkey;
ALTER TABLE batch_students DROP CONSTRAINT IF EXISTS batch_students_student_roll_number_fkey;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_pkey;
ALTER TABLE students DROP CONSTRAINT IF EXISTS unique_admin_roll;
ALTER TABLE students ADD CONSTRAINT unique_admin_roll UNIQUE (admin_id, roll_number);
ALTER TABLE students ADD CONSTRAINT students_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_students_admin_id ON students(admin_id);
CREATE INDEX IF NOT EXISTS idx_students_roll ON students(roll_number);

-- ============================================================================
-- 4. SUBJECTS TABLE (Scoped per Admin / Classroom)
-- ============================================================================
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'theory' CHECK (type IN ('theory', 'practical', 'clinics')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_admin_subject_name_type UNIQUE (admin_id, name, type)
);

ALTER TABLE subjects ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'theory' CHECK (type IN ('theory', 'practical', 'clinics'));
UPDATE subjects SET admin_id = 'a0000000-0000-0000-0000-000000000001' WHERE admin_id IS NULL;
ALTER TABLE subjects ALTER COLUMN admin_id SET NOT NULL;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_name_key;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS unique_subject_name_type;
ALTER TABLE subjects DROP CONSTRAINT IF EXISTS unique_admin_subject_name_type;
ALTER TABLE subjects ADD CONSTRAINT unique_admin_subject_name_type UNIQUE (admin_id, name, type);

CREATE INDEX IF NOT EXISTS idx_subjects_admin_id ON subjects(admin_id);

-- Drop deprecated weekly_schedule table
DROP TABLE IF EXISTS weekly_schedule;

-- ============================================================================
-- 5. BATCHES TABLE (Scoped per Admin / Classroom)
-- ============================================================================
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE NOT NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_admin_subject_batch_name UNIQUE (admin_id, subject_id, name)
);

ALTER TABLE batches ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
UPDATE batches SET admin_id = (SELECT s.admin_id FROM subjects s WHERE s.id = batches.subject_id) WHERE admin_id IS NULL;
UPDATE batches SET admin_id = 'a0000000-0000-0000-0000-000000000001' WHERE admin_id IS NULL;
ALTER TABLE batches ALTER COLUMN admin_id SET NOT NULL;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS unique_subject_batch_name;
ALTER TABLE batches DROP CONSTRAINT IF EXISTS unique_admin_subject_batch_name;
ALTER TABLE batches ADD CONSTRAINT unique_admin_subject_batch_name UNIQUE (admin_id, subject_id, name);

CREATE INDEX IF NOT EXISTS idx_batches_admin_id ON batches(admin_id);
CREATE INDEX IF NOT EXISTS idx_batches_subject_id ON batches(subject_id);

-- ============================================================================
-- 6. BATCH_STUDENTS JUNCTION TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS batch_students (
    batch_id UUID REFERENCES batches(id) ON DELETE CASCADE NOT NULL,
    student_roll_number TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (batch_id, student_roll_number)
);

CREATE INDEX IF NOT EXISTS idx_batch_students_batch_id ON batch_students(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_students_roll ON batch_students(student_roll_number);

-- ============================================================================
-- 7. CLASSES TABLE (Class instances held on specific dates)
-- ============================================================================
CREATE TABLE IF NOT EXISTS classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE NOT NULL,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
    batch_id UUID REFERENCES batches(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE classes ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL;
UPDATE classes SET admin_id = (SELECT s.admin_id FROM subjects s WHERE s.id = classes.subject_id) WHERE admin_id IS NULL;
UPDATE classes SET admin_id = 'a0000000-0000-0000-0000-000000000001' WHERE admin_id IS NULL;
ALTER TABLE classes ALTER COLUMN admin_id SET NOT NULL;

ALTER TABLE classes DROP CONSTRAINT IF EXISTS check_class_times;
ALTER TABLE classes ADD CONSTRAINT check_class_times CHECK (start_time < end_time);

ALTER TABLE classes DROP CONSTRAINT IF EXISTS unique_subject_date_time;
DROP INDEX IF EXISTS unique_class_all_students;
CREATE UNIQUE INDEX IF NOT EXISTS unique_class_all_students 
ON classes (admin_id, subject_id, date, start_time) WHERE batch_id IS NULL;

DROP INDEX IF EXISTS unique_class_with_batch;
CREATE UNIQUE INDEX IF NOT EXISTS unique_class_with_batch 
ON classes (admin_id, subject_id, date, start_time, batch_id) WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_classes_admin_id ON classes(admin_id);
CREATE INDEX IF NOT EXISTS idx_classes_subject_id ON classes(subject_id);
CREATE INDEX IF NOT EXISTS idx_classes_date ON classes(date);
CREATE INDEX IF NOT EXISTS idx_classes_subject_date ON classes(subject_id, date);
CREATE INDEX IF NOT EXISTS idx_classes_batch_id ON classes(batch_id);

-- ============================================================================
-- 8. ATTENDANCE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID REFERENCES classes(id) ON DELETE CASCADE NOT NULL,
    student_roll_number TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_class_student UNIQUE (class_id, student_roll_number)
);

CREATE INDEX IF NOT EXISTS idx_attendance_class_id ON attendance(class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_roll ON attendance(student_roll_number);

-- ============================================================================
-- 9. EVENTS TABLE (Academic Calendar & Holidays)
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
    is_global BOOLEAN DEFAULT false NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false NOT NULL;
UPDATE events SET admin_id = 'a0000000-0000-0000-0000-000000000001' WHERE admin_id IS NULL AND is_global = false;

CREATE INDEX IF NOT EXISTS idx_events_admin_id ON events(admin_id);
CREATE INDEX IF NOT EXISTS idx_events_is_global ON events(is_global);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read/write access for all users" ON admins;
CREATE POLICY "Allow read/write access for all users" ON admins FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read/write access for all users" ON audit_logs;
CREATE POLICY "Allow read/write access for all users" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read/write access for all users" ON students;
CREATE POLICY "Allow read/write access for all users" ON students FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read/write access for all users" ON subjects;
CREATE POLICY "Allow read/write access for all users" ON subjects FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read/write access for all users" ON classes;
CREATE POLICY "Allow read/write access for all users" ON classes FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read/write access for all users" ON attendance;
CREATE POLICY "Allow read/write access for all users" ON attendance FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read/write access for all users" ON batches;
CREATE POLICY "Allow read/write access for all users" ON batches FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read/write access for all users" ON batch_students;
CREATE POLICY "Allow read/write access for all users" ON batch_students FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read/write access for all users" ON events;
CREATE POLICY "Allow read/write access for all users" ON events FOR ALL USING (true) WITH CHECK (true);
