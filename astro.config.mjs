import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Pages are prerendered (static HTML); only /api/* routes run on the Node server.
export default defineConfig({
  site: 'https://vela.example',
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  build: { inlineStylesheets: 'auto' },
  server: { port: 4321 },
});
