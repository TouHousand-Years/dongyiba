import assert from "node:assert/strict";
import test from "node:test";
import {
  checkForAppUpdate,
  compareVersions,
  CURRENT_VERSION,
  DISPLAY_VERSION,
} from "../app/app-update";

test("当前显示版本来自 package.json", () => {
  assert.equal(CURRENT_VERSION, "0.2.0");
  assert.equal(DISPLAY_VERSION, "v0.2.0");
});

test("版本比较支持补丁版本与预发布版本", () => {
  assert.equal(compareVersions("0.1.3", "0.1.2"), 1);
  assert.equal(compareVersions("1.0.0-beta.2", "1.0.0-beta.1"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta.2"), 1);
  assert.equal(compareVersions("0.1.2", "0.1.2"), 0);
});

test("GitHub 版本较新时报告更新", async () => {
  const request: typeof fetch = async (_input, init) => {
    assert.equal(init?.cache, "no-store");
    return Response.json({ version: "0.1.3" });
  };
  assert.deepEqual(await checkForAppUpdate(request, "0.1.2"), {
    currentVersion: "0.1.2",
    latestVersion: "0.1.3",
    updateAvailable: true,
  });
});

test("远端版本相同或较旧时不报告更新", async () => {
  const same = await checkForAppUpdate(async () => Response.json({ version: "0.1.2" }), "0.1.2");
  const older = await checkForAppUpdate(async () => Response.json({ version: "0.1.1" }), "0.1.2");
  assert.equal(same.updateAvailable, false);
  assert.equal(older.updateAvailable, false);
});

test("GitHub 返回无效版本时由调用方处理", async () => {
  await assert.rejects(
    checkForAppUpdate(async () => Response.json({ version: "next" }), "0.1.2"),
    /无效版本号/,
  );
});
