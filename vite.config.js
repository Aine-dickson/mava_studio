import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
// Import the plugin as a namespace and prefer the default export if present.
// This avoids "monaco is not a function" errors when the module system
// (bun/node) provides a namespace object instead of a direct callable.
import * as _monacoPkg from 'vite-plugin-monaco-editor';
const monaco = _monacoPkg && (_monacoPkg.default || _monacoPkg);

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
    plugins: [
    sveltekit(), tailwindcss(),
    // Only call the plugin if we resolved a callable
    ...(typeof monaco === 'function' ? [monaco({ languageWorkers: ['editorWorkerService','typescript'] })] : []),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
