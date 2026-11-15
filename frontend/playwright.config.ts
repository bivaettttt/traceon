import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  expect: { timeout: 12_000 },
  use: {
    baseURL: process.env.TRACEON_URL ?? "http://127.0.0.1:8101",
    video: process.env.TRACEON_VIDEO
      ? { mode: "on", size: { width: 1280, height: 720 } }
      : "off",
  },
});
