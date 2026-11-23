import { defineConfig } from "vite";
import zaloMiniApp from "zmp-vite-plugin";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function cleanWwwBeforeBuild() {
  return {
    name: "clean-www-before-build",
    apply: "build" as const,
    buildStart() {
      const out = path.resolve(__dirname, "www");
      if (fs.existsSync(out)) {
        fs.rmSync(out, { recursive: true, force: true });
      }
    },
  };
}

export default () => {
  return defineConfig({
    root: ".",
    base: "",
    plugins: [cleanWwwBeforeBuild(), zaloMiniApp(), react()],
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
        },
      },
    },
    build: {
      assetsInlineLimit: 0,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  });
};
