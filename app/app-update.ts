import packageJson from "../package.json";

export const CURRENT_VERSION = packageJson.version;
export const DISPLAY_VERSION = `v${CURRENT_VERSION}`;
export const APP_GITHUB_URL = "https://github.com/TouHousand-Years/dongyiba";

const APP_VERSION_URL =
  "https://raw.githubusercontent.com/TouHousand-Years/dongyiba/main/package.json";

type VersionParts = {
  core: [number, number, number];
  prerelease: string[];
};

type RemotePackage = {
  version?: unknown;
};

export type AppUpdateResult = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
};

function parseVersion(version: string): VersionParts {
  const match = version.trim().replace(/^v/i, "").match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/,
  );
  if (!match) throw new Error(`无效版本号：${version}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4]?.split(".") ?? [],
  };
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < a.core.length; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    if (a.prerelease.length === b.prerelease.length) return 0;
    return a.prerelease.length ? -1 : 1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = a.prerelease[index];
    const bPart = b.prerelease[index];
    if (aPart === undefined || bPart === undefined) return aPart === undefined ? -1 : 1;
    if (aPart === bPart) continue;
    const aNumber = /^\d+$/.test(aPart) ? Number(aPart) : null;
    const bNumber = /^\d+$/.test(bPart) ? Number(bPart) : null;
    if (aNumber !== null && bNumber !== null) return aNumber > bNumber ? 1 : -1;
    if (aNumber !== null || bNumber !== null) return aNumber !== null ? -1 : 1;
    return aPart > bPart ? 1 : -1;
  }
  return 0;
}

export async function checkForAppUpdate(
  request: typeof fetch = fetch,
  currentVersion = CURRENT_VERSION,
): Promise<AppUpdateResult> {
  const response = await request(APP_VERSION_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
  const result = await response.json() as RemotePackage;
  if (typeof result.version !== "string") {
    throw new Error("GitHub 未返回有效版本号。");
  }
  parseVersion(result.version);
  return {
    currentVersion,
    latestVersion: result.version,
    updateAvailable: compareVersions(result.version, currentVersion) > 0,
  };
}
