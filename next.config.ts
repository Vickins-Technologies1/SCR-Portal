/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverExternalPackages: ['nodemailer'],
  },
};

module.exports = nextConfig;
