import { describe, it, expect } from 'vitest';
import {
  aColorSwatch,
  aPintucoStore,
  aSolutionKit,
  aStoreProduct,
  hexARgb,
  type ColorRow,
  type ProductRow,
  type SolutionRow,
  type SolutionProductRow,
} from './catalogMappers';
import { formatearFecha, signoMovimiento } from './backoffice';
import { FONDO_MARCA, imagenPunto, tieneFoto } from '../assets/puntosVenta';

/**
 * Pruebas unitarias de los traductores de datos — FASE 4.
 *
 * No tocan la red: comprueban que una fila de Postgres se convierte en un
 * objeto con la forma EXACTA que el JSX existente espera. Es la garantía de
 * que cambiar el origen de datos no rompe ninguna página.
 */

const disponibilidad = new Map<string, 'InStock' | 'LowStock' | 'PreOrder'>([
  ['var-1', 'InStock'],
]);

describe('hexARgb', () => {
  it('deriva el rgb desde el hex', () => {
    expect(hexARgb('#94A3B8')).toBe('148, 163, 184');
    expect(hexARgb('#FFFFFF')).toBe('255, 255, 255');
    expect(hexARgb('#000000')).toBe('0, 0, 0');
  });
});

describe('aColorSwatch', () => {
  const base: ColorRow = {
    code: 'PNT-101',
    name: 'Blanco Nieve',
    hex: '#F8FAFC',
    rgb: '248, 250, 252',
    family: 'Blancos & Neutros',
    recommended_product: 'Koraza 5 Años Fachadas',
    description: 'Blanco sutilmente frío.',
  };

  it('conserva todos los campos', () => {
    expect(aColorSwatch(base)).toEqual({
      code: 'PNT-101',
      name: 'Blanco Nieve',
      hex: '#F8FAFC',
      family: 'Blancos & Neutros',
      rgb: '248, 250, 252',
      recommendedProduct: 'Koraza 5 Años Fachadas',
      description: 'Blanco sutilmente frío.',
    });
  });

  it('calcula el rgb si la fila no lo trae, en vez de dejarlo vacío', () => {
    expect(aColorSwatch({ ...base, rgb: null }).rgb).toBe('248, 250, 252');
  });

  it('nunca devuelve undefined en campos obligatorios del tipo', () => {
    const c = aColorSwatch({ ...base, recommended_product: null, description: null });
    expect(c.recommendedProduct).toBe('');
    expect(c.description).toBe('');
  });
});

