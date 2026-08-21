import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  output: 'server',
  // Astro's dev-mode debug toolbar docks bottom-center by default, right on
  // top of this app's own toolbar — off, since it's dev-only chrome anyway.
  devToolbar: { enabled: false },
  adapter: cloudflare({
    mode: 'directory',
  }),
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      external: ['cloudflare:sockets'],
    },
  },
});
