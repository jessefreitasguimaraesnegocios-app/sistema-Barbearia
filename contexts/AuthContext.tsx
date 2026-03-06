import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User as AppUser, UserRole } from '../types';
import { supabase } from '../src/lib/supabase';

type ProfileRole = 'admin' | 'barbearia' | 'cliente';

interface Profile {
  id: string;
  role: ProfileRole;
  shop_id: string | null;
}

function mapRole(role: ProfileRole): UserRole {
  if (role === 'admin') return 'ADMIN';
  if (role === 'barbearia') return 'SHOP';
  return 'CLIENT';
}

function toAppUser(profile: Profile | null, email: string): AppUser | null {
  if (!profile) return null;
  const name = email?.split('@')[0] || 'Usuário';
  return {
    id: profile.id,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    email,
    role: mapRole(profile.role),
    shopId: profile.shop_id || undefined,
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('id, role, shop_id').eq('id', userId).single();
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setEmail(session.user.email ?? null);
        const p = await fetchProfile(session.user.id);
        setProfile(p);
      } else {
        setProfile(null);
        setEmail(null);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setEmail(session.user.email ?? null);
        const p = await fetchProfile(session.user.id);
        setProfile(p);
      } else {
        setProfile(null);
        setEmail(null);
      }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (emailInput: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailInput, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Erro ao entrar.' };
    const p = await fetchProfile(data.user.id);
    setProfile(p);
    setEmail(data.user.email ?? null);
    return { error: null };
  }, [fetchProfile]);

  const signUp = useCallback(async (emailInput: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: emailInput, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Erro ao criar conta.' };
    const p = await fetchProfile(data.user.id);
    setProfile(p ?? null);
    setEmail(data.user.email ?? null);
    return { error: null };
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setEmail(null);
  }, []);

  const user = toAppUser(profile, email || '');

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
