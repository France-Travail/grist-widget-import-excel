import { readFile, readdir, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
export async function build() {
  const source = path.join(root, "public"),
    output = path.join(root, "dist");
  const { version } = JSON.parse(
    await readFile(path.join(root, "package.json")),
  );
  const hash = createHash("sha256").update(version);
  async function walk(dir) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const name = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(name);
      else
        hash.update(path.relative(source, name)).update(await readFile(name));
    }
  }
  await walk(source);
  const revision = hash.digest("hex").slice(0, 12),
    releasePath = `releases/${revision}/`;
  await mkdir(output, { recursive: true });
  await mkdir(path.join(output, releasePath), { recursive: true });
  for (const dir of ["src", "styles", "vendor"])
    await cp(path.join(source, dir), path.join(output, releasePath, dir), {
      recursive: true,
    });
  for (const file of ["index.html", "bootstrap.js"])
    await cp(path.join(source, file), path.join(output, file));
  await writeFile(path.join(output, ".nojekyll"), "");
  await writeFile(
    path.join(output, "version.json"),
    JSON.stringify({ version, revision, path: releasePath }) + "\n",
  );
  return { version, revision, output };
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log(await build());
