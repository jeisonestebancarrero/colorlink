import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PedidoCliente } from '../../services/tracking';

/**
 * Mapa real de seguimiento sobre cartografía de Colombia.
 *
 * Usa Leaflet con teselas de OpenStreetMap: sin clave de API ni costo por
 * uso, y con la geografía real del país.
 *
 * QUÉ ES REAL Y QUÉ NO, para no prometer de más:
 *   — Real: las ciudades de origen y destino, y su ubicación en el mapa.
 *   — Estimado: la posición del vehículo. El sistema conoce el ESTADO del
 *     envío, no sus coordenadas GPS, así que el marcador se interpola sobre
 *     la ruta según el avance. Se advierte en la propia pantalla.
 *
 * Cuando la transportadora entregue coordenadas reales, solo hay que
 * sustituir esa interpolación por el punto que ella reporte.
 */

/** Coordenadas de las ciudades donde Pintuco tiene operación. */
const CIUDADES: Record<string, [number, number]> = {
  'medellín': [6.2442, -75.5812],
  'medellin': [6.2442, -75.5812],
  'itagüí': [6.1719, -75.6111],
  'itagui': [6.1719, -75.6111],
  'bogotá': [4.7110, -74.0721],
  'bogota': [4.7110, -74.0721],
  'cali': [3.4516, -76.5320],
  'barranquilla': [10.9685, -74.7813],
  'cartagena': [10.3910, -75.4794],
  'bucaramanga': [7.1193, -73.1227],
  'pereira': [4.8133, -75.6961],
  'manizales': [5.0703, -75.5138],
  'cúcuta': [7.8939, -72.5078],
  'cucuta': [7.8939, -72.5078],
  'santa marta': [11.2408, -74.1990],
  'ibagué': [4.4389, -75.2322],
  'ibague': [4.4389, -75.2322],
  'villavicencio': [4.1420, -73.6266],
};

/** Centro de Colombia, para cuando la ciudad no esté en la lista. */
const CENTRO_COLOMBIA: [number, number] = [4.5709, -74.2973];

function coordenadas(ciudad: string | null): [number, number] {
  if (!ciudad) return CENTRO_COLOMBIA;
  const clave = ciudad.toLowerCase().split(',')[0].trim();
  return CIUDADES[clave] ?? CENTRO_COLOMBIA;
}

const icono = (color: string, emoji: string, tamano = 34) =>
  L.divIcon({
    className: '',
    html: `<div style="width:${tamano}px;height:${tamano}px;border-radius:999px;background:#fff;
      border:3px solid ${color};display:flex;align-items:center;justify-content:center;
      box-shadow:0 3px 10px rgba(15,23,42,.28);font-size:${tamano * 0.42}px;line-height:1">${emoji}</div>`,
    iconSize: [tamano, tamano],
    iconAnchor: [tamano / 2, tamano / 2],
  });

export const MapaSeguimiento: React.FC<{ pedido: PedidoCliente }> = ({ pedido }) => {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capas = useRef<L.LayerGroup | null>(null);

  const origen = coordenadas(pedido.ciudadRetiro ?? 'Medellín');
  const destino = coordenadas(pedido.esEnvio ? pedido.ciudad : pedido.ciudadRetiro);

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;

    mapa.current = L.map(contenedor.current, {
      zoomControl: true,
      scrollWheelZoom: false, // no secuestra el desplazamiento de la página
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap',
    }).addTo(mapa.current);

    capas.current = L.layerGroup().addTo(mapa.current);

    return () => {
      mapa.current?.remove();
      mapa.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapa.current || !capas.current) return;
    capas.current.clearLayers();

    const mismoLugar =
      Math.abs(origen[0] - destino[0]) < 0.01 && Math.abs(origen[1] - destino[1]) < 0.01;

    const entregado = pedido.estado === 'ENTREGADO';
    const p = Math.max(0.02, Math.min(1, pedido.progreso));

    // Ruta completa, atenuada
    L.polyline([origen, destino], {
      color: '#94A3B8', weight: 3, opacity: 0.55, dashArray: '8 10',
    }).addTo(capas.current);

    // Tramo recorrido
    const actual: [number, number] = [
      origen[0] + (destino[0] - origen[0]) * p,
      origen[1] + (destino[1] - origen[1]) * p,
    ];
    L.polyline([origen, actual], { color: '#004F9F', weight: 4, opacity: 0.9 }).addTo(capas.current);

    L.marker(origen, { icon: icono('#004F9F', '🏬', 32) })
      .bindTooltip(pedido.puntoRetiro ?? 'Origen', { direction: 'top', offset: [0, -18] })
      .addTo(capas.current);

    if (!mismoLugar) {
      L.marker(destino, { icon: icono(entregado ? '#059669' : '#94A3B8', '📍', 32) })
        .bindTooltip(pedido.direccion ?? pedido.ciudad ?? 'Destino', { direction: 'top', offset: [0, -18] })
        .addTo(capas.current);

      L.marker(actual, { icon: icono('#004F9F', entregado ? '📦' : '🚚', 40) })
        .bindTooltip(`${Math.round(p * 100)}% del recorrido`, { direction: 'top', offset: [0, -22] })
        .addTo(capas.current);

      mapa.current.fitBounds(L.latLngBounds([origen, destino]).pad(0.35));
    } else {
      mapa.current.setView(origen, 13);
    }
  }, [pedido.progreso, pedido.estado, pedido.ciudad, pedido.ciudadRetiro]);

  return (
    <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-slate-100">
      <div ref={contenedor} className="w-full h-[19rem] z-0" />

      <div className="absolute top-3 right-3 z-[400] bg-white/95 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-slate-200 shadow-2xs">
        <span className="text-xs font-extrabold text-[#004F9F] tabular-nums">
          {Math.round(Math.max(0.02, Math.min(1, pedido.progreso)) * 100)}%
        </span>
      </div>

      <div className="absolute bottom-0 inset-x-0 z-[400] bg-white/92 backdrop-blur-sm border-t border-slate-200 px-3 py-1.5">
        <p className="text-[10px] font-semibold text-slate-500">
          Posición estimada según el avance del envío. No es rastreo GPS del vehículo.
        </p>
      </div>
    </div>
  );
};
