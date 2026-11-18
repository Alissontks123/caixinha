import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { initSync } from './sync/engine';
import '@fontsource-variable/nunito';
import './styles.css';
import { applyTheme } from './lib/theme';

applyTheme();

// pede ao navegador para não apagar os dados locais quando faltar espaço
navigator.storage?.persist?.().catch(() => undefined);
registerSW({ immediate: true });
void initSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
