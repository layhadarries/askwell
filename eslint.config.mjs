import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: { next: { rootDir: 'apps/web' }, react: { version: '19' } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
  globalIgnores(['**/.next/**', '**/dist/**', '**/node_modules/**', 'apps/web/next-env.d.ts']),
]);
