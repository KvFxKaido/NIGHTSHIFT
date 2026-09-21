import { defineConfig } from "vite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { layoutMiddleware } from "./scripts/layout-server.mjs";
import { lapsMiddleware } from "./scripts/laps-server.mjs";
import { readFile } from "node:fs/promises";

const layoutFile = fileURLToPath(new URL("./src/sim/alder-layout.json", import.meta.url));
const frontageFile = fileURLToPath(new URL("./src/sim/alder-frontages.json", import.meta.url));
const lapsDir = fileURLToPath(new URL("./recordings/laps", import.meta.url));
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
    name: "alder-demo-boundary",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        const retired = Object.keys(item.modules).find(id => /src\/(sim\/district|render\/(district|course|blender-course))\.ts$/.test(id.replaceAll("\\", "/")));
        if (retired) this.error(`Retired map entered the demo bundle: ${retired}`);
      }
    },
  }, {
    // Lap recordings from Ridge Circuit races land in recordings/laps (design/PORT_ALDER.md).
    name: "lap-recordings",
    configureServer(server) { server.middlewares.use(lapsMiddleware(lapsDir)); },
  }, {
    name: "alder-layout-editor",
    configureServer(server) {
      server.middlewares.use(layoutMiddleware(frontageFile, async value => {
        const { parseFrontageDocument, resolveFrontages, frontageForSite } = await import("./src/sim/frontage-document.ts");
        const { frontageAccessTools, validateFrontageAccess } = await import("./src/sim/frontage-generator.ts");
        const { frontageContextForLayout } = await import("./src/sim/alder.ts");
        const doc = parseFrontageDocument(value), context = frontageContextForLayout(JSON.parse(await readFile(layoutFile,"utf8")));
        const {plans,issues} = resolveFrontages(doc,context.sites);
        if(issues.length)throw Error(issues[0].message);
        for(const site of context.sites)if(context.protectedIds.has(site.id)&&frontageForSite(doc,site.id))throw Error("This landmark owns its architecture");
        const tools=frontageAccessTools(context);
        for(const plan of plans) {
          const errors=validateFrontageAccess(plan,tools);if(errors.length)throw Error(`${plan.recipe.id}: ${errors[0]}`);
        }
        return doc;
      }, () => server.moduleGraph.invalidateAll(), {route:"/__editor/frontages",maxBytes:16_000_000}));
      server.middlewares.use(layoutMiddleware(layoutFile, async value => {
        const { resolveAlderLayout } = await import(pathToFileURL(join(dirname(layoutFile), "alder.ts")).href + `?validator=${validatorRevision}`);
        // Whichever schema arrives, the file is written as schema 2.
        const { layout, issues } = resolveAlderLayout(value);
        if (issues.length) throw new Error(issues.join("\n"));
        return layout;
      }, () => server.moduleGraph.invalidateAll()));
    },
    handleHotUpdate({ file, server }) {
      if ([layoutFile,frontageFile].some(path=>file.replaceAll("\\", "/") === path.replaceAll("\\", "/"))) {
        // Keep unsaved editor drafts alive. A fresh game load uses the saved file.
        server.moduleGraph.invalidateAll();
        return [];
      }
    },
  }],
  build: {
    // seattle.html is the city's old name, kept as a redirect for old links.
    rollupOptions: { input: { game: "index.html", district: "district.html", editor: "editor.html", alder: "alder.html", seattle: "seattle.html" } },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    // Browser downloads can briefly lock files on Windows. They are evidence,
    // never source modules, and must not bring down the dev server's watcher.
    watch: { ignored: ["**/artifacts/**", "**/.playwright-cli/**", "**/recordings/**"] },
  },
});
