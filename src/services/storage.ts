import {
  Project,
  User,
  NotificationItem,
  ProjectFormData,
  PreliminaryAnalysis,
  RecommendedProduct,
  TimelineStep,
  BudgetSummary,
  ConditionType,
} from '../types';
import {
  INITIAL_USER,
  INITIAL_PROJECTS,
  INITIAL_NOTIFICATIONS,
  INITIAL_TIMELINE_STEPS,
} from '../data/mockData';

const STORAGE_KEYS = {
  USER: 'colorlink_pintuco_user',
  PROJECTS: 'colorlink_pintuco_projects',
  NOTIFICATIONS: 'colorlink_pintuco_notifications',
  SESSION: 'colorlink_pintuco_session',
};

export const getStoredUser = (): User => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading stored user', e);
  }
  return INITIAL_USER;
};

export const setStoredUser = (user: User): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  } catch (e) {
    console.error('Error saving user', e);
  }
};

export const getStoredSession = (): boolean => {
  try {
    const session = localStorage.getItem(STORAGE_KEYS.SESSION);
    return session !== null ? session === 'true' : true;
  } catch {
    return true;
  }
};

export const setStoredSession = (isAuthenticated: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSION, String(isAuthenticated));
  } catch (e) {
    console.error('Error updating session', e);
  }
};

export const getStoredProjects = (): Project[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PROJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading projects', e);
  }
  return INITIAL_PROJECTS;
};

export const setStoredProjects = (projects: Project[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error('Error saving projects', e);
  }
};

export const getStoredNotifications = (): NotificationItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading notifications', e);
  }
  return INITIAL_NOTIFICATIONS;
};

export const setStoredNotifications = (notifications: NotificationItem[]): void => {
  try {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  } catch (e) {
    console.error('Error saving notifications', e);
  }
};

