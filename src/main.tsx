import '@fontsource/special-elite/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/crimson-pro/400.css';
import '@fontsource/crimson-pro/400-italic.css';
import '@fontsource/crimson-pro/600.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/admin.css';
import './ui/styles/home.css';
import './ui/styles/game.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
