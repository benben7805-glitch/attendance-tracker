-- ============================================================================
-- ENTERPRISE MULTI-CLASSROOM & SUPER ADMIN MIGRATION SCRIPT
-- Safe to execute in Supabase SQL Editor (Idempotent & Zero Data Loss)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create admins table (Classrooms and Administrators)
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

-- Case-insensitive uniqueness for classroom code
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_classroom_code_upper 
ON admins (UPPER(classroom_code));

CREATE INDEX IF NOT EXISTS idx_admins_is_active ON admins(is_active);

-- 2. Create enterprise audit_logs table
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

-- 3. Provision Default Classroom Admin for backward-compatibility with existing data
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

-- Retrieve default admin ID into a fallback variable if needed
DO $$
DECLARE
    default_admin_id UUID;
BEGIN
    SELECT id INTO default_admin_id FROM admins WHERE UPPER(classroom_code) = 'MAIN' LIMIT 1;

    -- 4. Multi-Tenant upgrade for students table
    -- Add admin_id column if not present
    ALTER TABLE students ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

    UPDATE students SET admin_id = default_admin_id WHERE admin_id IS NULL;
    ALTER TABLE students ALTER COLUMN admin_id SET NOT NULL;

    -- Drop legacy foreign keys that prevent composite roll number uniqueness
    ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_roll_number_fkey;
    ALTER TABLE batch_students DROP CONSTRAINT IF EXISTS batch_students_student_roll_number_fkey;

    -- Drop old single-column primary key on roll_number
    ALTER TABLE students DROP CONSTRAINT IF EXISTS students_pkey;

    -- Ensure id is primary key and (admin_id, roll_number) is unique
    ALTER TABLE students DROP CONSTRAINT IF EXISTS unique_admin_roll;
    ALTER TABLE students ADD CONSTRAINT unique_admin_roll UNIQUE (admin_id, roll_number);
    ALTER TABLE students ADD CONSTRAINT students_pkey PRIMARY KEY (id);

    -- 5. Multi-Tenant upgrade for subjects table
    ALTER TABLE subjects ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
    UPDATE subjects SET admin_id = default_admin_id WHERE admin_id IS NULL;
    ALTER TABLE subjects ALTER COLUMN admin_id SET NOT NULL;

    ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_name_key;
    ALTER TABLE subjects DROP CONSTRAINT IF EXISTS unique_subject_name_type;
    ALTER TABLE subjects DROP CONSTRAINT IF EXISTS unique_admin_subject_name_type;
    ALTER TABLE subjects ADD CONSTRAINT unique_admin_subject_name_type UNIQUE (admin_id, name, type);

    -- 6. Multi-Tenant upgrade for batches table
    ALTER TABLE batches ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
    UPDATE batches SET admin_id = (SELECT s.admin_id FROM subjects s WHERE s.id = batches.subject_id) WHERE admin_id IS NULL;
    UPDATE batches SET admin_id = default_admin_id WHERE admin_id IS NULL;
    ALTER TABLE batches ALTER COLUMN admin_id SET NOT NULL;

    ALTER TABLE batches DROP CONSTRAINT IF EXISTS unique_subject_batch_name;
    ALTER TABLE batches DROP CONSTRAINT IF EXISTS unique_admin_subject_batch_name;
    ALTER TABLE batches ADD CONSTRAINT unique_admin_subject_batch_name UNIQUE (admin_id, subject_id, name);

    -- 7. Multi-Tenant upgrade for classes table
    ALTER TABLE classes ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
    UPDATE classes SET admin_id = (SELECT s.admin_id FROM subjects s WHERE s.id = classes.subject_id) WHERE admin_id IS NULL;
    UPDATE classes SET admin_id = default_admin_id WHERE admin_id IS NULL;
    ALTER TABLE classes ALTER COLUMN admin_id SET NOT NULL;

    -- 8. Multi-Tenant upgrade for events table
    ALTER TABLE events ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES admins(id) ON DELETE CASCADE;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false NOT NULL;
    UPDATE events SET admin_id = default_admin_id WHERE admin_id IS NULL AND is_global = false;

END $$;

-- 9. Update Partial Unique Indexes on Classes (Scoped to admin_id)
DROP INDEX IF EXISTS unique_class_all_students;
CREATE UNIQUE INDEX IF NOT EXISTS unique_class_all_students 
ON classes (admin_id, subject_id, date, start_time) WHERE batch_id IS NULL;

DROP INDEX IF EXISTS unique_class_with_batch;
CREATE UNIQUE INDEX IF NOT EXISTS unique_class_with_batch 
ON classes (admin_id, subject_id, date, start_time, batch_id) WHERE batch_id IS NOT NULL;

-- 10. Performance & Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_students_admin_id ON students(admin_id);
CREATE INDEX IF NOT EXISTS idx_students_roll ON students(roll_number);
CREATE INDEX IF NOT EXISTS idx_subjects_admin_id ON subjects(admin_id);
CREATE INDEX IF NOT EXISTS idx_classes_admin_id ON classes(admin_id);
CREATE INDEX IF NOT EXISTS idx_batches_admin_id ON batches(admin_id);
CREATE INDEX IF NOT EXISTS idx_events_admin_id ON events(admin_id);
CREATE INDEX IF NOT EXISTS idx_events_is_global ON events(is_global);

-- 11. Row Level Security Policies
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
