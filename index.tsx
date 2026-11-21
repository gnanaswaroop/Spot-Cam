/**
 * @file This is the main entry point for the SpotCam application.
 * It handles the mounting of the main React component (`App`) into the DOM.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { activateLanguage, detectLanguage } from './utils/i18n';
import { getLanguage } from './utils/settings';

// Find the root DOM element where the React app will be mounted.
const rootElement = document.getElementById('root');
if (!rootElement) {
  // If the root element is not found, throw an error to fail fast.
  throw new Error("Could not find root element to mount to");
}

// Create a React root for concurrent mode features.
const root = ReactDOM.createRoot(rootElement);

// The language is ready before the first draw, so the page never flashes English first. The person's own choice wins;
// without one, the browser's preferred languages decide, and anything unclear means English.
void activateLanguage(getLanguage() ?? detectLanguage(navigator.languages)).finally(() => {
  // Render the main App component wrapped in StrictMode.
  // StrictMode helps with highlighting potential problems in an application.
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
