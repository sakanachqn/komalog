import { defineConfig } from "vite";

// GitHub Pages のプロジェクトページ（https://<user>.github.io/komalog/）配下で配信するため base が必要
export default defineConfig({
  base: "/komalog/",
  server: {
    port: 5180,
    strictPort: true,
  },
});
