import {
  closeMatchCatalogGitBlobSha,
  defaultCatalogGitBlobSha,
  defaultCatalogGitCommitDate,
  defaultCatalogGitCommitSha,
} from "./default-catalog.generated";

export const DEFAULT_CATALOG_VERSION = defaultCatalogGitCommitDate
  ? `${defaultCatalogGitCommitDate} (${defaultCatalogGitCommitSha.slice(0, 7)})`
  : defaultCatalogGitCommitSha.slice(0, 7);

export const OFFICIAL_CATALOG_GITHUB_URL =
  "https://github.com/TouHousand-Years/dongyiba/tree/main/db";

export const OFFICIAL_CATALOG_SOURCES = [
  { path: "db/东一把题库.csv", bundledSha: defaultCatalogGitBlobSha },
  { path: "db/东一把题库-初登场作品完全加接近匹配.csv", bundledSha: closeMatchCatalogGitBlobSha },
] as const;

const OFFICIAL_CATALOG_RAW_BASE_URL =
  "https://raw.githubusercontent.com/TouHousand-Years/dongyiba/main";

async function getGitBlobSha(source: ArrayBuffer): Promise<string> {
  const header = new TextEncoder().encode(`blob ${source.byteLength}\0`);
  const blob = new Uint8Array(header.byteLength + source.byteLength);
  blob.set(header);
  blob.set(new Uint8Array(source), header.byteLength);
  const digest = await crypto.subtle.digest("SHA-1", blob);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getRawUrl(path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${OFFICIAL_CATALOG_RAW_BASE_URL}/${encodedPath}`;
}

export async function hasOfficialCatalogUpdate(
  request: typeof fetch = fetch,
  sources: ReadonlyArray<{ path: string; bundledSha: string }> = OFFICIAL_CATALOG_SOURCES,
): Promise<boolean> {
  const updateStates = await Promise.all(sources.map(async (source) => {
    const response = await request(getRawUrl(source.path), { cache: "no-store" });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${source.path}.`);
    const remoteSha = await getGitBlobSha(await response.arrayBuffer());
    return remoteSha !== source.bundledSha.toLowerCase();
  }));
  return updateStates.some(Boolean);
}

export async function hasDefaultCatalogUpdate(
  request: typeof fetch = fetch,
  bundledSha = defaultCatalogGitBlobSha,
): Promise<boolean> {
  return hasOfficialCatalogUpdate(request, [{
    path: OFFICIAL_CATALOG_SOURCES[0].path,
    bundledSha,
  }]);
}

export const DEFAULT_CATALOG_GITHUB_URL =
  "https://github.com/TouHousand-Years/dongyiba/blob/main/db/%E4%B8%9C%E4%B8%80%E6%8A%8A%E9%A2%98%E5%BA%93.csv";
