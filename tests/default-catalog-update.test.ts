import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasDefaultCatalogUpdate } from "../app/default-catalog-update";
import { defaultCatalogGitBlobSha } from "../app/default-catalog.generated";

const bundledSha = "1".repeat(40);

test("内置题库 SHA 使用 Git 的 LF 文本规范化结果", () => {
  const source = readFileSync("db/东一把题库.csv", "utf8").replace(/\r\n/g, "\n");
  const bytes = Buffer.from(source, "utf8");
  const expected = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  assert.equal(defaultCatalogGitBlobSha, expected);
});

test("GitHub 题库 SHA 不同时报告更新", async () => {
  const request: typeof fetch = async (_input, init) => {
    assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("Accept"), "application/vnd.github+json");
    return Response.json({ sha: "2".repeat(40) });
  };

  assert.equal(await hasDefaultCatalogUpdate(request, bundledSha), true);
});

test("GitHub 题库 SHA 相同时不报告更新", async () => {
  const request: typeof fetch = async () => Response.json({ sha: bundledSha });
  assert.equal(await hasDefaultCatalogUpdate(request, bundledSha), false);
});

test("GitHub 请求失败时由调用方静默处理", async () => {
  const request: typeof fetch = async () => new Response(null, { status: 503 });
  await assert.rejects(hasDefaultCatalogUpdate(request, bundledSha), /503/);
});
