import vinext from "vinext";
import { defineConfig } from "vite";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  // Project Pages sites are served below /<repository>/.
  base: isGitHubPages ? "/dongyiba/" : "/",
  server: isCodexSeatbeltSandbox
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  plugins: [vinext()],
});
