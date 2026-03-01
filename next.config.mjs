const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] || '';
const isProjectPages = Boolean(repositoryName) && !repositoryName.endsWith('.github.io');
const basePath = process.env.GITHUB_ACTIONS === 'true' && isProjectPages ? `/${repositoryName}` : '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
