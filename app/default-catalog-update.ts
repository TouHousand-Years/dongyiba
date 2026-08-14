import { bundledOfficialCatalogs } from "./default-catalog.generated";

const defaultCatalogSource = bundledOfficialCatalogs[0];
if (!defaultCatalogSource) throw new Error("没有可用的内置官方题库。");

export const DEFAULT_CATALOG_VERSION = defaultCatalogSource.gitCommitDate
  ? `${defaultCatalogSource.gitCommitDate} (${defaultCatalogSource.gitCommitSha.slice(0, 7)})`
  : defaultCatalogSource.sha256.slice(0, 7);

export const OFFICIAL_CATALOG_GITHUB_URL =
  "https://github.com/TouHousand-Years/dongyiba/tree/main/db";

export const OFFICIAL_CATALOG_SOURCES = bundledOfficialCatalogs.map(({ path, sha256 }) => ({ path, sha256 }));

const OFFICIAL_CATALOG_RAW_BASE_URL =
  "https://raw.githubusercontent.com/TouHousand-Years/dongyiba/main";

async function getSha256(source: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", source);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getRawUrl(path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${OFFICIAL_CATALOG_RAW_BASE_URL}/${encodedPath}`;
}

export async function hasOfficialCatalogUpdate(
  request: typeof fetch = fetch,
  sources: ReadonlyArray<{ path: string; sha256: string }> = OFFICIAL_CATALOG_SOURCES,
): Promise<boolean> {
  const updateStates = await Promise.all(sources.map(async (source) => {
    const response = await request(getRawUrl(source.path), { cache: "no-store" });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${source.path}.`);
    const remoteSha256 = await getSha256(await response.arrayBuffer());
    return remoteSha256 !== source.sha256.toLowerCase();
  }));
  return updateStates.some(Boolean);
}

export async function hasDefaultCatalogUpdate(
  request: typeof fetch = fetch,
  sha256 = defaultCatalogSource.sha256,
): Promise<boolean> {
  return hasOfficialCatalogUpdate(request, [{
    path: OFFICIAL_CATALOG_SOURCES[0].path,
    sha256,
  }]);
}

export const DEFAULT_CATALOG_GITHUB_URL = `${OFFICIAL_CATALOG_GITHUB_URL.replace("/tree/", "/blob/")}/${defaultCatalogSource.path.slice(3).split("/").map(encodeURIComponent).join("/")}`;
