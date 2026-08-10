import { defineConfig } from "vitest/config";

/**
 * Minimal vitest config. The only purpose is to enable tsconfig `paths`
 * resolution (`@/* -> ./*`) so route-handler tests can import app/
 * modules that use the `@/` alias (Vite does not enable this by default).
 * Everything else uses vitest defaults.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
});
