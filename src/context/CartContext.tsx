import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CartItem, PintucoStore, SolutionKit, StoreProduct } from '../types';
import { PINTUCO_STORES } from '../data/storeMockData';

interface CartContextType {
  cartItems: CartItem[];
  cartCount: number;
  subtotalCOP: number;
  discountCOP: number;
  totalCOP: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  addToCart: (product: StoreProduct, presentationLabel?: string, colorName?: string, colorHex?: string, qty?: number) => void;
  addKitToCart: (kit: SolutionKit, multiplier?: number) => void;
  updateQuantity: (itemId: string, delta: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  // Delivery & Pickup Options
  deliveryMethod: 'pickup' | 'delivery';
  setDeliveryMethod: (method: 'pickup' | 'delivery') => void;
  selectedStore: PintucoStore;
  setSelectedStore: (store: PintucoStore) => void;
  pickupDate: string;
  setPickupDate: (date: string) => void;
  deliveryAddress: string;
  setDeliveryAddress: (address: string) => void;
  deliveryCity: string;
  setDeliveryCity: (city: string) => void;
  isCheckoutSuccessOpen: boolean;
  setIsCheckoutSuccessOpen: (open: boolean) => void;
  lastOrderNumber: string | null;
  completeCheckout: () => void;
}

const CART_STORAGE_KEY = 'pintuco_colorlink_cart_v1';

const INITIAL_CART_ITEMS: CartItem[] = [
  {
    id: 'cart-init-1',
    productId: 'prod-koraza-5',
    productName: 'Koraza 5 Años Protección Total',
    category: 'Fachadas & Exteriores',
    presentation: 'Cuñete 5 Galones (18.9 L)',
    colorName: 'Blanco Nieve',
    colorCode: 'PNT-101',
    colorHex: '#F8FAFC',
    unitPrice: 629900,
    quantity: 1,
    image: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&q=80&w=400',
    isKitItem: true,
    kitName: 'Kit Fachada 5 Años Horizonte',
  },
  {
    id: 'cart-init-2',
    productId: 'prod-sellador-antialcalino',
    productName: 'Sellador Antialcalino Base Agua',
    category: 'Fachadas & Exteriores',
    presentation: '1 Galón (3.785 L)',
    unitPrice: 89900,
    quantity: 3,
    image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=400',
    isKitItem: true,
    kitName: 'Kit Fachada 5 Años Horizonte',
  },
  {
    id: 'cart-init-3',
    productId: 'prod-masilla-elastomerica',
    productName: 'Masilla Elastomérica Grietas & Fisuras',
    category: 'Fachadas & Exteriores',
    presentation: '1 Galón (4.5 Kg)',
    unitPrice: 68900,
    quantity: 1,
    image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&q=80&w=400',
    isKitItem: true,
    kitName: 'Kit Fachada 5 Años Horizonte',
  },
];

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      return stored ? JSON.parse(stored) : INITIAL_CART_ITEMS;
    } catch {
      return INITIAL_CART_ITEMS;
    }
  });

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [selectedStore, setSelectedStore] = useState<PintucoStore>(PINTUCO_STORES[0]);
  const [pickupDate, setPickupDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [deliveryAddress, setDeliveryAddress] = useState('Cra 43A # 18 Sur - 135, Edif. Horizonte');
  const [deliveryCity, setDeliveryCity] = useState('Medellín');
  const [isCheckoutSuccessOpen, setIsCheckoutSuccessOpen] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch (e) {
      console.warn('Could not save cart', e);
    }
  }, [cartItems]);

  const addToCart = useCallback(
    (
      product: StoreProduct,
      presentationLabel?: string,
      colorName?: string,
      colorHex?: string,
      qty = 1
    ) => {
      const pres =
        product.presentations.find((p) => p.label === presentationLabel) ||
        product.presentations[0];

      const chosenColor = colorName
        ? {
            name: colorName,
            hex: colorHex || '#F8FAFC',
            code: product.availableColors?.find((c) => c.name === colorName)?.code || 'PNT-COL',
          }
        : product.availableColors?.[0];

      const itemId = `${product.id}-${pres.label}-${chosenColor?.name || 'std'}`;

      setCartItems((prev) => {
        const existingIndex = prev.findIndex((i) => i.id === itemId);
        if (existingIndex > -1) {
          const next = [...prev];
          next[existingIndex].quantity += qty;
          return next;
        }
        return [
          ...prev,
          {
            id: itemId,
            productId: product.id,
            productName: product.name,
            category: product.category,
            presentation: pres.label,
            colorName: chosenColor?.name,
            colorCode: chosenColor?.code,
            colorHex: chosenColor?.hex,
            unitPrice: pres.priceCOP,
            quantity: qty,
            image: product.image,
          },
        ];
      });
      setIsCartOpen(true);
    },
    []
  );

  const addKitToCart = useCallback((kit: SolutionKit, multiplier = 1) => {
    const newItems: CartItem[] = kit.steps.map((step) => {
      return {
        id: `kit-${kit.id}-${step.productId}-${step.presentation}`,
        productId: step.productId,
        productName: step.productName,
        category: kit.category,
        presentation: step.presentation,
        unitPrice: Math.round(step.unitPriceCOP * (1 - kit.discountPercent / 100)),
        quantity: step.quantityFor85m2 * multiplier,
        image: step.image,
        isKitItem: true,
        kitName: kit.name,
      };
    });

    setCartItems((prev) => {
      // Merge or add
      const updated = [...prev];
      newItems.forEach((item) => {
        const idx = updated.findIndex((i) => i.id === item.id);
        if (idx > -1) {
          updated[idx].quantity += item.quantity;
        } else {
          updated.push(item);
        }
      });
      return updated;
    });
    setIsCartOpen(true);
  }, []);

  const updateQuantity = useCallback((itemId: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) => {
          if (item.id === itemId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
  }, []);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCOP = cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const discountCOP = cartItems.some((i) => i.isKitItem) ? Math.round(subtotalCOP * 0.08) : 0;
  const totalCOP = Math.max(0, subtotalCOP - discountCOP);

  const completeCheckout = useCallback(() => {
    const orderNum = `ORD-PNT-${Math.floor(100000 + Math.random() * 900000)}`;
    setLastOrderNumber(orderNum);
    setIsCartOpen(false);
    setIsCheckoutSuccessOpen(true);
    setCartItems([]);
  }, []);

  return (
    <CartContext.Provider
      value={{
        cartItems,
        cartCount,
        subtotalCOP,
        discountCOP,
        totalCOP,
        isCartOpen,
        setIsCartOpen,
        addToCart,
        addKitToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        deliveryMethod,
        setDeliveryMethod,
        selectedStore,
        setSelectedStore,
        pickupDate,
        setPickupDate,
        deliveryAddress,
        setDeliveryAddress,
        deliveryCity,
        setDeliveryCity,
        isCheckoutSuccessOpen,
        setIsCheckoutSuccessOpen,
        lastOrderNumber,
        completeCheckout,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
