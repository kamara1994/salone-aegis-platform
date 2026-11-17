/** @type {import('next').NextConfig} */
const live = process.env.NEXT_PUBLIC_API_MODE === 'live';
const nextConfig = {
  reactStrictMode: true,
  // Recruiter mode is a separate static export with no connection to the live platform.
  output: process.env.AEGIS_RECRUITER_EXPORT === '1' ? 'export' : undefined,
  // The recruiter export has no server, so exclude the server-only route.ts file.
  // App pages use .tsx; omitting .ts keeps the API route out of the static export.
  pageExtensions: process.env.AEGIS_RECRUITER_EXPORT === '1' ? ['tsx', 'jsx', 'js'] : ['tsx', 'ts', 'jsx', 'js'],
  async rewrites() {
    if (!live || !process.env.AEGIS_API_ORIGIN) return [];
    return [{ source: '/api/v1/:path*', destination: `${process.env.AEGIS_API_ORIGIN}/api/v1/:path*` }];
  },
};
export default nextConfig;
