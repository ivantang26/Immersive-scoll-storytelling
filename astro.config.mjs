import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

// Vercel needs its adapter to emit deployable routes and static assets. Keep the
// standalone Node adapter for local production previews.
const adapter = process.env.VERCEL ? vercel() : node({ mode: 'standalone' });

// Pages are prerendered (static HTML); only /api/* routes run on the server.
export default defineConfig({
  site: 'https://vela.example',
  output: 'static',
  adapter,
  build: { inlineStylesheets: 'auto' },
  server: { port: 4321 },
});
