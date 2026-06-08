import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    modulePreload: { polyfill: false },
  },
  server: {
    port: 5181,
    strictPort: false,
  },
});
