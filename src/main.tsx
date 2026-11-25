import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { faults } from './data/repo';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline-Fähigkeit (nur über HTTPS bzw. localhost verfügbar)
if ('serviceWorker' in navigator && import.meta.env.PROD && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

// Testhaken: mit ?debug lassen sich Fehler simulieren (z. B. für den E2E-Test)
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __tagwerkFaults: typeof faults }).__tagwerkFaults = faults;
}
