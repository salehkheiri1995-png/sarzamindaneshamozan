import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, registerTokenGetter } from '../lib/api';

export type SessionRole = 'student' | 'parent' | 'teacher' | 'admin';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  username?: string | null;
  displayName: string;
  role: 'parent' | 'teacher' | 'admin';
  teacherApproved: boolean;
  isActive?: boolean;
  hasPassword?: boolean;
  schoolName: string | null;
  teachingGrades: string;
  teachingSubjects: string;
}

export interface StudentProfile {
  id: number;
  parentUid: string;
  nickname: string;
  username?: string | null;
  hasPassword?: boolean;
  gradeId: number;
  academicYear: string;
  age: number | null;
  heroClass: 'explorer' | 'scholar' | 'inventor' | 'guardian';
  avatarColor: string;
  equippedOutfit: string;
  equippedPet: string;
  castleDecor: string;
  ownedItems: string;
  coins: number;
  xp: number;
  streakDays: number;
  currentStreak?: number;
  longestStreak?: number;
  lastActiveDate?: string | null;
  dailyQuestProgress?: string;
  earnedBadges?: string;
  dailyLimitMinutes: number;
  minutesUsedToday: number;
  allowOptionalAds: boolean;
  allowClassJoin: boolean;
  lastGameType: string | null;
}

