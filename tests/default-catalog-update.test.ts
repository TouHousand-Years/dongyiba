import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_CATALOG_VERSION, hasDefaultCatalogUpdate } from "../app/default-catalog-update";
import {
  defaultCatalogGitBlobSha,
  defaultCatalogGitCommitDate,
  defaultCatalogGitCommitSha,
} from "../app/default-catalog.generated";

const bundledSha = "1".repeat(40);

function gitBlobSha(source: string): string {
  const bytes = Buffer.from(source, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

test("内置题库 SHA 使用 Git 的 LF 文本规范化结果", () => {
  const source = readFileSync("db/东一把题库.csv", "utf8").replace(/\r\n/g, "\n");
  const bytes = Buffer.from(source, "utf8");
  const expected = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  assert.equal(defaultCatalogGitBlobSha, expected);
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

test("GitHub 题库 SHA 不同时报告更新", async () => {
  const request: typeof fetch = async (input, init) => {
    assert.match(String(input), /^https:\/\/raw\.githubusercontent\.com\//);
    assert.equal(init?.cache, "no-store");
    return new Response("remote catalog");
  };

  assert.equal(await hasDefaultCatalogUpdate(request, bundledSha), true);
});

test("GitHub 题库 SHA 相同时不报告更新", async () => {
  const source = "same catalog";
  const request: typeof fetch = async () => new Response(source);
  assert.equal(await hasDefaultCatalogUpdate(request, gitBlobSha(source)), false);
});

test("GitHub 请求失败时由调用方静默处理", async () => {
  const request: typeof fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(hasDefaultCatalogUpdate(request, bundledSha), /503/);
});
