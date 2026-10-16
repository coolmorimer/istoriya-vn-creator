import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {readFileSync} from 'node:fs';

export default defineConfig({
  base: "./",
  define:{'import.meta.env.VITE_APP_VERSION':JSON.stringify(JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')).version)},
  plugins: [react(), {
    name: "packaged-content-security-policy",
    apply: "build",
    transformIndexHtml() {
      return [{ tag: "meta", attrs: {
        "http-equiv": "Content-Security-Policy",
        content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: file: asset: http://asset.localhost https://asset.localhost; font-src 'self' data: blob: file: asset: http://asset.localhost https://asset.localhost; media-src 'self' data: blob: file: asset: http://asset.localhost https://asset.localhost; connect-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost https://asset.localhost; object-src 'none'; base-uri 'self'",
      }, injectTo: "head-prepend" }];
    },
  }],
  build: { outDir: "dist/client", emptyOutDir: true, target: "esnext" },
  server: {
    watch: {
      ignored: ["**/release*/**", "**/.artifacts/**"],
    },
  },
});
