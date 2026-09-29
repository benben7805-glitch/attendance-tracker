'use server';

import { cookies } from 'next/headers';
import { supabase } from '@/lib/supabase';
import { normalizeSubjectType } from '@/lib/attendance';
import {
  signSession,
  verifySession,
  timingSafeEqual,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '@/lib/auth';
import { sanitizeRollNumber, sanitizeText, sanitizeClassroomCode, parseStudentCompositeId } from '@/lib/security';
import { checkRateLimit } from '@/lib/rate-limit';

// ==========================================
// SESSION & AUTHORIZATION HELPERS
// ==========================================

export interface SessionData {
  role: 'super_admin' | 'admin' | 'student' | null;
  adminId: string | null;
  classroomName: string | null;
  classroomCode: string | null;
  activeAdminId: string | null;
  rollNumber: string | null;
  isSuperAdmin: boolean;
}

export async function getSession(): Promise<SessionData> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const verified = await verifySession(token);
    if (verified) {
      return {
        role: verified.role,
        adminId: verified.adminId || null,
        classroomName: verified.classroomName || null,
        classroomCode: verified.classroomCode || null,
        activeAdminId: verified.activeAdminId || null,
        rollNumber: verified.rollNumber || null,
        isSuperAdmin: verified.role === 'super_admin',
      };
    }
  }

  return {
    role: null,
    adminId: null,
    classroomName: null,
    classroomCode: null,
    activeAdminId: null,
    rollNumber: null,
    isSuperAdmin: false,
  };
}

/**
 * Ensures caller is a verified Super Admin with omnipotent privileges.
 */
export async function assertSuperAdmin(): Promise<SessionData> {
  const session = await getSession();
  if (session.role !== 'super_admin') {
    throw new Error('Unauthorized: Super Administrator privileges are required.');
  }
  return session;
}

/**
 * Ensures caller has administrative rights over target classroom.
 * - Super Admin: Has omnipotent authority; can manage any target classroom.
 * - Classroom Admin: Strictly enforced to their assigned classroom.
 */
export async function assertAdmin(targetAdminId?: string): Promise<SessionData & { adminId: string }> {
  const session = await getSession();

  if (session.role === 'super_admin') {
    // Determine effective classroom for Super Admin
    let effectiveAdminId: string = targetAdminId || session.activeAdminId || '';
    if (!effectiveAdminId) {
      // Fallback to first available active classroom
      const { data: firstAdmin } = await supabase
        .from('admins')
        .select('id, classroom_name, classroom_code')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstAdmin) {
        effectiveAdminId = firstAdmin.id;
      } else {
        effectiveAdminId = 'a0000000-0000-0000-0000-000000000001';
      }
    }

    return {
      ...session,
      adminId: effectiveAdminId,
    };
  }

  if (session.role === 'admin' && session.adminId) {
    if (targetAdminId && targetAdminId !== session.adminId) {
      throw new Error('Unauthorized: You can only manage your assigned classroom.');
    }
    return {
      ...session,
      adminId: session.adminId,
    };
  }

  throw new Error('Unauthorized: Administrative privileges are required.');
}

/**
 * Asserts any authenticated role.
 */
export async function assertAuthenticated(): Promise<SessionData> {
  const session = await getSession();
  if (!session.role) {
    throw new Error('Unauthorized: Authentication required.');
  }
  return session;
}

// ==========================================
// ENTERPRISE AUDIT TRAIL
// ==========================================

export async function logAuditAction(
  actorRole: 'super_admin' | 'admin',
  actorId: string,
  classroomId: string | null,
  action: string,
  details?: Record<string, unknown>
) {
  try {
    await supabase.from('audit_logs').insert([
      {
        actor_role: actorRole,
        actor_id: actorId,
        classroom_id: classroomId,
        action,
        details: details || {},
      },
    ]);
  } catch (err) {
    // Non-blocking log failure
    console.error('Failed to write audit log:', err);
  }
}

// ==========================================
// SUPER ADMIN OPERATIONS (OMNIPOTENT ACCESS)
// ==========================================

