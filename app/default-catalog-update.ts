import {
  defaultCatalogGitBlobSha,
  defaultCatalogGitCommitDate,
  defaultCatalogGitCommitSha,
} from "./default-catalog.generated";

export const DEFAULT_CATALOG_VERSION = defaultCatalogGitCommitDate
  ? `${defaultCatalogGitCommitDate} (${defaultCatalogGitCommitSha.slice(0, 7)})`
  : defaultCatalogGitCommitSha.slice(0, 7);

export const DEFAULT_CATALOG_GITHUB_URL =
  "https://github.com/TouHousand-Years/dongyiba/blob/main/db/%E4%B8%9C%E4%B8%80%E6%8A%8A%E9%A2%98%E5%BA%93.csv";

const DEFAULT_CATALOG_RAW_URL =
  "https://raw.githubusercontent.com/TouHousand-Years/dongyiba/main/db/%E4%B8%9C%E4%B8%80%E6%8A%8A%E9%A2%98%E5%BA%93.csv";

async function getGitBlobSha(source: ArrayBuffer): Promise<string> {
  const header = new TextEncoder().encode(`blob ${source.byteLength}\0`);
  const blob = new Uint8Array(header.byteLength + source.byteLength);
  blob.set(header);
  blob.set(new Uint8Array(source), header.byteLength);
  const digest = await crypto.subtle.digest("SHA-1", blob);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hasDefaultCatalogUpdate(
  request: typeof fetch = fetch,
  bundledSha = defaultCatalogGitBlobSha,
): Promise<boolean> {
  const response = await request(DEFAULT_CATALOG_RAW_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);
  const remoteSha = await getGitBlobSha(await response.arrayBuffer());
  return remoteSha !== bundledSha.toLowerCase();
}
