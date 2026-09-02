// en-GB: Implements the verify overrides check so automated gates enforce a stable repository invariant.
/* global console, process */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));

const expectedOverrides = {
  "deepmerge-ts": "8.0.0",
  mysql2: "3.23.1",
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

function npmDependencyInstances(packageName) {
  const tree = JSON.parse(
    execSync(`npm ls ${packageName} --all --json`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
  );
  if (Array.isArray(tree.problems) && tree.problems.length > 0) {
    fail(`${packageName} dependency tree reports problems: ${tree.problems.join("; ")}`);
  }

  const instances = [];
  const visit = (node) => {
    for (const [dependencyName, dependency] of Object.entries(node?.dependencies ?? {})) {
      if (dependencyName === packageName) instances.push(dependency);
      visit(dependency);
    }
  };
  visit(tree);
  return instances;
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

const mysql2Lock = packageLock.packages?.["node_modules/mysql2"]?.version;
if (mysql2Lock !== expectedOverrides.mysql2) {
  fail(`mysql2 lockfile version mismatch: expected ${expectedOverrides.mysql2}, got ${mysql2Lock}`);
}

const deepmergeExplain = npmExplain("deepmerge-ts");
if (!deepmergeExplain.includes("deepmerge-ts@8.0.0 overridden")) {
  fail("deepmerge-ts security override is not active in npm explain output.");
}

const mysql2Explain = npmExplain("mysql2");
if (!mysql2Explain.includes(`mysql2@${expectedOverrides.mysql2} overridden`)) {
  fail("mysql2 security override is not active in npm explain output.");
}
const mysql2Instances = npmDependencyInstances("mysql2");
if (
  mysql2Instances.length !== 1 ||
  mysql2Instances[0]?.version !== expectedOverrides.mysql2 ||
  mysql2Instances[0]?.overridden !== true ||
  mysql2Instances[0]?.invalid === true ||
  mysql2Instances[0]?.extraneous === true
) {
  fail("mysql2 must resolve to exactly one valid, non-extraneous overridden instance.");
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
        mysql2: { version: mysql2Lock, instances: mysql2Instances.length },
        postcss: postcssLock
      }
    },
    null,
    2
  )
);
