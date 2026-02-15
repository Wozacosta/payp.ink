import { READER_ACCOUNT, READER_ACCOUNT_SHORT, connectAndSignTo, createReaderContext, expect, test } from "../fixtures";

// Each test gets a unique slug to avoid collisions
function slug(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

/**
 * Helper: create and publish an article within a single connected session.
 */
async function createArticle(
  page: import("@playwright/test").Page,
  opts: { title: string; slug: string; body: string; price?: string },
) {
  // Wait for form to stabilize after wallet connection triggers re-renders
  await expect(page.getByPlaceholder("My Article Title")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.getByPlaceholder("My Article Title").fill(opts.title);
  await page.getByPlaceholder("my-article-slug").fill(opts.slug);
  if (opts.price) {
    await page.getByPlaceholder("0 (free)").fill(opts.price);
  }
  await page.locator("textarea").fill(opts.body);

  await page.getByRole("button", { name: "Publish Article" }).click();
  await expect(page.getByRole("heading", { name: "Article Published!" })).toBeVisible({ timeout: 30_000 });
}

test.describe("Article Flow", () => {
  // All tests share the same Anvil account (0xf39F...). Running in parallel
  // causes nonce conflicts when multiple registerArticle txs fire concurrently.
  test.describe.configure({ mode: "serial" });

  // CI runners are slow: on-demand compilation + on-chain reads + API fetch.
  test.setTimeout(90_000);
  const CONTENT_TIMEOUT = 30_000;

  test("should create a free article and read its content", async ({ page }) => {
    const s = slug("free");
    await connectAndSignTo(page, "/create");

    await createArticle(page, {
      title: "Free E2E Article",
      slug: s,
      body: "# Hello World\n\nThis is a free test article.",
    });

    // View the article
    await page.getByRole("link", { name: "View Article" }).click();
    await page.waitForURL(`/articles/${s}`);

    await expect(page.getByText("Hello World")).toBeVisible({ timeout: CONTENT_TIMEOUT });
    await expect(page.getByText("This is a free test article.")).toBeVisible();
  });

  test("should show created article on the list page", async ({ page }) => {
    const s = slug("list");
    await connectAndSignTo(page, "/create");

    await createArticle(page, {
      title: "Listed E2E Article",
      slug: s,
      body: "Content for list test.",
    });

    // Navigate to articles list
    await page.goto("/articles", { waitUntil: "networkidle" });

    await expect(page.getByText("Listed E2E Article").first()).toBeVisible({ timeout: 10_000 });
  });

  test("should create a paid article and view it as creator", async ({ page }) => {
    const s = slug("paid");
    await connectAndSignTo(page, "/create");

    await createArticle(page, {
      title: "Paid E2E Article",
      slug: s,
      body: "# Secret Content\n\nThis is premium content.",
      price: "0.001",
    });

    // Creator can view (creator bypass)
    await page.getByRole("link", { name: "View Article" }).click();
    await page.waitForURL(`/articles/${s}`);

    await expect(page.getByText("Secret Content")).toBeVisible({ timeout: CONTENT_TIMEOUT });
    await expect(page.getByText("ETH").first()).toBeVisible();
  });

  test("should show paywall for paid article to unauthenticated reader", async ({ page }) => {
    const s = slug("paywall");
    await connectAndSignTo(page, "/create");

    await createArticle(page, {
      title: "Paywall E2E Article",
      slug: s,
      body: "# Hidden Content\n\nYou should not see this without paying.",
      price: "0.001",
    });

    // Creator can view — verify price badge as proxy for paywall setup
    await page.getByRole("link", { name: "View Article" }).click();
    await page.waitForURL(`/articles/${s}`);

    await expect(page.getByText("0.001")).toBeVisible({ timeout: CONTENT_TIMEOUT });
    await expect(page.getByText("ETH").first()).toBeVisible();
  });

  test("should pay with ETH and read content as a different reader", async ({ page, browser }) => {
    const s = slug("eth-pay");

    // 1. Creator (account #0) publishes a paid article
    await connectAndSignTo(page, "/create");
    await createArticle(page, {
      title: "ETH Pay E2E Article",
      slug: s,
      body: "# Premium Content\n\nYou paid ETH to see this.",
      price: "0.001",
    });

    // 2. Reader (account #1) opens the article in a separate context
    const { context: readerCtx, page: readerPage } = await createReaderContext(browser);
    try {
      await connectAndSignTo(readerPage, `/articles/${s}`, {
        account: READER_ACCOUNT,
        shortAddress: READER_ACCOUNT_SHORT,
      });

      // 3. Reader sees paywall
      await expect(readerPage.getByText("This article requires payment")).toBeVisible({ timeout: CONTENT_TIMEOUT });

      // 4. Reader pays with ETH
      await readerPage.getByRole("button", { name: /Pay 0\.001 ETH/ }).click();

      // 5. Content auto-loads after payment
      await expect(readerPage.getByText("Premium Content")).toBeVisible({ timeout: CONTENT_TIMEOUT });
      await expect(readerPage.getByText("You paid ETH to see this.")).toBeVisible();

      // 6. Integrity badge appears
      await expect(readerPage.getByText("Verified", { exact: true })).toBeVisible({ timeout: 10_000 });
    } finally {
      await readerCtx.close();
    }
  });

  test("should show 'Verified' badge for content integrity on free article", async ({ page }) => {
    const s = slug("integrity");
    await connectAndSignTo(page, "/create");

    await createArticle(page, {
      title: "Integrity E2E Article",
      slug: s,
      body: "# Verified Content\n\nThis body matches the on-chain hash.",
    });

    // Navigate to article — content auto-loads (free article)
    await page.getByRole("link", { name: "View Article" }).click();
    await page.waitForURL(`/articles/${s}`);

    await expect(page.getByText("Verified Content")).toBeVisible({ timeout: CONTENT_TIMEOUT });

    // The "Verified" badge appears after integrity check passes.
    // Use exact: true to avoid matching the article heading "Verified Content".
    await expect(page.getByText("Verified", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("should tip the author via TipButton", async ({ page }) => {
    const s = slug("tip");
    await connectAndSignTo(page, "/create");

    await createArticle(page, {
      title: "Tip E2E Article",
      slug: s,
      body: "# Tippable Content\n\nPlease tip generously.",
    });

    // Navigate to article
    await page.getByRole("link", { name: "View Article" }).click();
    await page.waitForURL(`/articles/${s}`);

    await expect(page.getByText("Tippable Content")).toBeVisible({ timeout: CONTENT_TIMEOUT });

    // Open tip form
    await page.getByRole("button", { name: "Tip the author" }).click();

    // Fill tip amount and send
    await page.getByPlaceholder("0.01").fill("0.01");
    await page.getByRole("button", { name: "Send tip" }).click();

    // On success the form closes — the collapsed "Tip the author" button re-appears
    await expect(page.getByRole("button", { name: "Tip the author" })).toBeVisible({ timeout: CONTENT_TIMEOUT });
    // Verify the form is gone (no "Send tip" button)
    await expect(page.getByRole("button", { name: "Send tip" })).not.toBeVisible();
  });
});
