import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/** Cliente del navegador: solo anon key; la autorización la aplica RLS. storageKey propio para no chocar con claves locales existentes. */
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Necesario para el enlace de recuperación de contraseña.
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'colorlink_pintuco_auth',
  },
  global: {
    headers: { 'x-application-name': 'colorlink-web' },
  },
});
