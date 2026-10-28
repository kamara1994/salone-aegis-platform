/** @type {import('next').NextConfig} */
const live = process.env.NEXT_PUBLIC_API_MODE === 'live';
const nextConfig = {
  reactStrictMode: true,
  // Recruiter mode is a separate static export with no connection to the live platform.
  output: process.env.AEGIS_RECRUITER_EXPORT === '1' ? 'export' : undefined,
  async rewrites() {
    if (!live || !process.env.AEGIS_API_ORIGIN) return [];
    return [{ source: '/api/v1/:path*', destination: `${process.env.AEGIS_API_ORIGIN}/api/v1/:path*` }];
  },
};
export default nextConfig;