describe('aStoreProduct', () => {
  const fila: ProductRow = {
    id: 'uuid-producto',
    external_ref: 'prod-koraza-5',
    code: 'PNT-EXT-001',
    name: 'Koraza 5 Años Protección Total',
    tagline: 'Pintura elastomérica exterior',
    description: 'Pintura para exteriores 100% acrílica.',
    environment: 'Exterior',
    finish: 'Mate',
    coverage: '20 a 25 m²/galón',
    spread_rate_m2_per_gal: '22.00',
    drying_time: 'Al tacto: 1 hora',
    features: ['Garantía 5 años'],
    image_url: 'https://ejemplo/koraza.jpg',
    tech_sheet_url: 'https://ejemplo/ficha.pdf',
    rating: '4.9',
    reviews_count: 142,
    is_popular: true,
    badge: 'Más Vendido',
    categories: { name: 'Fachadas & Exteriores' },
    product_variants: [
      { id: 'var-2', label: 'Cuñete 5 Galones (18.9 L)', price_cop: '629900.00', volume_liters: '18.900', sort_order: 1 },
      { id: 'var-1', label: '1 Galón (3.785 L)', price_cop: '142900.00', volume_liters: '3.785', sort_order: 0 },
    ],
    product_colors: [
      { sort_order: 1, colors: { code: 'PNT-105', name: 'Gris Nevado', hex: '#E2E8F0', rgb: null, family: 'Blancos & Neutros', recommended_product: null, description: null } },
      { sort_order: 0, colors: { code: 'PNT-101', name: 'Blanco Nieve', hex: '#F8FAFC', rgb: null, family: 'Blancos & Neutros', recommended_product: null, description: null } },
    ],
    product_surfaces: [{ surfaces: { name: 'Concreto' } }, { surfaces: null }],
  };

  it('usa external_ref como id para no romper referencias existentes', () => {
    // PaintCalculatorPage arranca con 'prod-koraza-5' escrito a mano y los
    // pasos de los kits apuntan a estos mismos identificadores.
    expect(aStoreProduct(fila, disponibilidad).id).toBe('prod-koraza-5');
  });

  it('convierte los numéricos que PostgREST envía como texto', () => {
    const p = aStoreProduct(fila, disponibilidad);
    expect(p.rating).toBe(4.9);
    expect(p.spreadRateM2PerGal).toBe(22);
    expect(p.presentations[0].priceCOP).toBe(142900);
    expect(typeof p.presentations[0].priceCOP).toBe('number');
  });

  it('ordena variantes y colores por sort_order', () => {
    const p = aStoreProduct(fila, disponibilidad);
    expect(p.presentations.map((v) => v.label)).toEqual([
      '1 Galón (3.785 L)',
      'Cuñete 5 Galones (18.9 L)',
    ]);
    expect(p.availableColors?.map((c) => c.code)).toEqual(['PNT-101', 'PNT-105']);
  });

  it('toma la disponibilidad del inventario, no del producto', () => {
    const p = aStoreProduct(fila, disponibilidad);
    expect(p.presentations.find((v) => v.label.startsWith('1 Galón'))?.stockStatus).toBe('InStock');
    // Sin dato de inventario se asume bajo pedido, nunca "hay existencias".
    expect(p.presentations.find((v) => v.label.startsWith('Cuñete'))?.stockStatus).toBe('PreOrder');
  });

  it('descarta superficies nulas del join', () => {
    expect(aStoreProduct(fila, disponibilidad).surface).toEqual(['Concreto']);
  });

  it('proyecta el rendimiento nulo de una herramienta como 0', () => {
    const herramienta = { ...fila, spread_rate_m2_per_gal: null };
    expect(aStoreProduct(herramienta, disponibilidad).spreadRateM2PerGal).toBe(0);
  });
});

describe('aSolutionKit', () => {
  const fila = {
    id: 'uuid-kit',
    external_ref: 'kit-fachada-5anos',
    name: 'Kit Fachada 5 Años',
    description: null,
    image_url: 'https://ejemplo/kit.jpg',
    badge: null,
    application: null,
    surface_summary: null,
    features: null,
    system_summary: null,
    durability_estimate: null,
    spread_rate_info: null,
    packagings: null,
    step_by_step_guide: null,
    color_swatches: null,
    subtitle: 'El sistema completo',
    problem_target: 'Fachada con microfisuras',
    ideal_for: 'Edificios residenciales',
    warranty: 'Garantía Pintuco 5 Años',
    discount_percent: '12.00',
    tools_included: ['Rodillo'],
    categories: { name: 'Fachadas & Exteriores' },
    solution_products: [
      {
        step_number: 2,
        phase: 'Sellado' as const,
        role_description: 'Fijar el sustrato',
        quantity_for_85m2: '1.00',
        image_url: 'https://ejemplo/sellador.jpg',
        presentation_label: 'Cuñete 5 Galones (18.9 L)',
        unit_price_cop: '389000.00',
        products: { external_ref: 'prod-sellador-antialcalino', name: 'Sellador Antialcalino' },
        product_variants: { price_cop: '389000.00' },
      },
      {
        step_number: 1,
        phase: 'Preparación' as const,
        role_description: 'Sellar grietas',
        quantity_for_85m2: '1.00',
        image_url: 'https://ejemplo/masilla.jpg',
        presentation_label: '1 Galón (4.5 Kg)',
        unit_price_cop: '68900.00',
        products: { external_ref: 'prod-masilla-elastomerica', name: 'Masilla Elastomérica' },
        product_variants: { price_cop: '68900.00' },
      },
    ],
  } as unknown as SolutionRow;

  it('ordena los pasos por número', () => {
    expect(aSolutionKit(fila).steps.map((s) => s.stepNumber)).toEqual([1, 2]);
  });

  it('toma el precio de la variante real, no de una copia en el paso', () => {
    const kit = aSolutionKit(fila);
    expect(kit.steps[0].unitPriceCOP).toBe(68900);
    expect(kit.steps[1].unitPriceCOP).toBe(389000);
  });

  it('expone productId como external_ref para que el carrito lo reconozca', () => {
    expect(aSolutionKit(fila).steps[0].productId).toBe('prod-masilla-elastomerica');
  });

  it('usa el precio publicado del kit cuando el paso no resuelve variante', () => {
    // 6 de los 11 pasos reales citan etiquetas que no existen como variante
    // ("Pack Completo Obra", "2 Cuñetes de 5 Galones"...). En ese caso el
    // precio NO puede quedar en 0.
    const pasos = fila.solution_products as SolutionProductRow[];
    const sinVariante: SolutionRow = {
      ...fila,
      solution_products: [{ ...pasos[1], product_variants: null }],
    };
    expect(aSolutionKit(sinVariante).steps[0].unitPriceCOP).toBe(68900);
  });

  it('convierte el descuento a número', () => {
    expect(aSolutionKit(fila).discountPercent).toBe(12);
  });
});

