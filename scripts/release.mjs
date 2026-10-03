import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  cpSync,
  rmSync,
  lstatSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[""].version, pkg.version);
const tag =
  process.env.GITHUB_REF_TYPE === "tag"
    ? process.env.GITHUB_REF_NAME
    : process.argv[2];
if (tag) assert.equal(tag, `v${pkg.version}`, "Tag must match package version");
const inventory = JSON.parse(read("dist-library/release-inventory.json"));
assert(inventory.modules.length > 0);
const bundled = new Set();
for (const id of inventory.modules) {
  if (id.startsWith("src/")) continue;
  const match = /^node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(id);
  assert(match, `Unexpected bundled module: ${id}`);
  bundled.add(match[1]);
}
let notices = "Third-party notices for gorak-frame-designer\n\n";
if (!bundled.size)
  notices +=
    "No third-party runtime code is bundled. Build tools and Electron are excluded.\n";
for (const name of [...bundled].sort()) {
  const dep = JSON.parse(read(`node_modules/${name}/package.json`));
  const licenses = readdirSync(join(root, "node_modules", name)).filter(
    (file) => /^(license|licence|copying|notice)(\.|$)/i.test(file),
  );
  assert(
    licenses.length,
    `Missing third-party license for ${name}; review before release`,
  );
  notices += `\n${name} ${dep.version} (${dep.license})\n`;
  for (const file of licenses)
    notices += `\n${read(`node_modules/${name}/${file}`)}\n`;
}
const scratch = mkdtempSync(join(tmpdir(), "gorak-release-"));
const output = join(root, "release");
mkdirSync(output, { recursive: true });
try {
  const stage = join(scratch, "stage");
  mkdirSync(join(stage, "dist-library"), { recursive: true });
  const declarations = readdirSync(join(root, "dist-library")).filter((file) =>
    file.endsWith(".d.ts"),
  );
  assert(declarations.includes("designer.d.ts"));
  const files = [...inventory.files, ...declarations].sort();
  assert(files.includes("gorak-frame-designer.js"));
  assert.deepEqual(
    readdirSync(join(root, "dist-library")).sort(),
    [...files, "release-inventory.json"].sort(),
    "Unaccounted build output",
  );
  for (const file of files) {
    assert(
      !file.split("/").some((part) => part === ".." || part.startsWith(".")),
    );
    const src = join(root, "dist-library", file);
    assert(lstatSync(src).isFile(), `Not a regular file: ${file}`);
    const dest = join(stage, "dist-library", file);
    mkdirSync(resolve(dest, ".."), { recursive: true });
    if (file.endsWith(".d.ts")) {
      // TypeScript emits source-style specifiers; make the archive work in NodeNext too.
      writeFileSync(
        dest,
        readFileSync(src, "utf8").replace(
          /(from\s+["'])(\.\.?\/[^"']+)(["'])/g,
          (_all, prefix, specifier, quote) =>
            `${prefix}${specifier.replace(/\.ts$/, "").replace(/\.js$/, "")}.js${quote}`,
        ),
      );
    } else cpSync(src, dest);
  }
  const entry = "./dist-library/gorak-frame-designer.js";
  writeFileSync(
    join(stage, "package.json"),
    JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        type: "module",
        license: pkg.license,
        main: entry,
        types: "./dist-library/designer.d.ts",
        exports: pkg.exports,
        files: ["dist-library", "LICENSE", "THIRD-PARTY-NOTICES.txt"],
      },
      null,
      2,
    ) + "\n",
  );
  cpSync(join(root, "LICENSE"), join(stage, "LICENSE"));
  writeFileSync(join(stage, "THIRD-PARTY-NOTICES.txt"), notices);
  assert(process.env.npm_execpath, "Run via npm run release:package");
  const [packed] = JSON.parse(
    execFileSync(
      process.execPath,
      [
        process.env.npm_execpath,
        "pack",
        stage,
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        scratch,
      ],
      { encoding: "utf8", cwd: scratch },
    ),
  );
  const expected = [
    "package.json",
    "LICENSE",
    "THIRD-PARTY-NOTICES.txt",
    ...files.map((file) => `dist-library/${file}`),
  ].sort();
  assert.deepEqual(packed.files.map((file) => file.path).sort(), expected);
  const archive = join(scratch, packed.filename);
  const listing = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" })
    .trim()
    .split(/\r?\n/)
    .sort();
  assert.deepEqual(listing, expected.map((file) => `package/${file}`).sort());
  const consumer = join(scratch, "consumer");
  const modules = join(consumer, "node_modules", pkg.name);
  mkdirSync(modules, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", modules]);
  for (const file of expected) {
    const data = readFileSync(join(modules, file));
    assert.deepEqual(data, readFileSync(join(stage, file)));
    if (/\.(js|css|json|ts|txt)$/.test(file))
      assert(
        !/(?:\b[A-Za-z]:[\\/](?!\/)|\/Users\/|\/home\/|file:\/\/\/|sourceMappingURL=)/.test(
          data.toString(),
        ),
        `Machine path or sourcemap in ${file}`,
      );
  }
  writeFileSync(join(consumer, "package.json"), '{"type":"module"}');
  writeFileSync(
    join(consumer, "import.mjs"),
    `
    import assert from 'node:assert/strict';
    globalThis.HTMLElement = class {};
    const registered = new Map();
    globalThis.customElements = { get: name => registered.get(name), define: (name, value) => registered.set(name, value) };
    const library = await import('${pkg.name}');
    assert.equal(typeof library.GorakFrameDesigner, 'function');
    assert.equal(registered.get('gorak-frame-designer'), library.GorakFrameDesigner);
    assert.equal(typeof library.frameFromWml, 'function');
  `,
  );
  execFileSync(process.execPath, [join(consumer, "import.mjs")]);
  writeFileSync(
    join(consumer, "consumer.ts"),
    `import { GorakFrameDesigner, type FrameDocument } from '${pkg.name}';\nconst element: HTMLElement = new GorakFrameDesigner();\nlet document: FrameDocument;\nvoid element;\n`,
  );
  for (const resolution of ["NodeNext", "Bundler"]) {
    execFileSync(
      process.execPath,
      [
        join(root, "node_modules/typescript/bin/tsc"),
        "--noEmit",
        "--strict",
        "--module",
        resolution === "NodeNext" ? "NodeNext" : "ESNext",
        "--moduleResolution",
        resolution,
        "--target",
        "ES2022",
        join(consumer, "consumer.ts"),
      ],
      { stdio: "inherit", cwd: consumer },
    );
  }
  cpSync(archive, join(output, packed.filename));
  const digest = createHash("sha256")
    .update(readFileSync(archive))
    .digest("hex");
  writeFileSync(join(output, "SHA256SUMS"), `${digest}  ${packed.filename}\n`);
  console.log(
    `Validated ${packed.filename}: ${expected.length} files; import and NodeNext/Bundler declarations pass.`,
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
