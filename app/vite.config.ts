import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const avatarRoot = fileURLToPath(new URL('..', import.meta.url));
const interfaceSrc = fileURLToPath(new URL('../../interface/src', import.meta.url));
const interfaceNm = fileURLToPath(new URL('../../interface/node_modules', import.meta.url));
const enhancedSrc = fileURLToPath(new URL('../src', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()] as any,
  resolve: {
    alias: [
      {
        find: '@consona/interface/styles.css',
        replacement: `${interfaceSrc}/theme/styles.css`,
      },
      {
        find: '@consona/interface/registry',
        replacement: `${interfaceSrc}/registry/index.ts`,
      },
      {
        find: /^@consona\/interface$/,
        replacement: `${interfaceSrc}/index.ts`,
      },
      {
        find: /^@consona\/interface\/(.*)$/,
        replacement: `${interfaceSrc}/$1`,
      },
      {
        find: /^@consona\/avatar-enhanced$/,
        replacement: `${enhancedSrc}/index.ts`,
      },
      {
        find: /^@consona\/avatar-enhanced\/(.*)$/,
        replacement: `${enhancedSrc}/$1`,
      },
      {
        find: '@heroicons/react',
        replacement: `${interfaceNm}/@heroicons/react`,
      },
      {
        find: 'react-aria-components',
        replacement: `${interfaceNm}/react-aria-components`,
      },
      {
        find: 'input-otp',
        replacement: `${interfaceNm}/input-otp`,
      },
    ],
    // single three instance for the app and ../src (avatar adapter)
    dedupe: ['react', 'react-dom', 'three'],
  },
  server: {
    port: 5174,
    host: true,
    fs: {
      allow: [avatarRoot, fileURLToPath(new URL('../..', import.meta.url))],
    },
  },
});
