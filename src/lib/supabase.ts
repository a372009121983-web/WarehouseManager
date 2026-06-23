import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'wms-auth-token',
    storage: window.localStorage,
  },
});

export type UserRole = 'admin' | 'warehouse_manager' | 'driver' | 'worker' | 'boss';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  active: boolean;
  owner_id: string | null;
  max_salary?: number;
  hire_date?: string;
}
