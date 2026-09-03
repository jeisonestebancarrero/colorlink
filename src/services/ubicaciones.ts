import { supabase } from '../lib/supabase';

/**
 * Ubicaciones: país, departamento, municipio y barrio.
 *
 * Antes la ciudad era texto libre y la base ya tenía la consecuencia: perfiles
 * en 'Bogotá' y puntos de venta en 'Bogotá D.C.', que para cualquier consulta
 * son dos ciudades distintas. Ahora el cliente ELIGE y no escribe.
 *
 * Cobertura: los 33 departamentos y los 1.122 municipios del DANE, todo el
 * país, porque el despacho es nacional. Para el nivel de abajo hay 7.057
 * centros poblados oficiales del DANE más los barrios que publica cada
 * alcaldía; donde no hay lista, el barrio lo aporta el primer cliente y queda
 * disponible para los siguientes (ver `registrarBarrio`).
 *
 * Todo se lee sin sesión: el visitante tiene que poder elegir su ciudad para
 * cotizar antes de tener cuenta.
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
  /** BARRIO o CENTRO_POBLADO: se muestra distinto, un caserío no es un barrio. */
  kind: 'BARRIO' | 'CENTRO_POBLADO';
  /** DANE, ALCALDIA o CLIENTE. Sirve para saber qué revisar en el portal. */
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

  /**
   * Municipios de un departamento.
   *
   * Se pide por departamento y no de golpe: son 1.122 en total, y un
   * desplegable con 1.122 opciones no se puede usar. Antioquia sola tiene 125.
   */
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

  /** Un municipio por su código, con su departamento. Para mostrar lo guardado. */
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

  /**
   * Barrios y centros poblados de un municipio.
   *
   * Puede venir vacío, y eso es normal: no existe listado oficial de barrios
   * para todo Colombia. En ese caso el formulario deja escribirlo y
   * `registrarBarrio` lo incorpora.
   */
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

  /**
   * Fecha estimada de entrega a un municipio.
   *
   * La calcula el servidor con las mismas funciones que usa el pedido al
   * guardarse (`dias_de_entrega` + `sumar_dias_habiles`), así que lo que ve el
   * cliente antes de comprar es exactamente lo que va a quedar registrado.
   * Antes la tienda mostraba "24-48 horas" escrito a mano, igual para
   * Medellín que para Mitú.
   */
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
      _desde: new Date().toISOString().slice(0, 10),
      _dias: dias as number,
    });
    if (e2) {
      console.warn('[ubicaciones] sumar_dias_habiles:', e2.message);
      return null;
    }
    return { dias: dias as number, fecha: fecha as string };
  },

  /**
   * Incorpora un barrio que no está en la lista y devuelve su id.
   *
   * No es un INSERT: la función del servidor normaliza el nombre y, si ya
   * existe, devuelve el que hay. Así "El Poblado", "el poblado" y " EL
   * POBLADO " no se convierten en tres barrios distintos.
   */
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
