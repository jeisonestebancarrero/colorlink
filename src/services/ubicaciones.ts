import { supabase } from '../lib/supabase';
import { fechaLocal } from '../utils/fechaLocal';

/**
 * Ubicaciones del diccionario (DANE y alcaldías) en lugar de texto libre, para no
 * duplicar ciudades. Si no hay barrios, los aporta el cliente (`registrarBarrio`).
 * Todo se lee sin sesión para poder cotizar antes de tener cuenta.
 */

export interface Pais {
  code: string;
  name: string;
  phoneCode: string | null;
}

export interface Departamento {
  code: string;
  name: string;
}

export interface Municipio {
  code: string;
  name: string;
  departmentCode: string;
  departmentName: string;
}

export interface Barrio {
  id: string;
  name: string;
  /** Se muestra distinto: un centro poblado no es un barrio. */
  kind: 'BARRIO' | 'CENTRO_POBLADO';
  /** Origen del dato, para saber qué revisar en el portal. */
  source: 'DANE' | 'ALCALDIA' | 'CLIENTE';
}

function fallo(contexto: string, mensaje: string): Error {
  console.error(`[ubicaciones] ${contexto}:`, mensaje);
  return new Error('No fue posible cargar el listado de ubicaciones.');
}

export const ubicacionService = {
  async getPaises(): Promise<Pais[]> {
    const { data, error } = await supabase
      .from('countries')
      .select('code, name, phone_code')
      .eq('is_active', true)
      .order('name');
    if (error) throw fallo('getPaises', error.message);
    return ((data ?? []) as Array<{ code: string; name: string; phone_code: string | null }>)
      .map((p) => ({ code: p.code, name: p.name, phoneCode: p.phone_code }));
  },

  async getDepartamentos(): Promise<Departamento[]> {
    const { data, error } = await supabase
      .from('departments')
      .select('code, name')
      .order('name');
    if (error) throw fallo('getDepartamentos', error.message);
    return (data ?? []) as Departamento[];
  },

  /** Por departamento: un desplegable con los 1.122 municipios no se puede usar. */
  async getMunicipios(departmentCode: string): Promise<Municipio[]> {
    if (!departmentCode) return [];
    const { data, error } = await supabase
      .from('municipalities')
      .select('code, name, department_code, departments ( name )')
      .eq('department_code', departmentCode)
      .order('name');
    if (error) throw fallo('getMunicipios', error.message);
    return ((data ?? []) as unknown as Array<{
      code: string; name: string; department_code: string;
      departments: { name: string } | null;
    }>).map((m) => ({
      code: m.code,
      name: m.name,
      departmentCode: m.department_code,
      departmentName: m.departments?.name ?? '',
    }));
  },

  /** Municipio por código, con su departamento. */
  async getMunicipio(code: string): Promise<Municipio | null> {
    if (!code) return null;
    const { data, error } = await supabase
      .from('municipalities')
      .select('code, name, department_code, departments ( name )')
      .eq('code', code)
      .maybeSingle();
    if (error) throw fallo('getMunicipio', error.message);
    if (!data) return null;
    const m = data as unknown as {
      code: string; name: string; department_code: string;
      departments: { name: string } | null;
    };
    return {
      code: m.code, name: m.name,
      departmentCode: m.department_code,
      departmentName: m.departments?.name ?? '',
    };
  },

  /** Puede venir vacío (no hay listado nacional de barrios); el formulario deja escribirlo. */
  async getBarrios(municipalityCode: string): Promise<Barrio[]> {
    if (!municipalityCode) return [];
    const { data, error } = await supabase
      .from('neighborhoods')
      .select('id, name, kind, source')
      .eq('municipality_code', municipalityCode)
      .order('name');
    if (error) throw fallo('getBarrios', error.message);
    return (data ?? []) as Barrio[];
  },

  /** Misma lógica que el pedido (`dias_de_entrega` + `sumar_dias_habiles`), así la estimación coincide con lo registrado. */
  async estimarEntrega(
    municipalityCode: string
  ): Promise<{ dias: number; fecha: string } | null> {
    if (!municipalityCode) return null;

    const { data: dias, error } = await supabase.rpc('dias_de_entrega', {
      _municipality_code: municipalityCode,
    });
    if (error) {
      console.warn('[ubicaciones] estimarEntrega:', error.message);
      return null;
    }

    const { data: fecha, error: e2 } = await supabase.rpc('sumar_dias_habiles', {
      _desde: fechaLocal(),
      _dias: dias as number,
    });
    if (e2) {
      console.warn('[ubicaciones] sumar_dias_habiles:', e2.message);
      return null;
    }
    return { dias: dias as number, fecha: fecha as string };
  },

  /** La función normaliza el nombre y devuelve el existente si ya está, para no duplicar barrios. */
  async registrarBarrio(municipalityCode: string, nombre: string): Promise<string> {
    const { data, error } = await supabase.rpc('registrar_barrio', {
      _municipality_code: municipalityCode,
      _nombre: nombre,
    });
    if (error) {
      console.error('[ubicaciones] registrarBarrio:', error.message);
      throw new Error(
        /VALIDATION:/.test(error.message)
          ? error.message.replace(/^.*VALIDATION:\s*/, '')
          : 'No fue posible guardar el barrio. Inténtalo nuevamente.'
      );
    }
    return data as string;
  },
};
