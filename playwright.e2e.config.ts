import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run seed:e2e && npm run dev:web -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/login",
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      AUTH_URL: "http://127.0.0.1:3100",
      AI_DEMO_OUTPUT_ROOT: "/tmp/ai-demo-agent-e2e-output",
    },
  },
});
