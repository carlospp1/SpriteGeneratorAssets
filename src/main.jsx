import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { capturarErroresGlobales } from './forja/features/source/notificaciones.js';
import './shell.css';
import './styles.css';

// errors nobody caught become a notification in the top-right corner, not a console message
capturarErroresGlobales();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
