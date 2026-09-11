import { defineConfig } from "vite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { layoutMiddleware } from "./scripts/layout-server.mjs";

const layoutFile = fileURLToPath(new URL("./src/sim/seattle-layout.json", import.meta.url));
const validatorRevision = Date.now();

// Vite does not read PORT by itself, and the dev script passes no --port flag,
// so an assigned port would otherwise be ignored and the server would take 5173
// regardless. Nothing here needs a fixed port — no OAuth callback, webhook or
// pinned CORS origin — so honour whatever the environment assigns and fall back
// to Vite's usual 5173 when running `pnpm dev` by hand.
//
// tsconfig.json includes only `src`, so this file is transpiled by Vite rather
// than typechecked by `tsc`; that is why `process` needs no @types/node here.
export default defineConfig({
  plugins: [{
    name: "seattle-demo-boundary",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        const retired = Object.keys(item.modules).find(id => /src\/(sim\/district|render\/(district|course|blender-course))\.ts$/.test(id.replaceAll("\\", "/")));
        if (retired) this.error(`Retired map entered the demo bundle: ${retired}`);
      }
    },
  }, {
    name: "seattle-layout-editor",
    configureServer(server) {
      server.middlewares.use(layoutMiddleware(layoutFile, async value => {
        const { resolveSeattleLayout } = await import(pathToFileURL(join(dirname(layoutFile), "seattle.ts")).href + `?validator=${validatorRevision}`);
        // Whichever schema arrives, the file is written as schema 2.
        const { layout, issues } = resolveSeattleLayout(value);
        if (issues.length) throw new Error(issues.join("\n"));
        return layout;
      }, () => server.moduleGraph.invalidateAll()));
    },
    handleHotUpdate({ file, server }) {
      if (file.replaceAll("\\", "/") === layoutFile.replaceAll("\\", "/")) {
        // Keep unsaved editor drafts alive. A fresh game load uses the saved file.
        server.moduleGraph.invalidateAll();
        return [];
      }
    },
  }],
  build: {
    rollupOptions: { input: { game: "index.html", district: "district.html", editor: "editor.html", seattle: "seattle.html" } },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // Browser downloads can briefly lock files on Windows. They are evidence,
    // never source modules, and must not bring down the dev server's watcher.
    watch: { ignored: ["**/artifacts/**", "**/.playwright-cli/**"] },
  },
});
