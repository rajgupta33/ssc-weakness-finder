import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/*.test.js"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
