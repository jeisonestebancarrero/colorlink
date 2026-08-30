import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminApp } from './App';
import '../index.css';

/**
 * Punto de entrada de la aplicación INTERNA.
 *
 * Es un bundle distinto al del portal del cliente. Esa separación no es
 * organizativa sino de seguridad: el cliente no debe recibir ni una línea del
 * back-office, ni siquiera su pantalla de acceso.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
