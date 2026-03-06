import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
}

// Lock customizado: executa a função sem usar Navigator LockManager, evitando o erro
// "Acquiring an exclusive Navigator LockManager lock ... timed out waiting 10000ms"
export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    lock: (_name, _acquireTimeout, fn) => fn(),
    lockAcquireTimeout: 5000,
  },
});
