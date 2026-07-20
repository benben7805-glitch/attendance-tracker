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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Create weekly_schedule table (holds the template for weekly classes)
CREATE TABLE IF NOT EXISTS weekly_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE NOT NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday, 1 = Monday, 2 = Tuesday, etc.
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Create classes table (actual class instances held on specific dates)
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
ALTER TABLE weekly_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for application access (Next.js server-side / client-side)
CREATE POLICY "Allow read/write access for all users" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow read/write access for all users" ON subjects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow read/write access for all users" ON weekly_schedule FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow read/write access for all users" ON classes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow read/write access for all users" ON attendance FOR ALL USING (true) WITH CHECK (true);
