import assert from "node:assert/strict";
import test from "node:test";
import { hasDefaultCatalogUpdate } from "../app/default-catalog-update";

const bundledSha = "1".repeat(40);

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
