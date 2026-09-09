import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "../scripts/build.mjs";
test("Distributions tierces identiques aux empreintes vérifiées", async () => {
  const base = new URL("../public/vendor/", import.meta.url);
  const hashes = JSON.parse(await readFile(new URL("checksums.json", base)));
  for (const [file, expected] of Object.entries(hashes))
    assert.equal(
      createHash("sha256")
        .update(await readFile(new URL(file, base)))
        .digest("hex"),
      expected,
    );
});
test("Build reproductible : manifeste et graphe complet dans la même version", async () => {
  const first = await build(),
    second = await build();
  assert.equal(first.revision, second.revision);
  const manifest = JSON.parse(
    await readFile(new URL("../dist/version.json", import.meta.url)),
  );
  assert.equal(manifest.revision, first.revision);
  for (const file of [
    "src/app.js",
    "src/services/dateService.js",
    "styles/style.css",
    "vendor/xlsx.full.min.js",
    "vendor/grist-plugin-api.js",
  ])
    await access(new URL(`../dist/${manifest.path}${file}`, import.meta.url));
  const bootstrap = await readFile(
    new URL("../dist/bootstrap.js", import.meta.url),
    "utf8",
  );
  assert.match(bootstrap, /cache: ['"]no-store['"]/);
});
