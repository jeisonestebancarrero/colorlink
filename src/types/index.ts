export type ClientType =
  | 'Particular'
  | 'Constructor'
  | 'Empresa'
  | 'Profesional'
  | 'Distribuidor';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  clientType: ClientType;
  company: string;
  email: string;
  phone: string;
  city: string;
  createdAt: string;
  avatar?: string;
}

export type ProjectStatus =
  | 'pending'        // Pendiente (Amarillo)
  | 'analyzing'      // En análisis (Azul)
  | 'in_progress'    // En proceso (Morado)
  | 'completed'      // Completado (Verde)
  | 'requires_info'; // Requiere información (Rojo)

export type ProjectType =
  | 'Vivienda'
  | 'Edificio residencial'
  | 'Edificio comercial'
  | 'Industria'
  | 'Infraestructura'
  | 'Mantenimiento'
  | 'Otro';

export type SurfaceType =
  | 'Concreto'
  | 'Cemento'
  | 'Metal'
  | 'Madera'
  | 'Fachada'
  | 'Drywall'
  | 'Otra';

export type EnvironmentType =
  | 'Interior'
  | 'Exterior'
  | 'Industrial'
  | 'Alta humedad'
  | 'Otro';

export type ConditionType =
  | 'Buen estado'
  | 'Humedad'
  | 'Fisuras'
  | 'Desprendimiento'
  | 'Oxidación'
  | 'Desgaste'
  | 'Hongos / Moho'
  | 'Alcalinidad'
  | 'Filtraciones'
  | 'Manchas'
  | 'Otro';

export interface ProjectPhoto {
  id: string;
  url: string;
  name: string;
  size: string;
  uploadDate: string;
  isPrimary?: boolean;
}

export interface TimelineStep {
  id: number;
  stepNumber: number;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'upcoming';
  date?: string;
  responsible?: string;
}

export interface PreliminaryAnalysis {
  solutionCategory: string;
  detectedConditions: ConditionType[];
  attentionLevel: 'Baja' | 'Media' | 'Alta' | 'Especializada';
  requiresTechnicalVisit: boolean;
  keyConsiderations: string[];
  missingInformation: string[];
  aiSummary: string;
  technicalSummary?: string;
  disclaimer: string;
}

export type AvailabilityStatus =
  | 'Disponible'
  | 'Disponible parcial'
  | 'Bajo pedido (24-48h)'
  | 'Consultar inventario';

export interface RecommendedProduct {
  id: string;
  code: string;
  name: string;
  category: string;
  role: 'Preparación de Superficie' | 'Sellador / Imprimación' | 'Acabado Arquitectónico' | 'Recubrimiento Especializado' | 'Herramienta / Complemento';
  description: string;
  surfaceSuitability: string[];
  applicationMethod: string;
  theoreticalSpreadRate: string; // ej. "20-25 m²/galón a 2 manos"
  estimatedQuantity?: string;    // ej. "3 Galones (o 1 Cuñete de 5 gal)"
  packagingOptions?: string[];   // ej. ["1/4 Galón", "1 Galón", "Cuñete (5 Gal)"]
  unitPriceRef?: number;         // en COP (demostrativo)
  calculatedTotalUnits?: number; // cantidad sugerida de unidades
  availability?: AvailabilityStatus;
  storeLocation?: string;        // ej. "Centro de Pintura Pintuco Medellín"
  colorHex?: string;             // Muestra cromática representativa
  colorName?: string;            // ej. "Blanco Nieve (PNT-001)"
  techSheetUrl?: string;
  disclaimer: string;
}

export interface BudgetEstimateItem {
  id: string;
  productName: string;
  role: string;
  presentation: string;
  quantity: number;
  unitPriceRef: number;
  subtotal: number;
  availability: AvailabilityStatus;
}

export interface BudgetSummary {
  items: BudgetEstimateItem[];
  materialsSubtotal: number;
  technicalServiceFee: number; // Siempre 0 (incluido por Pintuco)
  estimatedTotal: number;
  currency: string;
  disclaimer: string;
}

