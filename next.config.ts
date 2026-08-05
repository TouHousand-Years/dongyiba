import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The game is entirely browser-side, so publish it as static files. This
  // lets the portable Windows package run without Node.js or node_modules.
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
