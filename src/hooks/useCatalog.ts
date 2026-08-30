import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ColorSwatch,
  PintucoStore,
  SolutionCatalogItem,
  SolutionKit,
  StoreProduct,
} from '../types';
import { colorService, productService, solutionService, storeService } from '../services/catalog';

/**
 * Hooks de catálogo (MÓDULO 36/37).
 *
 * Se implementan con `useState` + `useEffect` en lugar de introducir React
 * Query o Zustand: el proyecto no usa ninguna librería de estado servidor y
 * el MÓDULO 36 pide reutilizar la arquitectura existente.
 *
 * POR QUÉ SE CARGA EL CATÁLOGO COMPLETO Y SE FILTRA EN CLIENTE:
 * Las páginas filtran hoy en memoria y el resultado es instantáneo mientras
 * se escribe. Mover ese filtrado al servidor añadiría una petición por
 * pulsación y un retardo perceptible: sería un cambio de experiencia, que el
 * MÓDULO 34 prohíbe. Con 11 productos, 20 colores y 11 soluciones, traerlo
 * todo en una consulta es además más eficiente que paginar.
 * Los servicios YA soportan filtro y paginación en servidor para cuando el
 * catálogo crezca; solo hay que empezar a pasarles los parámetros.
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

  // Se guarda en ref para que cambiar la función no dispare recargas.
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

/**
 * Categorías de producto tal como están hoy en la base.
 *
 * Estaban escritas a mano en StorePage, así que una categoría creada desde el
 * portal interno no aparecía nunca en la tienda por más que se le asignaran
 * productos.
 */
export const useProductCategories = (): AsyncState<string[]> =>
  useAsyncData(() => productService.getCategories(), SIN_CATEGORIAS);

export const usePickupStores = (): AsyncState<PintucoStore[]> =>
  useAsyncData(() => storeService.getStores(), SIN_TIENDAS);
