import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "authjs.session-token", value: "e2e-session-token", domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
});

test("reviews media, edits and approves X independently, and shows published LinkedIn", async ({ page }) => {
  await page.goto("/projects/e2e-project");
  await expect(page.getByRole("heading", { name: "Evidence-grounded launch" })).toBeVisible();
  await expect(page.locator("video")).toHaveAttribute("src", "/api/media/e2e-video");

  const range = await page.request.get("/api/media/e2e-video", { headers: { Range: "bytes=10-19" } });
  expect(range.status()).toBe(206);
  expect(range.headers()["content-range"]).toBe("bytes 10-19/1024");

  const xDraft = page.getByLabel("X draft");
  await xDraft.fill("An edited verified review. https://github.com/example/product");
  await page.getByRole("button", { name: "Save X draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await page.getByRole("button", { name: "Approve saved draft" }).click();
  await expect(page.getByText("X draft approved. Nothing was published.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish approved post" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "View published post" })).toHaveAttribute("href", /linkedin\.com/);
});
