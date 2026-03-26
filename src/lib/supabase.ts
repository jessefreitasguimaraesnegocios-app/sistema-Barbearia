import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const REMEMBER_ME_KEY = 'beautyhub_remember_me';

const storage = {
  getItem: (key: string) => {
    if (key === REMEMBER_ME_KEY) return localStorage.getItem(key);
    return (localStorage.getItem(REMEMBER_ME_KEY) === 'false' ? sessionStorage : localStorage).getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (key === REMEMBER_ME_KEY) {
      localStorage.setItem(key, value);
      return;
    }
    (localStorage.getItem(REMEMBER_ME_KEY) === 'false' ? sessionStorage : localStorage).setItem(key, value);
  },
  removeItem: (key: string) => {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  },
};

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    storage,
    persistSession: true,
    lock: (_name, _acquireTimeout, fn) => fn(),
  },
});
