import { defineConfig } from "vite";

// Vite does not read PORT by itself, and the dev script passes no --port flag,
// so an assigned port would otherwise be ignored and the server would take 5173
// regardless. Nothing here needs a fixed port — no OAuth callback, webhook or
// pinned CORS origin — so honour whatever the environment assigns and fall back
// to Vite's usual 5173 when running `pnpm dev` by hand.
//
// tsconfig.json includes only `src`, so this file is transpiled by Vite rather
// than typechecked by `tsc`; that is why `process` needs no @types/node here.
export default defineConfig({
  build: {
    rollupOptions: { input: { game: "index.html", district: "district.html" } },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
  },
});
