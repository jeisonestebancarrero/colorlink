import { z } from 'zod';
import type { ClientType } from '../types';

/**
 * Validación previa a Supabase para dar mensajes claros y ahorrar viajes; la
 * defensa real está en la base (constraints, RLS) y en Supabase Auth.
 */

export const CLIENT_TYPES = [
  'Particular',
  'Constructor',
  'Empresa',
  'Profesional',
  'Distribuidor',
] as const;

// Falla en compilación si `ClientType` cambia sin actualizar esta lista (y el enum public.client_type).
const _clientTypesCoincidenConElFrontend: readonly ClientType[] = CLIENT_TYPES;
void _clientTypesCoincidenConElFrontend;

export const loginSchema = z.object({
  email: z.email('Ingresa un correo electrónico válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

// Contraseña mínima de 6: coincide con minimum_password_length de supabase/config.toml.
export const TIPOS_DOCUMENTO = ['CC', 'CE', 'PASAPORTE', 'PEP'] as const;

/** Etiqueta de cada tipo; junto a la lista para que registro y perfil no diverjan. */
export const ETIQUETA_DOCUMENTO: Record<string, string> = {
  CC: 'Cédula de ciudadanía',
  CE: 'Cédula de extranjería',
  PASAPORTE: 'Pasaporte',
  PEP: 'Permiso especial de permanencia',
};

/** Unión por tipo de registro: a una persona no se le exige NIT ni a una empresa cédula. */
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
  /** Ubicación del diccionario; la ciudad se deriva en el servidor del código DIVIPOLA. */
  countryCode: z.string().trim().length(2, 'Selecciona el país'),
  departmentCode: z.string().trim().min(1, 'Selecciona el departamento'),
  municipalityCode: z.string().trim().min(1, 'Selecciona la ciudad'),
  neighborhoodId: z.string().uuid().nullable().optional(),
  address: z.string().trim().min(5, 'Ingresa la dirección'),
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
  /** Ubicación del diccionario; la ciudad se deriva en el servidor del código DIVIPOLA. */
  countryCode: z.string().trim().length(2, 'Selecciona el país'),
  departmentCode: z.string().trim().min(1, 'Selecciona el departamento'),
  municipalityCode: z.string().trim().min(1, 'Selecciona la ciudad'),
  neighborhoodId: z.string().uuid().nullable().optional(),
  address: z.string().trim().min(5, 'Ingresa la dirección'),
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
