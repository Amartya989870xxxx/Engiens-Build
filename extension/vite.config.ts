import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

export default defineConfig({
  root: path.resolve(__dirname, "."),
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-extension-assets",
      closeBundle() {
        const outDir = path.resolve(__dirname, "dist");
        // Copy manifest.json
        fs.copyFileSync(
          path.resolve(__dirname, "manifest.json"),
          path.resolve(outDir, "manifest.json")
        );
        // Copy icons
        const iconSrc = path.resolve(__dirname, "public/icons");
        const iconDest = path.resolve(outDir, "icons");
        if (!fs.existsSync(iconDest)) {
          fs.mkdirSync(iconDest, { recursive: true });
        }
        if (fs.existsSync(iconSrc)) {
          for (const file of fs.readdirSync(iconSrc)) {
            fs.copyFileSync(path.join(iconSrc, file), path.join(iconDest, file));
          }
        }
      },
    },
  ],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, "sidepanel.html"),
        "service-worker": path.resolve(__dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "service-worker") {
            return "service-worker.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
