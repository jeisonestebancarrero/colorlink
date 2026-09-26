import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ColorSwatch,
  PintucoStore,
  SolutionCatalogItem,
  SolutionKit,
  StoreProduct,
} from '../types';
import { colorService, productService, solutionService, storeService } from '../services/catalog';
import { obtenerTarifaIva, TARIFA_IVA_POR_DEFECTO } from '../services/impuestos';

/**
 * Hooks de catálogo con useState/useEffect, sin librería de estado servidor.
 * Se carga el catálogo completo y se filtra en cliente para que la búsqueda sea
 * instantánea; los servicios ya admiten filtro y paginación en servidor si crece.
 */

export interface AsyncState<T> {
  data: T;
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

function useAsyncData<T>(cargar: () => Promise<T>, inicial: T): AsyncState<T> {
  const [data, setData] = useState<T>(inicial);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  // En ref para que cambiar la función no dispare recargas.
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;

  useEffect(() => {
    let vigente = true;
    setIsLoading(true);
    setError(null);

    cargarRef
      .current()
      .then((resultado) => {
        if (vigente) setData(resultado);
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        setError(e instanceof Error ? e.message : 'No fue posible cargar la información.');
      })
      .finally(() => {
        if (vigente) setIsLoading(false);
      });

    // Evita actualizar estado tras desmontar y descarta respuestas obsoletas.
    return () => {
      vigente = false;
    };
  }, [intento]);

  const reload = useCallback(() => setIntento((n) => n + 1), []);

  return { data, isLoading, error, reload };
}

const SIN_PRODUCTOS: StoreProduct[] = [];
const SIN_COLORES: ColorSwatch[] = [];
const SIN_KITS: SolutionKit[] = [];
const SIN_SOLUCIONES: SolutionCatalogItem[] = [];
const SIN_TIENDAS: PintucoStore[] = [];
const SIN_CATEGORIAS: string[] = [];

export const useProducts = (): AsyncState<StoreProduct[]> =>
  useAsyncData(() => productService.getProducts(), SIN_PRODUCTOS);

export const useColorPalette = (): AsyncState<ColorSwatch[]> =>
  useAsyncData(() => colorService.getPalette(), SIN_COLORES);

export const useSolutionKits = (): AsyncState<SolutionKit[]> =>
  useAsyncData(() => solutionService.getKits(), SIN_KITS);

export const useSolutionsCatalog = (): AsyncState<SolutionCatalogItem[]> =>
  useAsyncData(() => solutionService.getCatalog(), SIN_SOLUCIONES);

/** Categorías leídas de la base, para que las creadas en el portal aparezcan en la tienda. */
export const useProductCategories = (): AsyncState<string[]> =>
  useAsyncData(() => productService.getCategories(), SIN_CATEGORIAS);

export const usePickupStores = (): AsyncState<PintucoStore[]> =>
  useAsyncData(() => storeService.getStores(), SIN_TIENDAS);

/** Tarifa general de IVA; arranca en el valor por defecto para no mostrar un IVA de cero mientras carga. */
export const useTarifaIva = (): AsyncState<number> =>
  useAsyncData(() => obtenerTarifaIva(), TARIFA_IVA_POR_DEFECTO);
