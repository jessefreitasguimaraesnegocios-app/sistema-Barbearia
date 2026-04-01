import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User as AppUser, UserRole } from '../types';
import { supabase } from '../src/lib/supabase';
import { normalizeProfileRoleFromDb, type DbProfileRole } from '../lib/profileRole';

type ProfileRole = DbProfileRole;

interface Profile {
  id: string;
  role: ProfileRole;
  shop_id: string | null;
  professional_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  cpf_cnpj: string | null;
  phone: string | null;
}

function mapRole(role: ProfileRole): UserRole {
  const r = normalizeProfileRoleFromDb(role);
  if (r === 'admin') return 'ADMIN';
  if (r === 'barbearia') return 'SHOP';
  if (r === 'profissional') return 'STAFF';
  return 'CLIENT';
}

function toAppUser(profile: Profile | null, email: string): AppUser | null {
  if (!profile) return null;
  const name = (profile.full_name && profile.full_name.trim()) || email?.split('@')[0] || 'Usuário';
  return {
    id: profile.id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    email,
    role: mapRole(profile.role),
    shopId: profile.shop_id || undefined,
    professionalId: profile.professional_id || undefined,
    avatar: profile.avatar_url || undefined,
    cpfCnpj: profile.cpf_cnpj || undefined,
    phone: profile.phone || undefined,
  };
}

/** Sessão ativa mas linha em profiles não retornou (RLS/erro) — nunca tratar como cliente. */
function pendingAppUser(id: string, email: string): AppUser {
  const base = (email?.split('@')[0] || 'Usuário').trim() || 'Usuário';
  return {
    id,
    email: email || '',
    name: base.charAt(0).toUpperCase() + base.slice(1),
    role: 'PENDING',
  };
}

interface AuthContextValue {
  user: AppUser | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: { full_name?: string; avatar_url?: string; cpf_cnpj?: string; phone?: string }) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const full =
      'id, role, shop_id, professional_id, full_name, avatar_url, cpf_cnpj, phone';
    let res = await supabase.from('profiles').select(full).eq('id', userId).maybeSingle();

    if (res.error) {
      const msg = (res.error.message || '').toLowerCase();
      const code = String(res.error.code || '');
      const maybeMissingProfessionalId =
        msg.includes('professional_id') ||
        (msg.includes('column') && msg.includes('does not exist')) ||
        code === '42703' ||
        code === 'PGRST204';
      if (maybeMissingProfessionalId) {
        res = await supabase
          .from('profiles')
          .select('id, role, shop_id, full_name, avatar_url, cpf_cnpj, phone')
          .eq('id', userId)
          .maybeSingle();
        if (!res.error && res.data) {
          return {
            ...res.data,
            role: normalizeProfileRoleFromDb((res.data as Profile).role),
            professional_id: null,
          } as Profile;
        }
      }
    }

    if (res.error) {
      console.error('[AuthContext] fetchProfile', res.error);
      const minimal = await supabase
        .from('profiles')
        .select('id, role, shop_id')
        .eq('id', userId)
        .maybeSingle();
      if (minimal.error || !minimal.data) {
        return null;
      }
      return {
        id: minimal.data.id,
        role: normalizeProfileRoleFromDb(minimal.data.role),
        shop_id: minimal.data.shop_id,
        professional_id: null,
        full_name: null,
        avatar_url: null,
        cpf_cnpj: null,
        phone: null,
      };
    }

    if (!res.data) return null;

    const row = res.data as Profile & { professional_id?: string | null };
    return {
      ...row,
      role: normalizeProfileRoleFromDb(row.role),
      professional_id: row.professional_id ?? null,
    } as Profile;
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setEmail(null);
      setSessionUserId(null);
      return;
    }
    setEmail(user.email ?? null);
    const p = await fetchProfile(user.id);
    setProfile(p);
    setSessionUserId(user.id);
  }, [fetchProfile]);

  useEffect(() => {
    let cancelled = false;
    const safeSetLoading = (v: boolean) => { if (!cancelled) setLoading(v); };

    const timeoutId = window.setTimeout(() => {
      safeSetLoading(false);
    }, 4000);

    try {
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        try {
          if (session?.user) {
            setEmail(session.user.email ?? null);
            const p = await fetchProfile(session.user.id);
            if (!cancelled) {
              setProfile(p);
              setSessionUserId(session.user.id);
            }
          } else {
            setProfile(null);
            setEmail(null);
            setSessionUserId(null);
          }
        } finally {
          safeSetLoading(false);
        }
      }).catch(() => {
        setProfile(null);
        setEmail(null);
        setSessionUserId(null);
        safeSetLoading(false);
      });
    } catch (_) {
      safeSetLoading(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setEmail(session.user.email ?? null);
        const p = await fetchProfile(session.user.id);
        setProfile(p);
        setSessionUserId(session.user.id);
      } else {
        setProfile(null);
        setEmail(null);
        setSessionUserId(null);
      }
      safeSetLoading(false);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(async (emailInput: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: emailInput, password });
      if (error) return { error: error.message };
      if (!data.user) return { error: 'Erro ao entrar.' };
      const p = await fetchProfile(data.user.id);
      setProfile(p);
      setSessionUserId(data.user.id);
      setEmail(data.user.email ?? null);
      setLoading(false);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Erro ao conectar. Tente novamente.' };
    }
  }, [fetchProfile]);

  const signUp = useCallback(async (emailInput: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email: emailInput, password });
      if (error) return { error: error.message };
      if (!data.user) return { error: 'Erro ao criar conta.' };
      const p = await fetchProfile(data.user.id);
      setProfile(p);
      setSessionUserId(data.user.id);
      setEmail(data.user.email ?? null);
      setLoading(false);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Erro ao conectar. Tente novamente.' };
    }
  }, [fetchProfile]);

  const signInWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname },
      });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Erro ao conectar. Tente novamente.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setEmail(null);
    setSessionUserId(null);
  }, []);

  const updateProfile = useCallback(async (data: { full_name?: string; avatar_url?: string; cpf_cnpj?: string; phone?: string }) => {
    const uid = profile?.id;
    if (!uid) return { error: 'Não autenticado.' };
    const { error } = await supabase.from('profiles').update(data).eq('id', uid);
    if (error) return { error: error.message };
    await refreshProfile();
    return { error: null };
  }, [profile?.id, refreshProfile]);

  const user: AppUser | null = useMemo(() => {
    if (!sessionUserId) return null;
    if (profile) return toAppUser(profile, email || '');
    return pendingAppUser(sessionUserId, email || '');
  }, [sessionUserId, profile, email]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signInWithGoogle, signOut, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
