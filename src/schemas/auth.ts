import { z } from 'zod';
import type { ClientType } from '../types';

/**
 * Validación de entrada de autenticación (MÓDULO 28).
 *
 * Estos esquemas se aplican ANTES de llamar a Supabase, pero no son la
 * defensa real: la validación que cuenta ocurre en la base de datos
 * (constraints, enums, RLS) y en Supabase Auth. Aquí solo evitamos viajes
 * de red inútiles y damos mensajes claros al usuario.
 */

export const CLIENT_TYPES = [
  'Particular',
  'Constructor',
  'Empresa',
  'Profesional',
  'Distribuidor',
] as const;

// Comprobación en tiempo de compilación: si alguien añade un valor a la
// unión `ClientType` en src/types/index.ts sin actualizar esta lista (ni el
// enum `public.client_type` en la migración), `tsc` falla aquí.
const _clientTypesCoincidenConElFrontend: readonly ClientType[] = CLIENT_TYPES;
void _clientTypesCoincidenConElFrontend;

export const loginSchema = z.object({
  email: z.email('Ingresa un correo electrónico válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

// Refleja exactamente las validaciones que ya hace RegisterPage.tsx,
// incluida la longitud mínima de 6 caracteres, que además coincide con
// `minimum_password_length` de supabase/config.toml.
export const TIPOS_DOCUMENTO = ['CC', 'CE', 'PASAPORTE', 'PEP'] as const;

/**
 * El registro tiene dos formas y por eso el esquema es una unión: exigirle
 * NIT a una persona natural, o cédula a una empresa, obligaría a inventar
 * datos para poder continuar.
 */
export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio'),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio'),
  clientType: z.enum(CLIENT_TYPES),
  company: z.string().trim().min(1, 'La empresa o razón social es obligatoria'),
  email: z.email('Ingresa un correo electrónico válido'),
  phone: z.string().trim().min(1, 'El teléfono es obligatorio'),
  city: z.string().trim().min(1, 'La ciudad es obligatoria'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

/** Persona natural: sin razón social ni NIT. */
export const registroPersonaSchema = z.object({
  accountType: z.literal('PERSONA'),
  firstName: z.string().trim().min(1, 'El nombre es obligatorio'),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio'),
  documentType: z.enum(TIPOS_DOCUMENTO),
  documentNumber: z.string().trim().min(5, 'Ingresa un número de documento válido'),
  email: z.email('Ingresa un correo electrónico válido'),
  phone: z.string().trim().min(1, 'El teléfono es obligatorio'),
  city: z.string().trim().min(1, 'La ciudad es obligatoria'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

/** Empresa: razón social, NIT y datos del representante. */
export const registroEmpresaSchema = z.object({
  accountType: z.literal('EMPRESA'),
  company: z.string().trim().min(1, 'La razón social es obligatoria'),
  companyNit: z.string().trim().min(5, 'Ingresa el NIT de la empresa'),
  clientType: z.enum(['Constructor', 'Empresa', 'Profesional', 'Distribuidor']),
  firstName: z.string().trim().min(1, 'El nombre del representante es obligatorio'),
  lastName: z.string().trim().min(1, 'El apellido del representante es obligatorio'),
  email: z.email('Ingresa un correo electrónico válido'),
  phone: z.string().trim().min(1, 'El teléfono es obligatorio'),
  city: z.string().trim().min(1, 'La ciudad es obligatoria'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

export type RegistroPersona = z.infer<typeof registroPersonaSchema>;
export type RegistroEmpresa = z.infer<typeof registroEmpresaSchema>;
export type RegistroInput = RegistroPersona | RegistroEmpresa;

export const emailSchema = z.email('Ingresa un correo electrónico válido');

export const passwordSchema = z
  .string()
  .min(6, 'La contraseña debe tener al menos 6 caracteres');

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
