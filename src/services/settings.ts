import { supabase } from '../lib/supabase';

/**
 * Configuración de la empresa (MÓDULO 41 / back-office).
 *
 * Los datos de la tienda son públicos: la factura POS los imprime y el pie
 * de página los muestra. La contraseña SMTP NO forma parte de este tipo:
 * la base revoca el SELECT sobre esa columna, así que nunca llega al
 * navegador ni por error.
 */
export interface AppSettings {
  companyName: string;
  companyLegalName: string | null;
  companyNit: string | null;
  companyAddress: string | null;
  companyCity: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  logoUrl: string | null;
  taxRegime: string | null;
  defaultTaxRate: number;
  invoicePrefix: string;
  invoiceFooter: string | null;
}

const CAMPOS =
  'company_name, company_legal_name, company_nit, company_address, company_city, ' +
  'company_phone, company_email, company_website, logo_url, tax_regime, ' +
  'default_tax_rate, invoice_prefix, invoice_footer';

let cache: Promise<AppSettings | null> | null = null;

export const settingsService = {
  /** Se cachea: la configuración cambia poquísimo y la piden varios componentes. */
  get(): Promise<AppSettings | null> {
    if (cache) return cache;
    cache = (async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select(CAMPOS)
        .eq('id', 1)
        .maybeSingle();
      {
        if (error || !data) {
          if (error) console.warn('[settings]', error.message);
          return null;
        }
        const d = data as unknown as Record<string, string | number | null>;
        return {
          companyName: String(d.company_name ?? 'Pintuco'),
          companyLegalName: (d.company_legal_name as string) ?? null,
          companyNit: (d.company_nit as string) ?? null,
          companyAddress: (d.company_address as string) ?? null,
          companyCity: (d.company_city as string) ?? null,
          companyPhone: (d.company_phone as string) ?? null,
          companyEmail: (d.company_email as string) ?? null,
          companyWebsite: (d.company_website as string) ?? null,
          logoUrl: (d.logo_url as string) ?? null,
          taxRegime: (d.tax_regime as string) ?? null,
          defaultTaxRate: Number(d.default_tax_rate ?? 19),
          invoicePrefix: String(d.invoice_prefix ?? 'POS'),
          invoiceFooter: (d.invoice_footer as string) ?? null,
        };
      }
    })();
    return cache;
  },

  invalidar(): void {
    cache = null;
  },
};
