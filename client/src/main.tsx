import '@fontsource-variable/fraunces';
import '@fontsource-variable/nunito';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/600.css';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { captureInstallPrompt } from './lib/install';

captureInstallPrompt();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
