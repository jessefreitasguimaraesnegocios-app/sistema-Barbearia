import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User as AppUser, UserRole } from '../types';
import { supabase } from '../src/lib/supabase';

type ProfileRole = 'admin' | 'barbearia' | 'cliente';

interface Profile {
  id: string;
  role: ProfileRole;
  shop_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  cpf_cnpj: string | null;
  phone: string | null;
}

function mapRole(role: ProfileRole): UserRole {
  if (role === 'admin') return 'ADMIN';
  if (role === 'barbearia') return 'SHOP';
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
    avatar: profile.avatar_url || undefined,
    cpfCnpj: profile.cpf_cnpj || undefined,
    phone: profile.phone || undefined,
  };
}

interface AuthContextValue {
  user: AppUser | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: { full_name?: string; avatar_url?: string; cpf_cnpj?: string; phone?: string }) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('id, role, shop_id, full_name, avatar_url, cpf_cnpj, phone').eq('id', userId).single();
    return data as Profile | null;
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setEmail(null);
      return;
    }
    setEmail(user.email ?? null);
    const p = await fetchProfile(user.id);
    setProfile(p);
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
            if (!cancelled) setProfile(p ?? { id: session.user.id, role: 'cliente', shop_id: null });
          } else {
            setProfile(null);
            setEmail(null);
          }
        } finally {
          safeSetLoading(false);
        }
      }).catch(() => {
        setProfile(null);
        setEmail(null);
        safeSetLoading(false);
      });
    } catch (_) {
      safeSetLoading(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setEmail(session.user.email ?? null);
        const p = await fetchProfile(session.user.id);
        setProfile(p ?? { id: session.user.id, role: 'cliente', shop_id: null });
      } else {
        setProfile(null);
        setEmail(null);
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
      setProfile(p ?? { id: data.user.id, role: 'cliente', shop_id: null });
      setEmail(data.user.email ?? null);
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
      setProfile(p ?? { id: data.user.id, role: 'cliente', shop_id: null });
      setEmail(data.user.email ?? null);
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Erro ao conectar. Tente novamente.' };
    }
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setEmail(null);
  }, []);

  const updateProfile = useCallback(async (data: { full_name?: string; avatar_url?: string; cpf_cnpj?: string; phone?: string }) => {
    const uid = profile?.id;
    if (!uid) return { error: 'Não autenticado.' };
    const { error } = await supabase.from('profiles').update(data).eq('id', uid);
    if (error) return { error: error.message };
    await refreshProfile();
    return { error: null };
  }, [profile?.id, refreshProfile]);

  const user = toAppUser(profile, email || '');

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
