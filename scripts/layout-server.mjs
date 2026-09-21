import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";

const revisionOf = text => createHash("sha256").update(text).digest("hex");

/** A single-file, same-origin development endpoint. No client-supplied paths. */
export function layoutMiddleware(file, validate, changed = () => {}, { route = "/__editor/layout", maxBytes = 1_000_000 } = {}) {
  let queue = Promise.resolve();
  return (request, response, next) => {
    if (request.url?.split("?")[0] !== route) return next();
    const send = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
    };
    const run = async () => {
      if (request.method === "GET") {
        const raw = await readFile(file, "utf8");
        return send(200, { layout: JSON.parse(raw), revision: revisionOf(raw) });
      }
      if (request.method !== "PUT") return send(405, { error: "Use GET or PUT" });
      if (request.headers.origin !== `http://${request.headers.host}` ||
          !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(request.headers.host ?? "")) {
        return send(403, { error: "Saving is available only from this local editor" });
      }
      if (request.headers["content-type"] !== "application/json") return send(415, { error: "Expected JSON" });
      let body = "", bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > maxBytes) return send(413, { error: "Layout is too large" });
        body += chunk.toString("utf8");
      }
      const raw = await readFile(file, "utf8");
      if (request.headers["if-match"] !== revisionOf(raw)) return send(409, { error: "The saved layout changed elsewhere. Export your draft, then reload before saving." });
      const layout = await validate(JSON.parse(body));
      if (await readFile(file, "utf8") !== raw) return send(409, { error: "The layout changed during validation. Reload saved placements before saving." });
      const text = JSON.stringify(layout, null, 2) + "\n";
      const temp = `${file}.tmp`;
      try {
        await writeFile(temp, text, "utf8");
        await rename(temp, file);
      } finally { await unlink(temp).catch(() => {}); }
      changed();
      send(200, { layout, revision: revisionOf(text) });
    };
    // Read, compare and replace form one operation even with two editor tabs.
    queue = queue.then(run).catch(error => send(400, { error: error.message }));
  };
}
