import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Cliente Supabase del navegador.
 *
 * Usa exclusivamente la ANON KEY. Toda la autorización real la resuelve
 * Row Level Security en Postgres, nunca este cliente.
 *
 * `storageKey` es propio y no colisiona con las claves de localStorage que ya
 * usa la app (`colorlink_pintuco_*`, `pintuco_colorlink_cart_v1`), de modo que
 * la migración desde los datos mock puede ser gradual.
 */
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Necesario para completar el enlace de recuperación de contraseña (MÓDULO 1).
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'colorlink_pintuco_auth',
  },
  global: {
    headers: { 'x-application-name': 'colorlink-web' },
  },
});
