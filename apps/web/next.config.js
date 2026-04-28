/** @type {import('next').NextConfig} */
import nextPwa from "next-pwa";

const withPwa = nextPwa({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
});

const config = {
  reactStrictMode: true,
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default withPwa(config);