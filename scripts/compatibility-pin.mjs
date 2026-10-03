import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const checkout = fileURLToPath(
  new URL("../.ci/gorak/", import.meta.url),
);
const manifest = readFileSync(
  new URL("../ecosystem.toml", import.meta.url),
  "utf8",
);
export const revision = /^gorak_revision = "([^"]+)"$/m.exec(manifest)?.[1];
export const sourceVersion = /^source_version = (\d+)$/m.exec(manifest)?.[1];
if (!revision || !sourceVersion) throw Error("Invalid ecosystem.toml pin");
// Immutable release identity, verified when resolving the explicit tag.
const releaseCommit = "ae8e0b3235e4baed4e58eb19ea450096bf27d4ce";
export const tag = `refs/tags/${revision}`;
export function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
export function verifyCheckout() {
  const head = git("-C", checkout, "rev-parse", "HEAD");
  const resolved = git(
    "-C",
    checkout,
    "rev-parse",
    "--verify",
    `${tag}^{commit}`,
  );
  if (head !== resolved || resolved !== releaseCommit)
    throw Error("Fixture checkout must match the pinned release commit");
  const upstream = readFileSync(
    new URL("../.ci/gorak/ecosystem.toml", import.meta.url),
    "utf8",
  );
  if (/^source_version = (\d+)\b/m.exec(upstream)?.[1] !== sourceVersion)
    throw Error("Pinned source contract does not match source_version");
  if (git("-C", checkout, "status", "--porcelain", "--untracked-files=all"))
    throw Error(
      "Fixture checkout has local changes; preserve them before fetching/testing",
    );
  return resolved;
}
