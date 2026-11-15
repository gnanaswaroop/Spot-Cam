import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { buildRobots, buildSitemap } from './utils/sitemap';

/**
 * GitHub Pages can't rewrite /cam to the SPA, so emit a real index.html for each route,
 * plus a 404.html (unknown paths fall back to the landing page).
 */
const spaRoutes = (routes: string[]): Plugin => ({
  name: 'spa-routes',
  apply: 'build',
  closeBundle() {
    const dist = path.resolve(__dirname, 'dist');
    const html = fs.readFileSync(path.join(dist, 'index.html'));
    for (const route of routes) {
      fs.mkdirSync(path.join(dist, route), { recursive: true });
      fs.writeFileSync(path.join(dist, route, 'index.html'), html);
    }
    fs.writeFileSync(path.join(dist, '404.html'), html);
  },
});

/** Writes sitemap.xml and robots.txt for the site origin (override with SITE_URL when building for another domain). */
const seoFiles = (): Plugin => ({
  name: 'seo-files',
  apply: 'build',
  closeBundle() {
    const dist = path.resolve(__dirname, 'dist');
    const origin = process.env.SITE_URL ?? 'https://spotcam.in';
    fs.writeFileSync(path.join(dist, 'sitemap.xml'), buildSitemap(origin));
    fs.writeFileSync(path.join(dist, 'robots.txt'), buildRobots(origin));
  },
});

export default defineConfig({
  // Served from the root of the custom domain (https://spotcam.in/).
  // For a plain GitHub project site (https://<user>.github.io/Spot-Cam/) build with BASE_PATH=/Spot-Cam/.
  base: process.env.BASE_PATH ?? '/',
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  // basicSsl: self-signed HTTPS for the dev server so phones can use camera/geolocation.
  plugins: [react(), tailwindcss(), basicSsl(), spaRoutes(['home', 'cam', 'gallery', 'privacy']), seoFiles()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
