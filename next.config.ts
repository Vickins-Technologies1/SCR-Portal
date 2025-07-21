/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverExternalPackages: ["nodemailer", "axios"],
  },
};

export default nextConfig;