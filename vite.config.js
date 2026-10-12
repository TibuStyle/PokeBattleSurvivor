import { defineConfig } from 'vite';

// GitHub Pages publica el proyecto bajo /<nombre-del-repo>/.
// En desarrollo local se mantiene la raíz /.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/PokeBattleSurvivor/' : '/',
  server: {
    host: '0.0.0.0',
    // El dominio de preview de Arena es dinámico; permitir el host proxy.
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
