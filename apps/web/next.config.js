/** @type {import('next').NextConfig} */
const nextPwa = require("next-pwa");

const withPwa = nextPwa({
  dest: "public",
  register: true,
  skipWaiting: true
});

const config = {
  reactStrictMode: true,
  output: "export"
};

module.exports = withPwa(config);