describe('aPintucoStore', () => {
  it('mapea un punto de retiro conservando su identificador externo', () => {
    const s = aPintucoStore({
      id: 'uuid-tienda',
      external_ref: 'store-med-poblado',
      name: 'Centro de Pinturas Pintuco - El Poblado',
      city: 'Medellín',
      address: 'Cra 43A # 18 Sur - 135',
      phone: '+57 (604) 444-2424',
      hours: 'Lun - Vie: 7:30 AM - 6:00 PM',
      has_color_studio: true,
      has_tech_advisor: true,
      has_express_pickup: true,
      stock_readiness_hours: 2,
    });
    expect(s.id).toBe('store-med-poblado');
    expect(s.hasColorStudio).toBe(true);
    expect(s.stockReadinessHours).toBe(2);
  });
});

// ============================================================
// Fechas sin hora
// ============================================================
describe('formatearFecha', () => {
  it('no adelanta ni retrasa un día una fecha sin hora', () => {
    // Una columna `date` llega como 'YYYY-MM-DD'. Interpretada como
    // medianoche UTC y pintada en horario de Colombia (UTC-5), retrocedía un
    // día: la visita del 15 se anunciaba para el 14, y a esa obra el técnico
    // llega el día equivocado.
    expect(formatearFecha('2026-09-15', { day: 'numeric', month: 'numeric', year: 'numeric' }))
      .toBe('15/9/2026');
    expect(formatearFecha('2026-01-01', { day: 'numeric', month: 'numeric', year: 'numeric' }))
      .toBe('1/1/2026');
  });

  it('respeta una marca de tiempo completa', () => {
    const conHora = formatearFecha('2026-09-15T18:30:00Z', {
      day: 'numeric', month: 'numeric', year: 'numeric',
    });
    expect(conHora).toBe('15/9/2026');
  });

  it('devuelve un guion cuando no hay fecha', () => {
    expect(formatearFecha(null)).toBe('—');
    expect(formatearFecha('')).toBe('—');
    expect(formatearFecha('no es una fecha')).toBe('—');
  });
});

// ============================================================
// Dirección de un movimiento de inventario
// ============================================================
describe('signoMovimiento', () => {
  it('las salidas restan aunque la cantidad se guarde en positivo', () => {
    // `quantity` guarda siempre una magnitud positiva y la dirección vive en
    // el tipo. Leer el signo del número mostraba «+5» para una salida de
    // traslado: en un libro de inventario eso es leer al revés lo ocurrido.
    expect(signoMovimiento('SALIDA')).toBe(-1);
    expect(signoMovimiento('TRASLADO_SALIDA')).toBe(-1);
    expect(signoMovimiento('RESERVA')).toBe(-1);
  });

  it('las entradas suman', () => {
    expect(signoMovimiento('ENTRADA')).toBe(1);
    expect(signoMovimiento('TRASLADO_ENTRADA')).toBe(1);
    expect(signoMovimiento('LIBERACION')).toBe(1);
  });

  it('el ajuste por conteo no tiene dirección: fija el saldo', () => {
    expect(signoMovimiento('AJUSTE')).toBe(0);
  });
});

