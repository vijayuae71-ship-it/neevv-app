/** @type {import('postcss-load-config').Config} */
// Tailwind is compiled at build time (was compiled in the visitor's browser from a CDN script).
const config = {
  plugins: { '@tailwindcss/postcss': {} },
};

module.exports = config;
