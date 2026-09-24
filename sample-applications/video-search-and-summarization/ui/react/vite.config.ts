// Copyright (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serve the same bind-mounted `config/map-config.json` at `/map-config.json`
 * during `vite dev`, so the Map View's runtime config works identically in
 * development and in the deployed nginx-fronted containers. Dev-only
 * (`apply: 'serve'`): production builds never bundle this file.
 */
const mapConfigDevPlugin = (): Plugin => ({
  name: 'vss-map-config-dev',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/map-config.json', (_req, res) => {
      const configPath = resolve(__dirname, '../../config/map-config.json');
      res.setHeader('Content-Type', 'application/json');
      res.end(existsSync(configPath) ? readFileSync(configPath) : '{}');
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), mapConfigDevPlugin()],
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
      },
    },
  },
});
