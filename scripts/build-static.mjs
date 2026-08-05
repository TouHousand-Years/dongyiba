import { rmSync, existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const projectRoot = process.cwd();
const distDir = join(projectRoot, "dist");
const clientDir = join(distDir, "client");

// Never accept stale files when deciding whether a build completed.
rmSync(distDir, { recursive: true, force: true });

const cli = join(projectRoot, "node_modules", "vinext", "dist", "cli.js");
const result = spawnSync(process.execPath, [cli, "build"], {
  cwd: projectRoot,
  env: process.env,
  encoding: "utf8",
  stdio: ["inherit", "inherit", "pipe"],
});
const buildStderr = result.stderr || "";

const requiredFiles = [
  join(clientDir, "index.html"),
  join(clientDir, "admin", "index.html"),
  join(clientDir, "index.rsc"),
  join(clientDir, "admin.rsc"),
];
const assetsDir = join(clientDir, "assets");
const outputComplete =
  requiredFiles.every((file) => existsSync(file)) &&
  existsSync(assetsDir) &&
  readdirSync(assetsDir).some((file) => file.endsWith(".js")) &&
  readdirSync(assetsDir).some((file) => file.endsWith(".css"));

if (result.status === 0) {
  if (buildStderr) process.stderr.write(buildStderr);
  process.exit(0);
}

// vinext 0.0.50 can hit a libuv assertion after a successful static export
// when its temporary prerender server shuts down on Node 24 for Windows. The
// generated output is already complete at that point. Do not hide any earlier
// or incomplete failure.
const nodeMajor = Number.parseInt(process.versions.node, 10);
const knownShutdownAssertion = /Assertion failed:.*UV_HANDLE_CLOSING.*src\\win\\async\.c/s.test(buildStderr);
if (process.platform === "win32" && nodeMajor >= 24 && outputComplete && knownShutdownAssertion) {
  const remainingStderr = buildStderr
    .split(/\r?\n/)
    .filter((line) => !line.includes("Assertion failed:") || !line.includes("UV_HANDLE_CLOSING"))
    .join("\n")
    .trim();
  if (remainingStderr) process.stderr.write(`${remainingStderr}\n`);
  console.warn(
    "\nStatic files were generated successfully. Ignoring the known vinext/Node 24 Windows shutdown error.",
  );
  process.exit(0);
}

if (buildStderr) process.stderr.write(buildStderr);
process.exit(result.status ?? 1);
