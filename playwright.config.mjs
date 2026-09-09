import { defineConfig } from "@playwright/test";
// Local test traffic must not be sent to a corporate HTTP proxy.
for (const key of ["NO_PROXY", "no_proxy"]) {
  process.env[key] = [process.env[key], "127.0.0.1", "localhost"]
    .filter(Boolean)
    .join(",");
}
const port = process.env.BROWSER_TEST_PORT || "18743";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1100, height: 900 },
    launchOptions: process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : {},
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: `http://127.0.0.1:${port}`,
    env: { PORT: port },
    reuseExistingServer: false,
  },
});
