import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_CATALOG_VERSION,
  hasDefaultCatalogUpdate,
  hasOfficialCatalogUpdate,
  OFFICIAL_CATALOG_SOURCES,
} from "../app/default-catalog-update";
import {
  bundledOfficialCatalogs,
} from "../app/default-catalog.generated";

function sha256(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

test("内置题库名称来自 db 文件名且 SHA-256 使用 LF 规范化内容", () => {
  const fileNames = readdirSync("db")
    .filter((fileName) => fileName.toLowerCase().endsWith(".csv"))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  assert.deepEqual(bundledOfficialCatalogs.map(({ name, path }) => [name, path]), fileNames.map((fileName) => [
    fileName.slice(0, -4),
    `db/${fileName}`,
  ]));
  assert.deepEqual(
    OFFICIAL_CATALOG_SOURCES.map(({ path, sha256: bundledSha256 }) => {
      const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
      return [path, bundledSha256, sha256(source), bundledSha256.length];
    }),
    bundledOfficialCatalogs.map(({ path, sha256: bundledSha256 }) => [path, bundledSha256, bundledSha256, 64]),
  );
});

test("题库版本来自最后一次修改题库文件的 Git 记录", () => {
  const source = bundledOfficialCatalogs[0];
  try {
    const record = execFileSync(
      "git",
      ["log", "-1", "--format=%H|%cs", "--", source.path],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const [commitSha, commitDate] = record.split("|");
    assert.equal(source.gitCommitSha, commitSha);
    assert.equal(source.gitCommitDate, commitDate);
    assert.equal(DEFAULT_CATALOG_VERSION, `${commitDate} (${commitSha.slice(0, 7)})`);
  } catch {
    assert.equal(source.gitCommitSha, source.sha256);
    assert.equal(source.gitCommitDate, "");
    assert.equal(DEFAULT_CATALOG_VERSION, source.sha256.slice(0, 7));
  }
});

test("任一 GitHub 官方题库 SHA 不同时报告更新", async () => {
  const sources = [
    { path: "db/题库一.csv", sha256: sha256("same catalog") },
    { path: "db/题库二.csv", sha256: "1".repeat(64) },
  ];
  const requestedUrls: string[] = [];
  const request: typeof fetch = async (input, init) => {
    requestedUrls.push(String(input));
    assert.equal(init?.cache, "no-store");
    return new Response(String(input).includes(encodeURIComponent("题库一.csv")) ? "same catalog" : "changed catalog");
  };

  assert.equal(await hasOfficialCatalogUpdate(request, sources), true);
  assert.deepEqual(requestedUrls, [
    "https://raw.githubusercontent.com/TouHousand-Years/dongyiba/main/db/%E9%A2%98%E5%BA%93%E4%B8%80.csv",
    "https://raw.githubusercontent.com/TouHousand-Years/dongyiba/main/db/%E9%A2%98%E5%BA%93%E4%BA%8C.csv",
  ]);
});

test("全部 GitHub 官方题库 SHA 相同时不报告更新", async () => {
  const remoteCatalogs = new Map([
    ["db/题库一.csv", "catalog one"],
    ["db/题库二.csv", "catalog two"],
  ]);
  const sources = [...remoteCatalogs].map(([path, source]) => ({ path, sha256: sha256(source) }));
  const request: typeof fetch = async (input) => {
    const path = decodeURIComponent(new URL(String(input)).pathname.split("/main/")[1]);
    return new Response(remoteCatalogs.get(path));
  };
  assert.equal(await hasOfficialCatalogUpdate(request, sources), false);
});

test("GitHub 请求失败时由调用方静默处理", async () => {
  const request: typeof fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(
    hasOfficialCatalogUpdate(request, [{ path: "db/题库.csv", sha256: "1".repeat(64) }]),
    /503.*db\/题库\.csv/,
  );
});

test("旧的单题库检查接口仍可使用", async () => {
  const source = "same catalog";
  const request: typeof fetch = async () => new Response(source);
  assert.equal(await hasDefaultCatalogUpdate(request, sha256(source)), false);
});
