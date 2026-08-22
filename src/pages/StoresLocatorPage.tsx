import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useProjects } from '../context/ProjectContext';
import { PINTUCO_STORES } from '../data/storeMockData';
import { PintucoStore } from '../types';
import {
  Store,
  MapPin,
  Phone,
  Clock,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Search,
  Navigation,
  Check,
  ChevronRight,
  Truck,
} from 'lucide-react';
import { Button } from '../components/common/Button';

interface StoresLocatorPageProps {
  onNavigate: (page: string, param?: string) => void;
}

export const StoresLocatorPage: React.FC<StoresLocatorPageProps> = ({ onNavigate }) => {
  const { selectedStore, setSelectedStore, setIsCartOpen } = useCart();
  const { showToast } = useProjects();

  const [selectedCity, setSelectedCity] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const cities = ['Todos', 'Medellín', 'Bogotá D.C.', 'Cali', 'Barranquilla', 'Bucaramanga'];

  const filteredStores = PINTUCO_STORES.filter((st) => {
    const matchCity = selectedCity === 'Todos' || st.city === selectedCity;
    const matchSearch =
      !searchQuery.trim() ||
      st.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      st.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      st.city.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCity && matchSearch;
  });

  const handleSelectPickupStore = (st: PintucoStore) => {
    setSelectedStore(st);
    showToast(`Tienda "${st.name}" seleccionada para retiro`, 'success');
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-[#004F9F] px-3 py-1 rounded-full text-xs font-bold border border-blue-200">
              <Store className="w-3.5 h-3.5" />
              <span>Red Oficial de Puntos de Venta & Centros de Color</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Tiendas Pintuco y Retiro en Tienda
            </h1>
            <p className="text-sm text-slate-500 max-w-2xl font-medium">
              Ubica tu punto de atención más cercano con preparación de color computarizada al instante y retiro express de materiales para tu obra en menos de 2 horas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('store')}
              className="bg-[#004F9F] hover:bg-[#003B77] text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              Comprar en Tienda Online
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* City Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
          {cities.map((city) => (
            <button
              key={city}
              onClick={() => setSelectedCity(city)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCity === city
                  ? 'bg-[#004F9F] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {city}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por dirección o barrio..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
        </div>
      </div>

      {/* Stores List & Map Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Stores Cards (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="space-y-3">
            {filteredStores.map((st) => {
              const isSelected = selectedStore.id === st.id;
              return (
                <div
                  key={st.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-blue-50/80 border-[#004F9F] ring-2 ring-blue-600 shadow-md'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase bg-blue-100 text-[#004F9F] px-2 py-0.5 rounded">
                          {st.city}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded flex items-center gap-1">
                            <Check className="w-3 h-3" /> Tienda de Retiro Activa
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-extrabold text-slate-900">
                        {st.name}
                      </h3>

                      <div className="space-y-1 text-xs text-slate-600">
                        <p className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-[#004F9F] shrink-0" />
                          <span>{st.address}</span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{st.phone}</span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{st.hours}</span>
                        </p>
                      </div>

                      {/* Services Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {st.hasExpressPickup && (
                          <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                            ⚡ Retiro Express {st.stockReadinessHours}h
                          </span>
                        )}
                        {st.hasColorStudio && (
                          <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                            🎨 Centro de Color
                          </span>
                        )}
                        {st.hasTechAdvisor && (
                          <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                            👷 Asesoría en Obra
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action */}
                    <div className="flex sm:flex-col items-center justify-end gap-2 shrink-0">
                      <Button
                        onClick={() => handleSelectPickupStore(st)}
                        variant={isSelected ? 'outline' : 'primary'}
                        className={`text-xs font-bold px-3 py-2 ${
                          isSelected
                            ? 'border-[#004F9F] text-[#004F9F]'
                            : 'bg-[#004F9F] text-white shadow-xs'
                        }`}
                      >
                        {isSelected ? 'Seleccionada' : 'Elegir para Retiro'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Interactive Store Services & Map Simulation (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Cobertura y Ventajas de Compra Directa
            </h3>

            {/* Map Visualizer Mockup */}
            <div className="relative h-64 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
              <img
                src="https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=800"
                alt="Mapa de Tiendas Pintuco"
                className="w-full h-full object-cover opacity-80"
              />
              <div className="absolute inset-0 bg-linear-to-t from-slate-950/80 via-transparent to-transparent flex flex-col justify-end p-4 text-white">
                <p className="text-xs font-bold flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-yellow-400" /> Red Nacional de Distribución
                </p>
                <p className="text-[11px] text-slate-300">
                  Más de 350 tiendas autorizadas y centros de mezcla en toda Colombia.
                </p>
              </div>
            </div>

            {/* Value Props */}
            <div className="space-y-2.5 text-xs text-slate-700">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-[#004F9F] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block font-bold">Mezcla de Color Computarizada al Instante</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Preparamos cualquier código de la carta de color Pintuco en menos de 10 minutos.
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-slate-900 block font-bold">Respaldo Técnico Directo de Fábrica</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Garantía escrita, emisión de certificados de calidad y fichas técnicas para contratistas.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
