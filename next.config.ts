import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // exceljs uses dynamic requires and must not be bundled
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