// ============================================================
// Imágenes de los puntos de venta
// ============================================================
describe('imagenPunto', () => {
  it('usa la foto que Pintuco haya cargado, por encima de todo', () => {
    const r = imagenPunto('store-med-poblado', 'https://cdn.pintuco.co/tienda.jpg');
    expect(r.src).toBe('https://cdn.pintuco.co/tienda.jpg');
    expect(r.esFoto).toBe(true);
  });

  it('cae a la imagen local cuando no hay foto cargada', () => {
    const r = imagenPunto('store-med-poblado', null);
    expect(r.src).not.toBe(FONDO_MARCA);
    expect(r.esFoto).toBe(true);
  });

  it('una tienda sin imagen propia usa el fondo de marca, no un hueco', () => {
    // Devolver cadena vacía dejaría en la tarjeta el icono de imagen rota del
    // navegador, que es lo peor que puede pasarle a una vitrina.
    const r = imagenPunto('store-inexistente-todavia', null);
    expect(r.src).toBe(FONDO_MARCA);
    expect(r.esFoto).toBe(false);
  });

  it('las siete tiendas de la semilla tienen imagen propia', () => {
    for (const ref of [
      'store-barranquilla-prado', 'store-bog-74', 'store-bog-norte',
      'store-med-poblado', 'store-bucaramanga-cabecera', 'store-cali-pasoancho',
      'store-med-guayabal',
    ]) {
      expect(tieneFoto(ref), `falta imagen de ${ref}`).toBe(true);
    }
  });

  it('una referencia desconocida o vacía tampoco rompe la tarjeta', () => {
    expect(imagenPunto('store-que-no-existe').src).toBe(FONDO_MARCA);
    expect(imagenPunto(null).src).toBe(FONDO_MARCA);
    expect(imagenPunto(undefined, '   ').src).toBe(FONDO_MARCA);
  });

  it('tieneFoto distingue las tiendas con imagen propia', () => {
    expect(tieneFoto('store-bog-74')).toBe(true);
    expect(tieneFoto('store-nuevo-sin-foto')).toBe(false);
    expect(tieneFoto('store-nuevo-sin-foto', 'https://cdn.pintuco.co/nueva.jpg')).toBe(true);
  });
});

// ============================================================
// Campos numéricos en un formulario
// ============================================================
describe('conversión de coordenadas escritas a mano', () => {
  /**
   * Reproduce lo que hacía el formulario de puntos de venta cuando convertía
   * a número en cada pulsación. Se deja como prueba porque es un error fácil
   * de reintroducir y sus síntomas —una latitud de 46626, una longitud
   * «NaN»— no parecen un problema de tipos sino de la base de datos.
   */
  const comoAntes = (texto: string): string => {
    const n = texto === '' ? null : Number(texto);
    return n === null ? '' : String(n);
  };

  it('convertir en cada tecla destruye lo que la persona escribe', () => {
    expect(comoAntes('4.')).toBe('4');      // se pierde el punto
    expect(comoAntes('-')).toBe('NaN');     // no se puede empezar un negativo
    expect(comoAntes('4.60')).toBe('4.6');  // se pierde el cero final
  });

  it('guardar el texto tal cual y convertir al final sí funciona', () => {
    const alGuardar = (texto: string) => (texto.trim() === '' ? null : Number(texto));
    expect(alGuardar('4.6626')).toBeCloseTo(4.6626, 4);
    expect(alGuardar('-74.0567')).toBeCloseTo(-74.0567, 4);
    expect(alGuardar('')).toBeNull();
    expect(Number.isNaN(alGuardar('-') as number)).toBe(true); // se detecta y se avisa
  });
});
