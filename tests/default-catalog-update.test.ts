import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_CATALOG_VERSION,
  hasDefaultCatalogUpdate,
  hasOfficialCatalogUpdate,
  OFFICIAL_CATALOG_SOURCES,
} from "../app/default-catalog-update";
import {
  closeMatchCatalogGitBlobSha,
  defaultCatalogGitBlobSha,
  defaultCatalogGitCommitDate,
  defaultCatalogGitCommitSha,
} from "../app/default-catalog.generated";

function gitBlobSha(source: string): string {
  const bytes = Buffer.from(source, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

test("内置题库 SHA 使用 Git 的 LF 文本规范化结果", () => {
  assert.deepEqual(
    OFFICIAL_CATALOG_SOURCES.map(({ path, bundledSha }) => {
      const source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
      return [path, bundledSha, gitBlobSha(source)];
    }),
    [
      ["db/东一把题库.csv", defaultCatalogGitBlobSha, defaultCatalogGitBlobSha],
      ["db/东一把题库-初登场作品完全加接近匹配.csv", closeMatchCatalogGitBlobSha, closeMatchCatalogGitBlobSha],
    ],
  );
});

test("题库版本来自最后一次修改题库文件的 Git 记录", () => {
  try {
    const record = execFileSync(
      "git",
      ["log", "-1", "--format=%H|%cs", "--", "db/东一把题库.csv"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const [commitSha, commitDate] = record.split("|");
    assert.equal(defaultCatalogGitCommitSha, commitSha);
    assert.equal(defaultCatalogGitCommitDate, commitDate);
    assert.equal(DEFAULT_CATALOG_VERSION, `${commitDate} (${commitSha.slice(0, 7)})`);
  } catch {
    assert.equal(defaultCatalogGitCommitSha, defaultCatalogGitBlobSha);
    assert.equal(defaultCatalogGitCommitDate, "");
    assert.equal(DEFAULT_CATALOG_VERSION, defaultCatalogGitBlobSha.slice(0, 7));
  }
});

test("任一 GitHub 官方题库 SHA 不同时报告更新", async () => {
  const sources = [
    { path: "db/题库一.csv", bundledSha: gitBlobSha("same catalog") },
    { path: "db/题库二.csv", bundledSha: "1".repeat(40) },
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
  const sources = [...remoteCatalogs].map(([path, source]) => ({ path, bundledSha: gitBlobSha(source) }));
  const request: typeof fetch = async (input) => {
    const path = decodeURIComponent(new URL(String(input)).pathname.split("/main/")[1]);
    return new Response(remoteCatalogs.get(path));
  };
  assert.equal(await hasOfficialCatalogUpdate(request, sources), false);
});

test("GitHub 请求失败时由调用方静默处理", async () => {
  const request: typeof fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(
    hasOfficialCatalogUpdate(request, [{ path: "db/题库.csv", bundledSha: "1".repeat(40) }]),
    /503.*db\/题库\.csv/,
  );
});

test("旧的单题库检查接口仍可使用", async () => {
  const source = "same catalog";
  const request: typeof fetch = async () => new Response(source);
  assert.equal(await hasDefaultCatalogUpdate(request, gitBlobSha(source)), false);
});
