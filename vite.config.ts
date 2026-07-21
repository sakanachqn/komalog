import { defineConfig } from "vite";

// GitHub Pages のプロジェクトページ（https://<user>.github.io/komalog/）配下で配信するため base が必要
export default defineConfig({
  base: "/komalog/",
  // 同名のアイコン画像を差し替えても、公開先の古いキャッシュを参照しないようにする。
  define: {
    __ICON_BUILD_VERSION__: JSON.stringify(Date.now().toString()),
  },
  server: {
    port: 5180,
    strictPort: true,
  },
});
