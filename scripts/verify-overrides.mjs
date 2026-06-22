/* global console, process */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));

const expectedOverrides = {
  "@hono/node-server": "1.19.13",
  postcss: "$postcss",
};

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function npmExplain(packageName) {
  return execSync(`npm explain ${packageName}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

for (const [packageName, expectedVersion] of Object.entries(expectedOverrides)) {
  const actualVersion = packageJson.overrides?.[packageName];
  if (actualVersion !== expectedVersion) {
    fail(`Override mismatch for ${packageName}: expected ${expectedVersion}, got ${actualVersion}`);
  }
}

const honoLock = packageLock.packages?.["node_modules/@hono/node-server"]?.version;
if (honoLock !== expectedOverrides["@hono/node-server"]) {
  fail(`@hono/node-server lockfile version mismatch: expected 1.19.13, got ${honoLock}`);
}

const rootPostcss = packageJson.devDependencies?.postcss?.replace(/^[^\d]*/, "");
const postcssLock = packageLock.packages?.["node_modules/postcss"]?.version;
if (postcssLock !== rootPostcss) {
  fail(`postcss lockfile version mismatch: expected ${rootPostcss}, got ${postcssLock}`);
}

const honoExplain = npmExplain("@hono/node-server");
if (!honoExplain.includes("@hono/node-server@1.19.13 overridden")) {
  fail("@hono/node-server override is not active in npm explain output.");
}

const postcssExplain = npmExplain("postcss");
if (!postcssExplain.includes("postcss@8.5.15")) {
  fail("postcss 8.5.15 is not active in npm explain output.");
}

if (!postcssExplain.includes("next@16.2.9")) {
  fail("postcss override no longer references Next; review whether the override is still needed.");
}

if (!postcssExplain.includes("@tailwindcss/postcss@4.3.1")) {
  fail("postcss override no longer references Tailwind; review whether the override is still needed.");
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
        "@hono/node-server": honoLock,
        postcss: postcssLock,
      },
    },
    null,
    2,
  ),
);
