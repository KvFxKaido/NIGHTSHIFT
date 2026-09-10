import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, readFile, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { layoutMiddleware } from "../scripts/layout-server.mjs";

test("layout saves validate before replacing one file and reject stale or foreign writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-layout-")), file = join(dir, "layout.json");
  await writeFile(file, '{"height":8}\n');
  const server = createServer(layoutMiddleware(file, value => {
    if (!(value.height >= 2 && value.height <= 100)) throw new Error("Invalid height");
    return value;
  }));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port, origin = `http://127.0.0.1:${port}`;
  const url = origin + "/__editor/layout";
  try {
    const original = await (await fetch(url)).json();
    const put = (height: number, revision = original.revision, source = origin) => fetch(url, {
      method: "PUT", headers: { "Content-Type": "application/json", "If-Match": revision, Origin: source }, body: JSON.stringify({ height }),
    });
    assert.equal((await put(9, original.revision, "https://example.com")).status, 403);
    assert.equal((await put(-1)).status, 400);
    assert.equal(await readFile(file, "utf8"), '{"height":8}\n');
    const results = await Promise.all([put(9), put(10)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    const current = await (await fetch(url)).json();
    assert.notEqual(current.revision, original.revision);
    assert.equal(JSON.parse(await readFile(file, "utf8")).height, current.layout.height);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await unlink(file);
    await rmdir(dir);
  }
});
