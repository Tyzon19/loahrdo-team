import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({
      // Use the SSR error wrapper instead of TanStack Start's default server entry.
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: {
    port: 8080,
    strictPort: true,
    watch: {
      // Ignore generated Nitro/Vite output to avoid Windows file-watcher lock errors
      // when files inside .output/public are opened or rebuilt.
      ignored: ["**/.output/**", "**/.nitro/**"],
    },
  },
});
