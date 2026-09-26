import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminApp } from './App';
import '../index.css';

/** Entrada del portal interno: bundle aparte para que el cliente no reciba código del back-office. */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
