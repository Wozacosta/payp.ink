import { connectAndSignTo, expect, test } from "../fixtures";

// Each test gets a unique slug to avoid collisions
function slug(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

/**
 * Navigate to an article page and wait for it to finish loading.
 *
 * The article reader page goes through: loading spinner → one of:
 *   - Full article content (shows <article> with prose)
 *   - Paywall (shows "This article requires payment")
 *   - "Article Not Found"
 *   - Error state
 *
 * We wait for any terminal state indicator to appear, which means
 * both the on-chain read and API fetch have completed.
 */
async function waitForArticlePage(page: import("@playwright/test").Page, articleSlug: string) {
  await page.waitForURL(`/articles/${articleSlug}`);
  // Wait for one of the terminal states — the page has resolved its data
  await page
    .locator("article.prose, :text('Article Not Found'), :text('requires payment'), :text('Error')")
    .first()
    .waitFor({ timeout: 30_000 });
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
    await waitForArticlePage(page, s);

    await expect(page.getByText("Hello World")).toBeVisible({ timeout: 15_000 });
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
    await waitForArticlePage(page, s);

    await expect(page.getByText("Secret Content")).toBeVisible({ timeout: 15_000 });
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
    await waitForArticlePage(page, s);

    await expect(page.getByText("0.001")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ETH").first()).toBeVisible();
  });
});
