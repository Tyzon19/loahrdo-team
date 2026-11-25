import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      // Use the SSR error wrapper instead of TanStack Start's default server entry.
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: { tsconfigPaths: true },
  server: {
    port: 8080,
    strictPort: true,
    allowedHosts: ["localhost", "127.0.0.1", ".trycloudflare.com"],
    watch: {
      // Ignore generated Nitro/Vite output to avoid Windows file-watcher lock errors
      // when files inside .output/public are opened or rebuilt.
      ignored: ["**/.output/**", "**/.nitro/**"],
    },
  },
});
