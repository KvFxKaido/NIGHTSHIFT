import { mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

/** A session id names its own file: letters, digits and dashes, nothing that can climb out of the folder. */
const SESSION_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const FORMAT = "nightshift-laps-v1";
/** A long session is a few megabytes of telemetry; this refuses anything that is clearly not one. */
const LIMIT = 40_000_000;

/**
 * The development endpoint lap recordings are saved through: PUT
 * /__laps/<session id> writes `<dir>/<session id>.json`, replacing the same
 * session's earlier save, so each completed lap is on disk as soon as it is
 * driven. Same-origin and local only, like the layout editor's endpoint; the
 * client names a session, never a path.
 */
export function lapsMiddleware(dir) {
  let queue = Promise.resolve();
  return (request, response, next) => {
    const match = /^\/__laps\/([^/?]+)$/.exec(request.url?.split("?")[0] ?? "");
    if (!match) return next();
    const send = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
    };
    const run = async () => {
      if (request.method !== "PUT") return send(405, { error: "Use PUT" });
      if (request.headers.origin !== `http://${request.headers.host}` ||
          !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(request.headers.host ?? "")) {
        return send(403, { error: "Lap recordings save only from this local game" });
      }
      const id = decodeURIComponent(match[1]);
      if (!SESSION_ID.test(id)) return send(400, { error: "Invalid session id" });
      if (request.headers["content-type"] !== "application/json") return send(415, { error: "Expected JSON" });
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > LIMIT) return send(413, { error: "Recording is too large" });
        chunks.push(chunk);
      }
      const session = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (session?.format !== FORMAT) return send(400, { error: `Expected ${FORMAT}` });
      if (session.id !== id) return send(400, { error: "The session id does not match its address" });
      if (!Array.isArray(session.recorded) || !Array.isArray(session.inputs?.throttle)) return send(400, { error: "A session needs laps and an input log" });
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${id}.json`), temp = `${file}.tmp`;
      try {
        await writeFile(temp, JSON.stringify(session), "utf8");
        await rename(temp, file);
      } finally { await unlink(temp).catch(() => {}); }
      send(200, { saved: `${id}.json`, laps: session.recorded.length });
    };
    queue = queue.then(run).catch(error => send(400, { error: error.message }));
  };
}