// Generador de análisis preliminar inteligente y cálculo de materiales basado en reglas técnicas de Pintuco
export function generatePreliminaryAnalysis(data: ProjectFormData): {
  analysis: PreliminaryAnalysis;
  recommendedProducts: RecommendedProduct[];
  budgetSummary: BudgetSummary;
  timeline: TimelineStep[];
} {
  const area = Number(data.areaM2) || 85;
  const isExterior = data.environment === 'Exterior' || data.environment === 'Alta humedad';
  const hasHumedad = data.conditions.includes('Humedad') || data.conditions.includes('Filtraciones');
  const hasFisuras = data.conditions.includes('Fisuras');
  const hasOxidacion = data.conditions.includes('Oxidación');
  const hasDesprendimiento = data.conditions.includes('Desprendimiento');
  const hasHongos = data.conditions.includes('Hongos / Moho');
  const isIndustrial = data.environment === 'Industrial' || data.projectType === 'Industria';

  let solutionCategory = 'Sistema de Pintura Arquitectónica Pintuco';
  let attentionLevel: 'Baja' | 'Media' | 'Alta' | 'Especializada' = 'Media';
  let requiresVisit = false;
  const keyConsiderations: string[] = [];
  const missingInfo: string[] = [];
  const products: RecommendedProduct[] = [];

  // 1. Industrial
  if (isIndustrial) {
    solutionCategory = 'Sistema Epóxico / Poliuretano Industrial de Alto Rendimiento';
    attentionLevel = 'Especializada';
    requiresVisit = true;
    keyConsiderations.push('Perfilado mecánico del sustrato para garantizar perfil de anclaje CSP 3.');
    keyConsiderations.push('Uso de esquema bicomponente de alta resistencia química y al desgaste.');
    missingInfo.push('Confirmar si hay derrames de químicos corrosivos o aceites en operación.');

    const primerUnits = Math.ceil(area / 16 / 5); // Cuñetes
    const finishUnits = Math.ceil((area * 2) / 14 / 5);

    products.push({
      id: `p-${Date.now()}-1`,
      code: 'PNT-20100',
      name: 'Primer Epóxico Imprimante Pintuco',
      category: 'Industrial',
      role: 'Sellador / Imprimación',
      description: 'Promotor de anclaje de alta adherencia para pisos y sustratos de exigencia mecánica.',
      surfaceSuitability: [data.surface],
      applicationMethod: 'Rodillo epóxico',
      theoreticalSpreadRate: '15-18 m²/galón a 1 mano',
      estimatedQuantity: `${primerUnits} Cuñete(s) (5 Gal)`,
      packagingOptions: ['Kit Galón', 'Kit Cuñete (5 Gal)'],
      unitPriceRef: 420000,
      calculatedTotalUnits: primerUnits,
      availability: 'Disponible',
      storeLocation: 'Centro de Pintura Pintuco Industrial',
      colorHex: '#94A3B8',
      colorName: 'Gris Primer',
      disclaimer: 'Sujeto a porosidad real del sustrato.',
    });

    products.push({
      id: `p-${Date.now()}-2`,
      code: 'PNT-20500',
      name: 'Esmalte Epóxico Alto Desempeño',
      category: 'Industrial',
      role: 'Recubrimiento Especializado',
      description: 'Acabado industrial para máxima resistencia a la abrasión y tráfico de montacargas.',
      surfaceSuitability: [data.surface],
      applicationMethod: 'Llana / Rodillo epóxico',
      theoreticalSpreadRate: '12-16 m²/galón a 2 manos',
      estimatedQuantity: `${finishUnits} Cuñete(s) (5 Gal)`,
      packagingOptions: ['Kit Galón', 'Kit Cuñete (5 Gal)'],
      unitPriceRef: 510000,
      calculatedTotalUnits: finishUnits,
      availability: 'Disponible',
      storeLocation: 'Centro de Pintura Pintuco Industrial',
      colorHex: '#475569',
      colorName: 'Gris Tráfico Industrial',
      disclaimer: 'Cálculo oficial en memoria técnica.',
    });
  } else if (data.surface === 'Metal' || hasOxidacion) {
    // 2. Metal
    solutionCategory = 'Sistema Anticorrosivo Integral y Esmalte Sintético Pintulux';
    attentionLevel = 'Alta';
    requiresVisit = area > 50;
    keyConsiderations.push('Eliminación total de óxido suelto mediante cepillo de alambre o lija grano 80.');
    keyConsiderations.push('Aplicación inmediata de Anticorrosivo antes de 4 horas post-limpieza.');

    const primerGals = Math.ceil(area / 28);
    const finishGals = Math.ceil((area * 2) / 25);

    products.push({
      id: `p-${Date.now()}-1`,
      code: 'PNT-10110',
      name: 'Anticorrosivo Cromato / Fosfato Pintuco',
      category: 'Metal',
      role: 'Sellador / Imprimación',
      description: 'Barrera química activa contra la corrosión por humedad y salinidad.',
      surfaceSuitability: ['Metal', 'Acero'],
      applicationMethod: 'Brocha o pistola convencional',
      theoreticalSpreadRate: '25-30 m²/galón a 1 mano',
      estimatedQuantity: `${primerGals} Galón(es)`,
      packagingOptions: ['1/4 Galón', '1 Galón'],
      unitPriceRef: 76500,
      calculatedTotalUnits: primerGals,
      availability: 'Disponible',
      storeLocation: 'Puntos de Venta Pintuco',
      colorHex: '#C2410C',
      colorName: 'Rojo Óxido / Gris',
      disclaimer: 'Rendimiento en perfil plano.',
    });

    products.push({
      id: `p-${Date.now()}-2`,
      code: 'PNT-10520',
      name: 'Esmalte Sintético Pintulux 3 en 1',
      category: 'Metal',
      role: 'Acabado Arquitectónico',
      description: 'Esmalte brillante de alta resistencia y retención de color a la intemperie.',
      surfaceSuitability: ['Metal', 'Hierro'],
      applicationMethod: 'Brocha o rodillo para esmalte',
      theoreticalSpreadRate: '20-25 m²/galón a 2 manos',
      estimatedQuantity: `${finishGals} Galón(es)`,
      packagingOptions: ['1/4 Galón', '1 Galón', 'Cuñete (5 Gal)'],
      unitPriceRef: 89900,
      calculatedTotalUnits: finishGals,
      availability: 'Disponible',
      storeLocation: 'Puntos de Venta Pintuco',
      colorHex: '#004F9F',
      colorName: 'Azul Pintuco / Carta Pintulux',
      disclaimer: 'Consumo orientativo.',
    });
  } else if (isExterior || data.surface === 'Fachada' || data.surface === 'Concreto') {
    // 3. Fachadas / Concreto exterior
    solutionCategory = 'Sistema Fachada Koraza Protección Extrema 5 Años';
    attentionLevel = hasHumedad || hasFisuras ? 'Alta' : 'Media';
    requiresVisit = hasHumedad || area > 80;
    keyConsiderations.push('Verificar secado superficial y ausencia de humedad retenida antes de pintar.');
    keyConsiderations.push('Aplicación indispensable de Sellador Antialcalino para evitar eflorescencias.');
    if (hasFisuras) {
      keyConsiderations.push('Calafateo elástico de fisuras con Masilla Elastomérica Pintuco.');
    }

    if (hasFisuras) {
      const masillaUnits = Math.max(1, Math.ceil(area / 45));
      products.push({
        id: `p-${Date.now()}-0`,
        code: 'PNT-10029',
        name: 'Masilla Elastomérica para Fisuras Pintuco',
        category: 'Preparación',
        role: 'Preparación de Superficie',
        description: 'Sellante elástico puenteador de microfisuras exteriores.',
        surfaceSuitability: [data.surface],
        applicationMethod: 'Espátula metálica',
        theoreticalSpreadRate: '12 m lineales/cartucho aprox.',
        estimatedQuantity: `${masillaUnits} Galón(es)`,
        packagingOptions: ['1 Galón', 'Cartucho 300ml'],
        unitPriceRef: 68900,
        calculatedTotalUnits: masillaUnits,
        availability: 'Disponible',
        storeLocation: `Centro de Pintura Pintuco ${data.city || 'Principal'}`,
        colorHex: '#E2E8F0',
        colorName: 'Gris Neutro',
        disclaimer: 'Cálculo de consumo a verificar en obra.',
      });
    }

    const sealerGals = Math.ceil(area / 28);
    products.push({
      id: `p-${Date.now()}-1`,
      code: 'PNT-10250',
      name: 'Sellador Antialcalino Acrílico Pintuco',
      category: 'Imprimación',
      role: 'Sellador / Imprimación',
      description: 'Bloqueador de sales y promotor de adherencia para mampostería.',
      surfaceSuitability: ['Concreto', 'Cemento', 'Fachadas'],
      applicationMethod: 'Rodillo de felpa',
      theoreticalSpreadRate: '25-30 m²/galón a 1 mano',
      estimatedQuantity: `${sealerGals} Galón(es) (para ${area} m²)`,
      packagingOptions: ['1 Galón', 'Cuñete (5 Gal)'],
      unitPriceRef: 82500,
      calculatedTotalUnits: sealerGals,
      availability: 'Disponible',
      storeLocation: `Centro de Pintura Pintuco ${data.city || 'Principal'}`,
      colorHex: '#F1F5F9',
      colorName: 'Blanco Translúcido',
      disclaimer: 'Rendimiento de referencia.',
    });

    const korazaCuñetes = Math.floor(area / 80);
    const korazaRemainingGals = Math.ceil((area % 80) / 20);
    const korazaQtyDesc = korazaCuñetes > 0 
      ? `${korazaCuñetes} Cuñete(s) + ${korazaRemainingGals > 0 ? `${korazaRemainingGals} Galón(es)` : ''}`
      : `${Math.ceil((area * 2) / 22)} Galón(es)`;

    products.push({
      id: `p-${Date.now()}-2`,
      code: 'PNT-10700',
      name: 'Koraza Protección Máxima 5 Años',
      category: 'Fachadas',
      role: 'Acabado Arquitectónico',
      description: 'Pintura 100% acrílica exterior hidrorrepelente, antihongos y autolimpiable.',
      surfaceSuitability: ['Fachadas', 'Concreto', 'Revoque'],
      applicationMethod: 'Rodillo o equipo Airless',
      theoreticalSpreadRate: '20-25 m²/galón a 2 manos',
      estimatedQuantity: `${korazaQtyDesc} (para ${area} m² a 2 manos)`,
      packagingOptions: ['1 Galón', 'Cuñete (5 Gal)'],
      unitPriceRef: korazaCuñetes > 0 ? 349900 : 89900,
      calculatedTotalUnits: korazaCuñetes > 0 ? korazaCuñetes : Math.ceil((area * 2) / 22),
      availability: 'Disponible',
      storeLocation: `Centro de Pintura Pintuco ${data.city || 'Principal'}`,
      colorHex: '#004F9F',
      colorName: 'Blanco Nieve / Carta Pintuco',
      disclaimer: 'Cantidad preliminar con margen técnico.',
    });
  } else {
    // 4. Interior estándar / drywall
    solutionCategory = 'Sistema Arquitectónico Interior Viniltex Avanzado Cero Olor';
    attentionLevel = 'Baja';
    keyConsiderations.push('Superficie en condición estándar apta para recubrimiento vinil-acrílico.');
    keyConsiderations.push('Asegurar limpieza de polvo y sellado homogéneo de juntas.');

    const viniltexCuñetes = Math.floor(area / 160);
    const viniltexGals = Math.ceil((area % 160) / 40);
    const qtyDesc = viniltexCuñetes > 0 
      ? `${viniltexCuñetes} Cuñete(s) + ${viniltexGals > 0 ? `${viniltexGals} Gal` : ''}`
      : `${Math.ceil((area * 2) / 42)} Galón(es)`;

    products.push({
      id: `p-${Date.now()}-1`,
      code: 'PNT-10010',
      name: 'Viniltex Avanzado Cero Olor Antibacterial',
      category: 'Interiores',
      role: 'Acabado Arquitectónico',
      description: 'Pintura interior tipo 1 de máxima lavabilidad con tecnología bio-protectora.',
      surfaceSuitability: ['Drywall', 'Estuco', 'Cemento'],
      applicationMethod: 'Rodillo antigota',
      theoreticalSpreadRate: '40-45 m²/galón a 2 manos',
      estimatedQuantity: `${qtyDesc} (para ${area} m² a 2 manos)`,
      packagingOptions: ['1/4 Galón', '1 Galón', 'Cuñete (5 Gal)'],
      unitPriceRef: viniltexCuñetes > 0 ? 195000 : 54900,
      calculatedTotalUnits: viniltexCuñetes > 0 ? viniltexCuñetes : Math.ceil((area * 2) / 42),
      availability: 'Disponible',
      storeLocation: `Centro de Pintura Pintuco ${data.city || 'Principal'}`,
      colorHex: '#F8FAFC',
      colorName: 'Blanco Puro',
      disclaimer: 'Consumo orientativo para 2 manos.',
    });
  }

  if (hasHongos) {
    keyConsiderations.push('Lavado fungicida previo con solución de hipoclorito de sodio al 10% y enjuague total.');
  }

  if (hasDesprendimiento) {
    keyConsiderations.push('Raspado minucioso de pintura suelta hasta encontrar sustrato firme y cohesionado.');
  }

  if (data.photos.length === 0) {
    missingInfo.push('No se adjuntaron fotografías; se recomienda cargar fotos panorámicas y de detalle para afinar el diagnóstico.');
  }

  const aiSummary = `Identificamos una superficie de ${data.surface} (${data.environment}) de ${area} m² en ${data.city}. Condiciones detectadas: ${data.conditions.join(', ')}. Recomendamos el sistema oficial Pintuco ${solutionCategory}.`;

  const technicalSummary = `Análisis de compatibilidad técnica para sustrato ${data.surface} en ambiente ${data.environment}. Nivel de atención: ${attentionLevel}. Protocolo de preparación conforme a normas técnicas de aplicación Pintuco.`;

  // Build budget items
  const budgetItems = products.map((p, idx) => {
    const qty = p.calculatedTotalUnits || 1;
    const price = p.unitPriceRef || 75000;
    return {
      id: `b-item-${idx}`,
      productName: p.name,
      role: p.role,
      presentation: p.packagingOptions?.[0] || 'Unidad estándar',
      quantity: qty,
      unitPriceRef: price,
      subtotal: qty * price,
      availability: p.availability || 'Disponible',
    };
  });

  const materialsSubtotal = budgetItems.reduce((acc, curr) => acc + curr.subtotal, 0);

  const budgetSummary: BudgetSummary = {
    items: budgetItems,
    materialsSubtotal,
    technicalServiceFee: 0,
    estimatedTotal: materialsSubtotal,
    currency: 'COP',
    disclaimer: 'Valores demostrativos referenciales. La cotización oficial definitiva se valida a través de los canales comerciales de Pintuco.',
  };

  const timeline: TimelineStep[] = [
    {
      id: 1,
      stepNumber: 1,
      title: 'Necesidad registrada',
      description: 'Proyecto registrado en ColorLink con parámetros de área, sustrato y fotos.',
      status: 'completed',
      date: new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      responsible: 'Cliente (Portal Digital)',
    },
    {
      id: 2,
      stepNumber: 2,
      title: 'Diagnóstico preliminar',
      description: 'Clasificación de patologías y estimación técnica preliminar completada.',
      status: 'completed',
      date: new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      responsible: 'Motor de Diagnóstico ColorLink',
    },
    {
      id: 3,
      stepNumber: 3,
      title: 'Análisis técnico en curso',
      description: 'Revisión por especialista técnico de Pintuco para validar compatibilidad.',
      status: 'current',
      responsible: 'Departamento Técnico Pintuco',
    },
    {
      id: 4,
      stepNumber: 4,
      title: 'Solución y sistema recomendado',
      description: 'Especificación de productos, esquema de manos y preparación de obra.',
      status: 'upcoming',
      responsible: 'Especificación Técnica Pintuco',
    },
    {
      id: 5,
      stepNumber: 5,
      title: 'Materiales & Disponibilidad',
      description: 'Cálculo de volumen y verificación de stock con distribuidor autorizado.',
      status: 'upcoming',
      responsible: 'Canal Comercial Pintuco',
    },
    {
      id: 6,
      stepNumber: 6,
      title: 'Acompañamiento técnico en obra',
      description: 'Visita de asesoría técnica y verificación de aplicación en terreno.',
      status: 'upcoming',
      responsible: 'Servicio Técnico en Campo',
    },
    {
      id: 7,
      stepNumber: 7,
      title: 'Garantía y finalización',
      description: 'Certificado de garantía de recubrimiento Pintuco emitido.',
      status: 'upcoming',
      responsible: 'Calidad & Satisfacción Pintuco',
    },
  ];

  return {
    analysis: {
      solutionCategory,
      detectedConditions: data.conditions,
      attentionLevel,
      requiresTechnicalVisit: requiresVisit,
      keyConsiderations,
      missingInformation: missingInfo,
      aiSummary,
      technicalSummary,
      disclaimer: 'Estimación preliminar y recomendaciones orientativas de ColorLink. Pendiente de validación técnica oficial por el departamento técnico de Pintuco.',
    },
    recommendedProducts: products,
    budgetSummary,
    timeline,
  };
}