export async function createAdminAction(payload: {
  name: string;
  classroomName: string;
  classroomCode: string;
  pin: string;
}) {
  await assertSuperAdmin();

  const cleanName = sanitizeText(payload.name, 100);
  const cleanClassroom = sanitizeText(payload.classroomName, 100);
  const cleanCode = sanitizeClassroomCode(payload.classroomCode);
  const cleanPin = sanitizeText(payload.pin, 50);

  if (!cleanName || !cleanClassroom || !cleanCode || !cleanPin) {
    throw new Error('Admin Name, Classroom Name, Unique Code, and PIN are all required.');
  }

  // Check unique classroom code
  const { data: existing } = await supabase
    .from('admins')
    .select('id')
    .ilike('classroom_code', cleanCode)
    .maybeSingle();

  if (existing) {
    throw new Error(`Classroom code "${cleanCode}" is already in use.`);
  }

  const { data, error } = await supabase
    .from('admins')
    .insert([
      {
        name: cleanName,
        classroom_name: cleanClassroom,
        classroom_code: cleanCode,
        pin: cleanPin,
        is_active: true,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAuditAction('super_admin', 'super_admin', data.id, 'CREATE_ADMIN', {
    name: cleanName,
    classroom_name: cleanClassroom,
    classroom_code: cleanCode,
  });

  return data;
}

export async function getAdminsAction() {
  await assertSuperAdmin();

  const { data: admins, error } = await supabase
    .from('admins')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  // Attach student and class count metrics for each admin
  const adminsWithStats = await Promise.all(
    (admins || []).map(async (admin) => {
      const [{ count: studentCount }, { count: classCount }] = await Promise.all([
        supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .eq('admin_id', admin.id),
        supabase
          .from('classes')
          .select('*', { count: 'exact', head: true })
          .eq('admin_id', admin.id),
      ]);

      return {
        ...admin,
        studentCount: studentCount || 0,
        classCount: classCount || 0,
      };
    })
  );

  return adminsWithStats;
}

export async function updateAdminAction(
  adminId: string,
  payload: {
    name?: string;
    classroomName?: string;
    classroomCode?: string;
    isActive?: boolean;
  }
) {
  await assertSuperAdmin();

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) {
    updateFields.name = sanitizeText(payload.name, 100);
  }
  if (payload.classroomName !== undefined) {
    updateFields.classroom_name = sanitizeText(payload.classroomName, 100);
  }
  if (payload.classroomCode !== undefined) {
    const code = sanitizeClassroomCode(payload.classroomCode);
    if (!code) throw new Error('Classroom code cannot be empty.');

    // Check code uniqueness
    const { data: conflict } = await supabase
      .from('admins')
      .select('id')
      .ilike('classroom_code', code)
      .neq('id', adminId)
      .maybeSingle();

    if (conflict) throw new Error(`Classroom code "${code}" is already taken.`);
    updateFields.classroom_code = code;
  }
  if (payload.isActive !== undefined) {
    updateFields.is_active = Boolean(payload.isActive);
  }

  const { data, error } = await supabase
    .from('admins')
    .update(updateFields)
    .eq('id', adminId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAuditAction('super_admin', 'super_admin', adminId, 'UPDATE_ADMIN', updateFields);

  return data;
}

export async function resetAdminPinAction(adminId: string, newPin: string) {
  await assertSuperAdmin();

  const cleanPin = sanitizeText(newPin, 50);
  if (!cleanPin) throw new Error('A valid PIN is required.');

  const { error } = await supabase
    .from('admins')
    .update({ pin: cleanPin, updated_at: new Date().toISOString() })
    .eq('id', adminId);

  if (error) throw new Error(error.message);

  await logAuditAction('super_admin', 'super_admin', adminId, 'RESET_ADMIN_PIN', {
    reset_at: new Date().toISOString(),
  });

  return { success: true };
}

export async function deleteAdminAction(adminId: string) {
  await assertSuperAdmin();

  const { error } = await supabase
    .from('admins')
    .delete()
    .eq('id', adminId);

  if (error) throw new Error(error.message);

  await logAuditAction('super_admin', 'super_admin', adminId, 'DELETE_ADMIN', {
    deleted_at: new Date().toISOString(),
  });

  return { success: true };
}

/**
 * Switches the Super Admin's active classroom context for the Universal Switcher.
 */
export async function setActiveClassroomAction(adminId: string | null) {
  await assertSuperAdmin();

  let classroomName = '';
  let classroomCode = '';

  if (adminId) {
    const { data: admin } = await supabase
      .from('admins')
      .select('classroom_name, classroom_code')
      .eq('id', adminId)
      .single();

    if (admin) {
      classroomName = admin.classroom_name;
      classroomCode = admin.classroom_code;
    }
  }

  const sessionToken = await signSession({
    role: 'super_admin',
    activeAdminId: adminId || undefined,
    classroomName: classroomName || undefined,
    classroomCode: classroomCode || undefined,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS,
  });

  return { success: true, activeAdminId: adminId, classroomName, classroomCode };
}

export async function getSuperAdminDashboardMetrics() {
  await assertSuperAdmin();

  const todayStr = new Date().toISOString().split('T')[0];

  const [
    { count: totalClassrooms },
    { count: activeAdmins },
    { count: totalStudents },
    { count: classesToday },
    { data: recentAudits },
    { data: adminsList },
  ] = await Promise.all([
    supabase.from('admins').select('*', { count: 'exact', head: true }),
    supabase.from('admins').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('classes').select('*', { count: 'exact', head: true }).eq('date', todayStr),
    supabase
      .from('audit_logs')
      .select('*, admins(classroom_name, classroom_code)')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase.from('admins').select('*').order('created_at', { ascending: true }),
  ]);

  return {
    totalClassrooms: totalClassrooms || 0,
    activeAdmins: activeAdmins || 0,
    totalStudents: totalStudents || 0,
    classesToday: classesToday || 0,
    recentAudits: recentAudits || [],
    adminsList: adminsList || [],
  };
}

export async function getAuditLogsAction(limit: number = 50, classroomId?: string) {
  await assertSuperAdmin();

  let query = supabase
    .from('audit_logs')
    .select('*, admins(name, classroom_name, classroom_code)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (classroomId) {
    query = query.eq('classroom_id', classroomId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getAllStudentsRegistry(searchQuery?: string, classroomId?: string) {
  await assertSuperAdmin();

  let query = supabase
    .from('students')
    .select('*, admins(name, classroom_name, classroom_code)')
    .order('name', { ascending: true });

  if (classroomId) {
    query = query.eq('admin_id', classroomId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const mapped = (data || []).map((s) => {
    const adminInfo = s.admins as unknown as { name: string; classroom_name: string; classroom_code: string };
    const code = adminInfo?.classroom_code || '';
    return {
      ...s,
      student_id: `${code}${s.roll_number}`,
      classroom_code: code,
      classroom_name: adminInfo?.classroom_name || '',
    };
  });

  let filtered = mapped;
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.roll_number.toLowerCase().includes(q) ||
        s.student_id.toLowerCase().includes(q) ||
        s.classroom_name.toLowerCase().includes(q) ||
        s.classroom_code.toLowerCase().includes(q)
    );
  }

  return filtered;
}

export async function broadcastGlobalEvent(title: string, description: string, date: string) {
  await assertSuperAdmin();

  const cleanTitle = sanitizeText(title, 150);
  const cleanDesc = sanitizeText(description, 500);

  if (!cleanTitle) throw new Error('Event title is required.');

  const { data, error } = await supabase
    .from('events')
    .insert([
      {
        title: cleanTitle,
        description: cleanDesc || null,
        date,
        is_global: true,
        admin_id: null,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAuditAction('super_admin', 'super_admin', null, 'BROADCAST_GLOBAL_EVENT', {
    title: cleanTitle,
    date,
  });

  return data;
}

// ==========================================
// AUTHENTICATION & LOGIN ACTIONS
// ==========================================

export async function getClassroomsForSelect() {
  const { data } = await supabase
    .from('admins')
    .select('id, name, classroom_name, classroom_code')
    .eq('is_active', true)
    .order('classroom_name', { ascending: true });

  return data || [];
}

export async function loginAction(input: string, classroomCode?: string) {
  const trimmed = (input || '').trim();

  // Rate limiting to prevent brute force attacks
  const rateLimitResult = checkRateLimit(`login:${trimmed.slice(0, 30)}`, 15, 60 * 1000);
  if (!rateLimitResult.allowed) {
    return {
      success: false,
      error: 'Too many login attempts. Please wait a minute and try again.',
    };
  }

  const superAdminPin = process.env.SUPER_ADMIN_PIN || '9999';

  // 1. Check Super Admin Master PIN
  if (timingSafeEqual(trimmed, superAdminPin)) {
    const sessionToken = await signSession({
      role: 'super_admin',
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS,
    });

    return { success: true, redirect: '/super-admin', role: 'super_admin' };
  }

  // Fetch active classrooms (used for admin PIN verification and student ID prefix parsing)
  const { data: activeAdmins } = await supabase
    .from('admins')
    .select('id, name, classroom_name, classroom_code, pin, is_active')
    .eq('is_active', true);

  const adminsList = activeAdmins || [];

  // 2. Check Classroom Admin Login
  let matchedAdmins = adminsList.filter((a) => timingSafeEqual(trimmed, a.pin));
  if (classroomCode) {
    const cleanCode = sanitizeClassroomCode(classroomCode);
    matchedAdmins = matchedAdmins.filter(
      (a) => a.classroom_code.toUpperCase() === cleanCode.toUpperCase()
    );
  }

  if (matchedAdmins.length === 1) {
    const admin = matchedAdmins[0];
    const sessionToken = await signSession({
      role: 'admin',
      adminId: admin.id,
      classroomName: admin.classroom_name,
      classroomCode: admin.classroom_code,
    });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_SECONDS,
    });

    return {
      success: true,
      redirect: '/admin',
      role: 'admin',
      classroomName: admin.classroom_name,
    };
  } else if (matchedAdmins.length > 1) {
    // Multiple admins share the same PIN; prompt user to supply classroom code
    return {
      success: false,
      requireClassroom: true,
      classrooms: matchedAdmins.map((a) => ({
        id: a.id,
        name: a.classroom_name,
        code: a.classroom_code,
      })),
      error: 'Multiple classrooms share this PIN. Please enter your Classroom Code.',
    };
  }

  // 3. Check Student Login via Student ID (e.g. MBBS20261, MBBS202612)
  const activeCodes = adminsList.map((a) => a.classroom_code);
  const parsedStudent = parseStudentCompositeId(trimmed, activeCodes);

  if (parsedStudent.isPrefixed && parsedStudent.classroomCode) {
    const targetAdmin = adminsList.find(
      (a) => a.classroom_code.toUpperCase() === parsedStudent.classroomCode!.toUpperCase()
    );

    if (targetAdmin) {
      // Query student by extracted roll number or clean composite input
      const { data: students } = await supabase
        .from('students')
        .select('roll_number, name, admin_id')
        .eq('admin_id', targetAdmin.id)
        .or(`roll_number.eq.${parsedStudent.rollNumber},roll_number.eq.${parsedStudent.cleanInput}`);

      if (students && students.length > 0) {
        const student = students[0];
        const sessionToken = await signSession({
          role: 'student',
          rollNumber: student.roll_number,
          adminId: targetAdmin.id,
          classroomName: targetAdmin.classroom_name,
          classroomCode: targetAdmin.classroom_code,
        });

        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: SESSION_TTL_SECONDS,
        });

        return {
          success: true,
          redirect: '/student',
          role: 'student',
          name: student.name,
          classroomName: targetAdmin.classroom_name,
        };
      } else {
        return {
          success: false,
          error: `Student "${parsedStudent.rollNumber}" not found in classroom ${targetAdmin.classroom_name} (${targetAdmin.classroom_code}).`,
        };
      }
    }
  }

  // 4. Fallback for explicit classroomCode with pure roll number
  if (classroomCode) {
    const cleanCode = sanitizeClassroomCode(classroomCode);
    const targetAdmin = adminsList.find(
      (a) => a.classroom_code.toUpperCase() === cleanCode.toUpperCase()
    );
    if (targetAdmin) {
      const cleanRoll = sanitizeRollNumber(trimmed);
      const { data: students } = await supabase
        .from('students')
        .select('roll_number, name, admin_id')
        .eq('admin_id', targetAdmin.id)
        .eq('roll_number', cleanRoll);

      if (students && students.length > 0) {
        const student = students[0];
        const sessionToken = await signSession({
          role: 'student',
          rollNumber: student.roll_number,
          adminId: targetAdmin.id,
          classroomName: targetAdmin.classroom_name,
          classroomCode: targetAdmin.classroom_code,
        });

        const cookieStore = await cookies();
        cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: SESSION_TTL_SECONDS,
        });

        return {
          success: true,
          redirect: '/student',
          role: 'student',
          name: student.name,
          classroomName: targetAdmin.classroom_name,
        };
      }
    }
  }

  return {
    success: false,
    error: 'Invalid Student ID, Admin PIN, or Super Admin Passcode. For students, enter your full Student ID (e.g. MBBS20261).',
  };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return { success: true };
}

// ==========================================
// SCOPED STUDENT ACTIONS
// ==========================================

export async function getStudents(targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const { data, error } = await supabase
    .from('students')
    .select('*, admins(classroom_name, classroom_code)')
    .eq('admin_id', session.adminId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);

  return (data || []).map((s) => {
    const adminInfo = s.admins as unknown as { classroom_name: string; classroom_code: string };
    const code = adminInfo?.classroom_code || session.classroomCode || '';
    return {
      ...s,
      student_id: `${code}${s.roll_number}`,
      classroom_code: code,
      classroom_name: adminInfo?.classroom_name || session.classroomName || '',
    };
  });
}

export async function addStudent(rollNumber: string, name: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  let cleanRoll = sanitizeRollNumber(rollNumber);
  const cleanName = sanitizeText(name, 100);

  if (!cleanRoll || !cleanName) {
    throw new Error('Valid Roll Number and Name are required.');
  }

  // Normalize if admin typed the classroom code prefix (e.g. "MBBS20261" -> "1")
  const { data: adminRecord } = await supabase
    .from('admins')
    .select('classroom_code')
    .eq('id', session.adminId)
    .single();

  if (adminRecord?.classroom_code) {
    const code = adminRecord.classroom_code.toUpperCase();
    if (cleanRoll.startsWith(code)) {
      const stripped = cleanRoll.substring(code.length).replace(/^[-_:]+/, '');
      if (stripped) {
        cleanRoll = stripped;
      }
    }
  }

  const { data, error } = await supabase
    .from('students')
    .insert([
      {
        admin_id: session.adminId,
        roll_number: cleanRoll,
        name: cleanName,
      },
    ])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Student with Roll Number "${cleanRoll}" already exists in this classroom.`);
    }
    throw new Error(error.message);
  }

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'ADD_STUDENT',
    { roll_number: cleanRoll, name: cleanName }
  );

  return data;
}

export async function deleteStudent(rollNumber: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const cleanRoll = sanitizeRollNumber(rollNumber);

  // 1. Delete associated attendance for this student in classes of this classroom
  const { data: adminClasses } = await supabase
    .from('classes')
    .select('id')
    .eq('admin_id', session.adminId);

  if (adminClasses && adminClasses.length > 0) {
    const classIds = adminClasses.map((c) => c.id);
    await supabase
      .from('attendance')
      .delete()
      .eq('student_roll_number', cleanRoll)
      .in('class_id', classIds);
  }

  // 2. Delete associated batch_students
  const { data: adminBatches } = await supabase
    .from('batches')
    .select('id')
    .eq('admin_id', session.adminId);

  if (adminBatches && adminBatches.length > 0) {
    const batchIds = adminBatches.map((b) => b.id);
    await supabase
      .from('batch_students')
      .delete()
      .eq('student_roll_number', cleanRoll)
      .in('batch_id', batchIds);
  }

  // 3. Delete student record
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('admin_id', session.adminId)
    .eq('roll_number', cleanRoll);

  if (error) throw new Error(error.message);

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'DELETE_STUDENT',
    { roll_number: cleanRoll }
  );

  return { success: true };
}

// ==========================================
// SCOPED SUBJECT ACTIONS
// ==========================================

export async function getSubjects(targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const { data, error } = await supabase
    .from('subjects')
    .select('*')
    .eq('admin_id', session.adminId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addSubject(name: string, type: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const cleanName = sanitizeText(name, 100);
  if (!cleanName) {
    throw new Error('Subject Name is required.');
  }

  const { data, error } = await supabase
    .from('subjects')
    .insert([
      {
        admin_id: session.adminId,
        name: cleanName,
        type: normalizeSubjectType(type),
      },
    ])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Subject with this name and type already exists in this classroom.');
    }
    throw new Error(error.message);
  }

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'ADD_SUBJECT',
    { name: cleanName, type }
  );

  return data;
}

export async function deleteSubject(id: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const { error } = await supabase
    .from('subjects')
    .delete()
    .eq('id', id)
    .eq('admin_id', session.adminId);

  if (error) throw new Error(error.message);

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'DELETE_SUBJECT',
    { subject_id: id }
  );

  return { success: true };
}

export async function getSubjectAttendanceReport(subjectId: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  // 1. Get the subject verifying classroom ownership
  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('*')
    .eq('id', subjectId)
    .eq('admin_id', session.adminId)
    .single();

  if (subjectError || !subject) {
    throw new Error('Subject not found in this classroom.');
  }

  // 2. Get all students of this classroom
  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('*')
    .eq('admin_id', session.adminId)
    .order('name', { ascending: true });

  if (studentsError) throw new Error(studentsError.message);

  // 3. Get all classes held for this subject
  const { data: classes, error: classesError } = await supabase
    .from('classes')
    .select('*')
    .eq('admin_id', session.adminId)
    .eq('subject_id', subjectId)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });

  if (classesError) throw new Error(classesError.message);

  // 4. Get attendance records for those classes with pagination
  const attendanceRecords: { class_id: string; student_roll_number: string; status: string }[] = [];
  if (classes && classes.length > 0) {
    const classIds = classes.map((c) => c.id);
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('attendance')
        .select('class_id, student_roll_number, status')
        .in('class_id', classIds)
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        attendanceRecords.push(...data);
        if (data.length < PAGE_SIZE) hasMore = false;
        else from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }
  }

  // Per-student tally: rollNumber -> { attended, absent }
  const tallyMap = new Map<string, { attended: number; absent: number }>();
  attendanceRecords.forEach((rec) => {
    const tally = tallyMap.get(rec.student_roll_number) || { attended: 0, absent: 0 };
    if (rec.status === 'present') tally.attended += 1;
    else if (rec.status === 'absent') tally.absent += 1;
    tallyMap.set(rec.student_roll_number, tally);
  });

  const rows =
    students?.map((s) => {
      const tally = tallyMap.get(s.roll_number) || { attended: 0, absent: 0 };
      const totalClasses = tally.attended + tally.absent;
      return {
        rollNumber: s.roll_number,
        name: s.name,
        attended: tally.attended,
        absent: tally.absent,
        totalClasses,
        pct: totalClasses > 0 ? Math.round((tally.attended / totalClasses) * 100) : null,
      };
    }) || [];

  rows.sort((a, b) => {
    if (a.pct === null && b.pct === null) return a.name.localeCompare(b.name);
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    if (a.pct !== b.pct) return a.pct - b.pct;
    return a.name.localeCompare(b.name);
  });

  return {
    subject: {
      id: subject.id,
      name: subject.name,
      type: normalizeSubjectType(subject.type),
    },
    totalClassesHeld: classes?.length || 0,
    rows,
  };
}

// ==========================================
// SCOPED CLASSES & DAILY MANAGER ACTIONS
// ==========================================

export async function getClassesForDate(dateStr: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const { data, error } = await supabase
    .from('classes')
    .select('*, subjects(id, name, type), batches(id, name)')
    .eq('admin_id', session.adminId)
    .eq('date', dateStr)
    .order('start_time', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addCustomClass(
  subjectId: string,
  dateStr: string,
  startTime: string,
  endTime: string,
  batchId?: string,
  targetAdminId?: string
) {
  const session = await assertAdmin(targetAdminId);

  if (!startTime || !endTime) {
    throw new Error('Start time and End time are required.');
  }
  if (startTime >= endTime) {
    throw new Error('Start time must be earlier than End time.');
  }

  const insertPayload = {
    admin_id: session.adminId,
    subject_id: subjectId,
    date: dateStr,
    start_time: startTime,
    end_time: endTime,
    ...(batchId ? { batch_id: batchId } : {}),
  };

  const { data, error } = await supabase
    .from('classes')
    .insert([insertPayload])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A class for this subject and batch at this time already exists on this day.');
    }
    if (error.code === '23514') {
      throw new Error('Start time must be strictly earlier than end time.');
    }
    throw new Error(error.message);
  }

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'ADD_CLASS',
    { subject_id: subjectId, date: dateStr, start_time: startTime }
  );

  return data;
}

export async function getBatchMemberRollNumbers(batchId: string) {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('batch_students')
    .select('student_roll_number')
    .eq('batch_id', batchId);

  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.student_roll_number);
}

export async function deleteClass(classId: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const { error } = await supabase
    .from('classes')
    .delete()
    .eq('id', classId)
    .eq('admin_id', session.adminId);

  if (error) throw new Error(error.message);

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'DELETE_CLASS',
    { class_id: classId }
  );

  return { success: true };
}

// ==========================================
// SCOPED ATTENDANCE ACTIONS
// ==========================================

export async function getClassAttendance(classId: string) {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('class_id', classId);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function saveAttendance(
  classId: string,
  records: { student_roll_number: string; status: 'present' | 'absent' }[],
  targetAdminId?: string
) {
  const session = await assertAdmin(targetAdminId);

  if (records.length === 0) return { success: true };

  const upsertData = records.map((r) => ({
    class_id: classId,
    student_roll_number: sanitizeRollNumber(r.student_roll_number),
    status: r.status === 'absent' ? 'absent' : 'present',
  }));

  const CHUNK_SIZE = 500;
  for (let i = 0; i < upsertData.length; i += CHUNK_SIZE) {
    const chunk = upsertData.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from('attendance')
      .upsert(chunk, { onConflict: 'class_id,student_roll_number' });

    if (error) throw new Error(error.message);
  }

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'SAVE_ATTENDANCE',
    { class_id: classId, count: records.length }
  );

  return { success: true };
}

// ==========================================
// SCOPED STUDENT REPORT ACTIONS
// ==========================================

export async function getStudentReport(rollNumber: string) {
  const session = await assertAuthenticated();
  const cleanRoll = sanitizeRollNumber(rollNumber);

  // IDOR Defense: Students can only view their own report within their assigned classroom
  if (session.role === 'student') {
    if (session.rollNumber !== cleanRoll) {
      throw new Error('Unauthorized: You can only view your own attendance report.');
    }
  }

  // Determine target admin ID for query
  let adminId = session.adminId;
  if (!adminId) {
    // Lookup student's classroom
    const { data: st } = await supabase
      .from('students')
      .select('admin_id')
      .eq('roll_number', cleanRoll)
      .maybeSingle();
    adminId = st?.admin_id || null;
  }

  if (!adminId) {
    throw new Error('Classroom context not found.');
  }

  // 1. Get student info
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*, admins(classroom_name, classroom_code)')
    .eq('admin_id', adminId)
    .eq('roll_number', cleanRoll)
    .single();

  if (studentError || !student) {
    throw new Error('Student not found in this classroom.');
  }

  // 2. Fetch all subjects of this classroom
  const { data: subjects, error: subjectsError } = await supabase
    .from('subjects')
    .select('*')
    .eq('admin_id', adminId)
    .order('name', { ascending: true });

  if (subjectsError) throw new Error(subjectsError.message);

  // 3. Fetch all class instances held for this classroom
  const { data: allClasses, error: classesError } = await supabase
    .from('classes')
    .select('*, subjects(id, name)')
    .eq('admin_id', adminId)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false });

  if (classesError) throw new Error(classesError.message);

  // 4. Fetch attendance records for this student
  const classIds = (allClasses || []).map((c) => c.id);
  const attendanceRecords: { class_id: string; status: string }[] = [];

  if (classIds.length > 0) {
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('attendance')
        .select('class_id, status')
        .eq('student_roll_number', cleanRoll)
        .in('class_id', classIds)
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(error.message);
      if (data && data.length > 0) {
        attendanceRecords.push(...data);
        if (data.length < PAGE_SIZE) hasMore = false;
        else from += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }
  }

  const attendanceMap = new Map<string, 'present' | 'absent'>();
  attendanceRecords.forEach((rec) => {
    attendanceMap.set(rec.class_id, rec.status as 'present' | 'absent');
  });

  const subjectStatsMap = new Map<
    string,
    { id: string; name: string; type: string; totalClasses: number; attended: number; absent: number }
  >();

  subjects?.forEach((sub) => {
    subjectStatsMap.set(sub.id, {
      id: sub.id,
      name: sub.name,
      type: normalizeSubjectType(sub.type),
      totalClasses: 0,
      attended: 0,
      absent: 0,
    });
  });

  const absentDays: { date: string; time: string; subject: string }[] = [];
  const fullAttendanceLog: {
    classId: string;
    subjectName: string;
    date: string;
    time: string;
    status: 'present' | 'absent' | 'unmarked';
  }[] = [];

  allClasses?.forEach((cls) => {
    const status = attendanceMap.get(cls.id) || 'unmarked';
    const subId = cls.subject_id;
    const stats = subjectStatsMap.get(subId);
    const timeFormatted = `${cls.start_time.substring(0, 5)} - ${cls.end_time.substring(0, 5)}`;

    if (stats && status !== 'unmarked') {
      stats.totalClasses += 1;
      if (status === 'present') stats.attended += 1;
      else if (status === 'absent') stats.absent += 1;
    }

    if (status === 'absent') {
      absentDays.push({
        date: cls.date,
        time: timeFormatted,
        subject: cls.subjects?.name || 'Unknown',
      });
    }

    fullAttendanceLog.push({
      classId: cls.id,
      subjectName: cls.subjects?.name || 'Unknown',
      date: cls.date,
      time: timeFormatted,
      status,
    });
  });

  return {
    student,
    subjectStats: Array.from(subjectStatsMap.values()),
    absentDays,
    fullAttendanceLog,
  };
}

// ==========================================
// SCOPED BATCH ACTIONS
// ==========================================

export async function getBatches(targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const { data, error } = await supabase
    .from('batches')
    .select('*, subjects(id, name, type)')
    .eq('admin_id', session.adminId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getBatchesForSubject(subjectId: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('admin_id', session.adminId)
    .eq('subject_id', subjectId)
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function addBatch(subjectId: string, name: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const cleanName = sanitizeText(name, 100);
  if (!cleanName) {
    throw new Error('Batch name is required.');
  }

  const { data, error } = await supabase
    .from('batches')
    .insert([
      {
        admin_id: session.adminId,
        subject_id: subjectId,
        name: cleanName,
      },
    ])
    .select();

  if (error) {
    if (error.code === '23505') {
      throw new Error('A batch with this name already exists for this subject.');
    }
    throw new Error(error.message);
  }

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'ADD_BATCH',
    { subject_id: subjectId, name: cleanName }
  );

  return data;
}

export async function deleteBatch(batchId: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  const { error } = await supabase
    .from('batches')
    .delete()
    .eq('id', batchId)
    .eq('admin_id', session.adminId);

  if (error) throw new Error(error.message);

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'DELETE_BATCH',
    { batch_id: batchId }
  );

  return { success: true };
}

export async function getBatchStudents(batchId: string) {
  await assertAuthenticated();

  const { data, error } = await supabase
    .from('batch_students')
    .select('student_roll_number')
    .eq('batch_id', batchId);

  if (error) throw new Error(error.message);

  const rollNumbers = (data || []).map((r) => r.student_roll_number);
  if (rollNumbers.length === 0) return [];

  // Fetch names for these roll numbers
  const { data: batchRow } = await supabase
    .from('batches')
    .select('admin_id')
    .eq('id', batchId)
    .single();

  const adminId = batchRow?.admin_id;

  let query = supabase.from('students').select('roll_number, name').in('roll_number', rollNumbers);
  if (adminId) {
    query = query.eq('admin_id', adminId);
  }

  const { data: students } = await query;
  const nameMap = new Map((students || []).map((s) => [s.roll_number, s.name]));

  return rollNumbers.map((roll) => ({
    roll_number: roll,
    name: nameMap.get(roll) || 'Unknown',
  }));
}

export async function addStudentToBatch(batchId: string, rollNumber: string, targetAdminId?: string) {
  await assertAdmin(targetAdminId);

  const cleanRoll = sanitizeRollNumber(rollNumber);
  const { error } = await supabase
    .from('batch_students')
    .insert([{ batch_id: batchId, student_roll_number: cleanRoll }]);

  if (error) {
    if (error.code === '23505') {
      throw new Error('Student is already in this batch.');
    }
    throw new Error(error.message);
  }
  return { success: true };
}

export async function addMultipleStudentsToBatch(
  batchId: string,
  rollNumbers: string[],
  targetAdminId?: string
) {
  await assertAdmin(targetAdminId);

  if (rollNumbers.length === 0) return { success: true };

  const insertData = rollNumbers
    .map((r) => sanitizeRollNumber(r))
    .filter(Boolean)
    .map((r) => ({
      batch_id: batchId,
      student_roll_number: r,
    }));

  const { error } = await supabase
    .from('batch_students')
    .upsert(insertData, { onConflict: 'batch_id,student_roll_number' });

  if (error) throw new Error(error.message);
  return { success: true };
}

export async function removeStudentFromBatch(
  batchId: string,
  rollNumber: string,
  targetAdminId?: string
) {
  await assertAdmin(targetAdminId);

  const cleanRoll = sanitizeRollNumber(rollNumber);
  const { error } = await supabase
    .from('batch_students')
    .delete()
    .eq('batch_id', batchId)
    .eq('student_roll_number', cleanRoll);

  if (error) throw new Error(error.message);
  return { success: true };
}

// ==========================================
// SCOPED EVENT ACTIONS (CLASSROOM + GLOBAL)
// ==========================================

export async function getEvents(targetAdminId?: string) {
  const session = await getSession();

  let adminId = targetAdminId;
  if (!adminId) {
    if (session.role === 'admin') adminId = session.adminId || undefined;
    else if (session.role === 'student') adminId = session.adminId || undefined;
    else if (session.role === 'super_admin') adminId = session.activeAdminId || undefined;
  }

  let query = supabase.from('events').select('*').order('date', { ascending: true });

  if (adminId) {
    query = query.or(`admin_id.eq.${adminId},is_global.eq.true`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function addEvent(
  title: string,
  description: string,
  date: string,
  targetAdminId?: string
) {
  const session = await assertAdmin(targetAdminId);

  const cleanTitle = sanitizeText(title, 150);
  const cleanDesc = sanitizeText(description, 500);

  if (!cleanTitle) {
    throw new Error('Event title is required.');
  }

  const { data, error } = await supabase
    .from('events')
    .insert([
      {
        admin_id: session.adminId,
        title: cleanTitle,
        description: cleanDesc || null,
        date,
        is_global: false,
      },
    ])
    .select();

  if (error) throw new Error(error.message);

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'ADD_EVENT',
    { title: cleanTitle, date }
  );

  return data;
}

export async function deleteEvent(eventId: string, targetAdminId?: string) {
  const session = await assertAdmin(targetAdminId);

  let query = supabase.from('events').delete().eq('id', eventId);

  // Non-super admin can only delete their own classroom events
  if (session.role !== 'super_admin') {
    query = query.eq('admin_id', session.adminId);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);

  await logAuditAction(
    session.role === 'super_admin' ? 'super_admin' : 'admin',
    session.role === 'super_admin' ? 'super_admin' : session.adminId,
    session.adminId,
    'DELETE_EVENT',
    { event_id: eventId }
  );

  return { success: true };
}
