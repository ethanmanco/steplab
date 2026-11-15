import { defineConfig } from "vitest/config";

// GitHub Pages serves the site from /steplab/, local dev serves from /.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/steplab/" : "/",
  test: {
    include: ["tests/**/*.test.ts"],
  },
}));