export interface TechnicalService {
  requested: boolean;
  status: 'none' | 'solicitado' | 'programado' | 'en_visita' | 'informe_emitido';
  requestedAt?: string;
  scheduledDate?: string;
  specialistName?: string;
  specialistTitle?: string;
  notes?: string;
  contactPhone?: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  city: string;
  projectType: ProjectType;
  areaM2: number;
  requiredDate: string;
  description: string;
  surface: SurfaceType;
  environment: EnvironmentType;
  currentColor?: string;
  selectedColor?: {
    name: string;
    code: string;
    hex: string;
    family: string;
  };
  conditions: ConditionType[];
  customCondition?: string;
  photos: ProjectPhoto[];
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  currentStepProgress?: number; // 1 to 8 customer journey
  nextRecommendedAction?: {
    title: string;
    description: string;
    actionLabel: string;
    actionType: 'validate_solution' | 'request_tech' | 'add_photos' | 'view_budget' | 'order_materials';
  };
  preliminaryAnalysis: PreliminaryAnalysis;
  recommendedProducts: RecommendedProduct[];
  budgetSummary?: BudgetSummary;
  timeline: TimelineStep[];
  technicalService: TechnicalService;
  clientNotes?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  projectId?: string;
  projectName?: string;
  actionRequired?: boolean;
  actionLabel?: string;
  type: 'info' | 'alert' | 'success' | 'update';
}

export type SolutionCategory =
  | 'Fachadas'
  | 'Interiores'
  | 'Impermeabilización'
  | 'Metal'
  | 'Madera'
  | 'Industrial'
  | 'Mantenimiento';

export interface SolutionCatalogItem {
  id: string;
  name: string;
  category: SolutionCategory;
  description: string;
  application: string;
  surface: string;
  features: string[];
  image: string;
  badge?: string;
  systemSummary: string;
  durabilityEstimate?: string;
  colorSwatches?: Array<{ name: string; hex: string }>;
  stepByStepGuide?: string[];
  spreadRateInfo?: string;
  packagings?: string[];
}

export interface ProjectFormData {
  // Step 1: Necesidad e Información
  name: string;
  city: string;
  projectType: ProjectType;
  areaM2: number | '';
  requiredDate: string;
  description: string;
  // Step 2: Superficie
  surface: SurfaceType;
  customSurface?: string;
  environment: EnvironmentType;
  currentColor?: string;
  // Step 3: Condición / Patología
  conditions: ConditionType[];
  customCondition?: string;
  // Step 4: Fotografías & Resumen
  photos: ProjectPhoto[];
}

export interface StoreProductPresentation {
  id: string;
  label: string; // "1/4 Galón", "1 Galón", "Cuñete (5 Gal)", "Tambor (55 Gal)"
  priceCOP: number;
  volumeLiters?: number;
  stockStatus: 'InStock' | 'LowStock' | 'PreOrder';
}

export interface StoreProduct {
  id: string;
  code: string;
  name: string;
  brand: 'Pintuco';
  tagline: string;
  category: 'Vinilos & Interiores' | 'Fachadas & Exteriores' | 'Impermeabilizantes' | 'Esmaltes & Metales' | 'Maderas & Barnices' | 'Industriales & Epóxicos' | 'Herramientas & Complementos';
  rating: number;
  reviewsCount: number;
  description: string;
  features: string[];
  image: string;
  surface: string[];
  environment: 'Interior' | 'Exterior' | 'Ambos' | 'Industrial';
  finish: 'Mate' | 'Satinado' | 'Brillante' | 'Semibrillante' | 'Texturizado' | 'N/A';
  coverage: string;
  spreadRateM2PerGal: number;
  dryingTime: string;
  isPopular?: boolean;
  badge?: string;
  availableColors?: Array<{ name: string; code: string; hex: string; family: string }>;
  presentations: StoreProductPresentation[];
  techSheetUrl?: string;
}

export interface CartItem {
  id: string;
  productId: string;
  productName: string;
  category: string;
  presentation: string;
  colorName?: string;
  colorCode?: string;
  colorHex?: string;
  unitPrice: number;
  quantity: number;
  image: string;
  isKitItem?: boolean;
  kitName?: string;
}

export interface SolutionKitStep {
  stepNumber: number;
  phaseName: 'Preparación' | 'Sellado' | 'Acabado' | 'Aplicación' | 'Herramienta';
  productName: string;
  productId: string;
  presentation: string;
  quantityFor85m2: number;
  unitPriceCOP: number;
  roleDescription: string;
  image: string;
}

export interface SolutionKit {
  id: string;
  name: string;
  subtitle: string;
  problemTarget: string;
  idealFor: string;
  category: string;
  image: string;
  warranty: string;
  discountPercent: number;
  steps: SolutionKitStep[];
  toolsIncluded: string[];
}

export interface PintucoStore {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  hours: string;
  hasColorStudio: boolean;
  hasTechAdvisor: boolean;
  hasExpressPickup: boolean;
  stockReadinessHours: number;
}

export interface ColorSwatch {
  code: string;
  name: string;
  hex: string;
  family: 'Blancos & Neutros' | 'Cálidos & Tierras' | 'Azules & Frescos' | 'Verdes & Naturales' | 'Vibrantes & Acentos' | 'Tendencias 2025';
  rgb: string;
  recommendedProduct: string;
  description: string;
}