export interface GlobalAnnouncement {
  id: number;
  classroomId: number | null;
  senderName: string;
  targetAudience?: string;
  title?: string | null;
  kind: string;
  message: string;
  scheduledDate: string | null;
  createdAt: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  sessionRole: SessionRole | null;
  firebaseUser: FirebaseUser | null;
  dbUser: DbUser | null;
  students: StudentProfile[];
  activeStudent: StudentProfile | null;
  globalAnnouncements: GlobalAnnouncement[];
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: (portal: 'parent' | 'teacher' | 'admin') => Promise<{
    ok: boolean;
    role: SessionRole | null;
    studentCount: number;
  }>;
  signInWithPassword: (params: {
    portal: SessionRole;
    username: string;
    password: string;
  }) => Promise<{ ok: boolean; role: SessionRole | null; studentCount: number }>;
  registerWithPassword: (params: {
    role: 'parent' | 'teacher';
    username: string;
    password: string;
    displayName: string;
    schoolName?: string;
  }) => Promise<{ ok: boolean; role: SessionRole | null }>;
  bootstrapAdmin: (params: {
    username: string;
    password: string;
    displayName: string;
  }) => Promise<{ ok: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<{ role: SessionRole | null; students: StudentProfile[] }>;
  setActiveStudentId: (id: number) => void;
  updateLocalStudent: (student: StudentProfile) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole | null>(null);
  const [dbUser, setDbUser] = useState<DbUser | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [activeStudentId, setActiveStudentIdState] = useState<number | null>(null);
  const [globalAnnouncements, setGlobalAnnouncements] = useState<GlobalAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Tokens held strictly in memory (never localStorage/sessionStorage!)
  const customTokenRef = useRef<string | null>(null);
  const firebaseTokenRef = useRef<string | null>(null);
  const googleSignInInFlightRef = useRef<boolean>(false);
  const activePortalRef = useRef<SessionRole | null>(null);

  useEffect(() => {
    registerTokenGetter(async () => {
      if (customTokenRef.current) return customTokenRef.current;
      if (auth.currentUser) {
        const fresh = await auth.currentUser.getIdToken();
        firebaseTokenRef.current = fresh;
        return fresh;
      }
      return firebaseTokenRef.current;
    });
  }, []);

  const refreshProfile = useCallback(
    async (portalHeader?: string): Promise<{ role: SessionRole | null; students: StudentProfile[] }> => {
      if (!customTokenRef.current && !auth.currentUser) {
        return { role: null, students: [] };
      }
      try {
        const headers: Record<string, string> = {};
        const effectivePortal = portalHeader || activePortalRef.current || undefined;
        if (effectivePortal) headers['x-portal-role'] = effectivePortal;
        const data = await apiFetch<{
          sessionRole: SessionRole;
          user: DbUser | null;
          students: StudentProfile[];
          globalAnnouncements?: GlobalAnnouncement[];
        }>('/api/me', { headers });

        activePortalRef.current = data.sessionRole;
        setSessionRole(data.sessionRole);
        setDbUser(data.user);
        setStudents(data.students);
        setGlobalAnnouncements(data.globalAnnouncements || []);
        setActiveStudentIdState((prev) => {
          if (prev && data.students.some((s) => s.id === prev)) return prev;
          return data.students[0]?.id ?? null;
        });
        setAuthError(null);
        return { role: data.sessionRole, students: data.students };
      } catch (err) {
        console.error('Failed to sync profile:', err);
        setAuthError(err instanceof Error ? err.message : 'خطا در اتصال به سرور.');
        return { role: null, students: [] };
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (googleSignInInFlightRef.current) {
        setLoading(false);
        return;
      }
      if (user && !customTokenRef.current) {
        firebaseTokenRef.current = await user.getIdToken();
        await refreshProfile();
      } else if (!user && !customTokenRef.current) {
        firebaseTokenRef.current = null;
        activePortalRef.current = null;
        setSessionRole(null);
        setDbUser(null);
        setStudents([]);
        setActiveStudentIdState(null);
        setGlobalAnnouncements([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [refreshProfile]);

  const signInWithGoogle = async (portal: 'parent' | 'teacher' | 'admin') => {
    setAuthError(null);
    customTokenRef.current = null;
    googleSignInInFlightRef.current = true;
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      firebaseTokenRef.current = await cred.user.getIdToken();
      activePortalRef.current = portal;
      const loaded = await refreshProfile(portal);
      if (!loaded.role) {
        return { ok: false, role: null, studentCount: 0 };
      }
      if (loaded.role !== portal) {
        const labels: Record<string, string> = {
          parent: 'والدین',
          teacher: 'معلم',
          admin: 'مدیر سامانه',
          student: 'دانش‌آموز',
        };
        setAuthError(
          `این حساب گوگل با نقش «${labels[loaded.role]}» ثبت شده است و شما مستقیم به پنل مخصوص همان نقش منتقل شدید.`
        );
      }
      return { ok: true, role: loaded.role, studentCount: loaded.students.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ورود با گوگل انجام نشد.';
      setAuthError(
        msg.includes('popup-closed')
          ? 'پنجره ورود گوگل بسته شد. دوباره تلاش کنید.'
          : 'خطا در ورود با حساب گوگل. لطفاً دوباره امتحان کنید.'
      );
      return { ok: false, role: null, studentCount: 0 };
    } finally {
      googleSignInInFlightRef.current = false;
    }
  };

  const signInWithPassword = async (params: {
    portal: SessionRole;
    username: string;
    password: string;
  }) => {
    setAuthError(null);
    try {
      const data = await apiFetch<{
        token: string;
        sessionRole: SessionRole;
        user?: DbUser;
        student?: StudentProfile;
        students?: StudentProfile[];
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(params),
      });

      customTokenRef.current = data.token;
      firebaseTokenRef.current = null;
      activePortalRef.current = data.sessionRole;
      setSessionRole(data.sessionRole);
      setDbUser(data.user || null);
      const list = data.student ? [data.student] : data.students || [];
      setStudents(list);
      setActiveStudentIdState(list[0]?.id ?? null);
      apiFetch<{ announcements: GlobalAnnouncement[] }>('/api/announcements/global')
        .then((res) => setGlobalAnnouncements(res.announcements || []))
        .catch(() => {});
      return { ok: true, role: data.sessionRole, studentCount: list.length };
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'ورود ناموفق بود.');
      return { ok: false, role: null, studentCount: 0 };
    }
  };

  const registerWithPassword = async (params: {
    role: 'parent' | 'teacher';
    username: string;
    password: string;
    displayName: string;
    schoolName?: string;
  }) => {
    setAuthError(null);
    try {
      const data = await apiFetch<{
        token: string;
        sessionRole: SessionRole;
        user: DbUser;
        students: StudentProfile[];
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      customTokenRef.current = data.token;
      firebaseTokenRef.current = null;
      activePortalRef.current = data.sessionRole;
      setSessionRole(data.sessionRole);
      setDbUser(data.user);
      setStudents(data.students || []);
      setActiveStudentIdState(null);
      apiFetch<{ announcements: GlobalAnnouncement[] }>('/api/announcements/global')
        .then((res) => setGlobalAnnouncements(res.announcements || []))
        .catch(() => {});
      return { ok: true, role: data.sessionRole };
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'ثبت‌نام ناموفق بود.');
      return { ok: false, role: null };
    }
  };

  const bootstrapAdmin = async (params: {
    username: string;
    password: string;
    displayName: string;
  }) => {
    setAuthError(null);
    try {
      const data = await apiFetch<{
        token: string;
        sessionRole: SessionRole;
        user: DbUser;
      }>('/api/auth/admin-bootstrap', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      customTokenRef.current = data.token;
      setSessionRole('admin');
      setDbUser(data.user);
      setStudents([]);
      setActiveStudentIdState(null);
      return { ok: true };
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'ثبت مدیر اولیه ناموفق بود.');
      return { ok: false };
    }
  };

  const signOut = async () => {
    customTokenRef.current = null;
    firebaseTokenRef.current = null;
    activePortalRef.current = null;
    if (auth.currentUser) {
      await firebaseSignOut(auth).catch(() => {});
    }
    setSessionRole(null);
    setDbUser(null);
    setStudents([]);
    setActiveStudentIdState(null);
    setGlobalAnnouncements([]);
    setAuthError(null);
  };

  const updateLocalStudent = useCallback((updated: StudentProfile) => {
    setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  const activeStudent = students.find((s) => s.id === activeStudentId) ?? students[0] ?? null;
  const isAuthenticated = Boolean(sessionRole && (customTokenRef.current || firebaseUser));

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        sessionRole,
        firebaseUser,
        dbUser,
        students,
        activeStudent,
        globalAnnouncements,
        loading,
        authError,
        clearAuthError: () => setAuthError(null),
        signInWithGoogle,
        signInWithPassword,
        registerWithPassword,
        bootstrapAdmin,
        signOut,
        refreshProfile,
        setActiveStudentId: setActiveStudentIdState,
        updateLocalStudent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
