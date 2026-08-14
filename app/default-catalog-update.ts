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

const DEFAULT_CATALOG_API_URL =
  "https://api.github.com/repos/TouHousand-Years/dongyiba/contents/db/%E4%B8%9C%E4%B8%80%E6%8A%8A%E9%A2%98%E5%BA%93.csv?ref=main";

type GitHubContentResponse = {
  sha?: unknown;
};

export async function hasDefaultCatalogUpdate(
  request: typeof fetch = fetch,
  bundledSha = defaultCatalogGitBlobSha,
): Promise<boolean> {
  const response = await request(DEFAULT_CATALOG_API_URL, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}.`);

  const result = await response.json() as GitHubContentResponse;
  if (typeof result.sha !== "string" || !/^[0-9a-f]{40}$/i.test(result.sha)) {
    throw new Error("GitHub did not return a valid catalog SHA.");
  }
  return result.sha.toLowerCase() !== bundledSha.toLowerCase();
}
