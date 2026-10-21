import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from './theme/theme.js';
import { App } from './App.js';
import './styles/tokens.css';
import './styles/app.css';

initTheme();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
