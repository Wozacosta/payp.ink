import { TEST_ACCOUNT_SHORT, connectAndSignTo, expect, test } from "../fixtures";

test.describe("Connect Wallet", () => {
  test("should connect wallet and complete SIWE sign-in", async ({ page }) => {
    // Connect + SIWE, then navigate directly to /create
    await connectAndSignTo(page, "/create");

    // Verify address is displayed in the header
    await expect(page.getByText(TEST_ACCOUNT_SHORT).first()).toBeVisible();

    // Verify SIWE session is active (form should be visible, not "Sign in" message)
    await expect(page.getByPlaceholder("My Article Title")).toBeVisible({ timeout: 5_000 });
  });
});
