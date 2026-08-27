// en-GB: Implements the verify overrides check so automated gates enforce a stable repository invariant.
/* global console, process */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));

const expectedOverrides = {
  "deepmerge-ts": "8.0.0",
  postcss: "$postcss"
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function npmExplain(packageName) {
  return execSync(`npm explain ${packageName}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

for (const [packageName, expectedVersion] of Object.entries(expectedOverrides)) {
  const actualVersion = packageJson.overrides?.[packageName];
  if (actualVersion !== expectedVersion) {
    fail(`Override mismatch for ${packageName}: expected ${expectedVersion}, got ${actualVersion}`);
  }
}

const rootPostcss = packageJson.devDependencies?.postcss?.replace(/^[^\d]*/, "");
const postcssLock = packageLock.packages?.["node_modules/postcss"]?.version;
if (postcssLock !== rootPostcss) {
  fail(`postcss lockfile version mismatch: expected ${rootPostcss}, got ${postcssLock}`);
}

const deepmergeLock = packageLock.packages?.["node_modules/deepmerge-ts"]?.version;
if (deepmergeLock !== expectedOverrides["deepmerge-ts"]) {
  fail(
    `deepmerge-ts lockfile version mismatch: expected ${expectedOverrides["deepmerge-ts"]}, got ${deepmergeLock}`
  );
}

const deepmergeExplain = npmExplain("deepmerge-ts");
if (!deepmergeExplain.includes("deepmerge-ts@8.0.0 overridden")) {
  fail("deepmerge-ts security override is not active in npm explain output.");
}

const postcssExplain = npmExplain("postcss");
if (!postcssExplain.includes(`postcss@${rootPostcss}`)) {
  fail(`postcss ${rootPostcss} is not active in npm explain output.`);
}

if (!postcssExplain.includes(`next@${packageLock.packages?.["node_modules/next"]?.version}`)) {
  fail("postcss override no longer references Next; review whether the override is still needed.");
}

if (
  !postcssExplain.includes(
    `@tailwindcss/postcss@${packageLock.packages?.["node_modules/@tailwindcss/postcss"]?.version}`
  )
) {
  fail(
    "postcss override no longer references Tailwind; review whether the override is still needed."
  );
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      overrides: expectedOverrides,
      resolved: {
        "deepmerge-ts": deepmergeLock,
        postcss: postcssLock
      }
    },
    null,
    2
  )
);
