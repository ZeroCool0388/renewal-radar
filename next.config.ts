import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  turbopack: { root: process.cwd() },
  serverExternalPackages: ['unpdf'],
  outputFileTracingIncludes: { '/*': ['./data/**/*'] },
};
export default config;
