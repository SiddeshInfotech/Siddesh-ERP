// electron.vite.config.ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
var __electron_vite_injected_dirname = "C:\\Company_Projects\\Siddesh-ERP\\apps\\desktop";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(__electron_vite_injected_dirname, "src/renderer"),
    // .env lives at the monorepo root, not next to this config. Without this, Vite finds
    // no .env and silently compiles `undefined` in for every VITE_* var — the build still
    // succeeds and the app only fails at runtime.
    envDir: resolve(__electron_vite_injected_dirname, "../.."),
    resolve: {
      alias: {
        "@": resolve(__electron_vite_injected_dirname, "src/renderer/src")
      }
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(__electron_vite_injected_dirname, "src/renderer/index.html")
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
