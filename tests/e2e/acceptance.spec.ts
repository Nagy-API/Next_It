import { expect, test, type Page } from "@playwright/test";

/** The four acceptance scenarios from the brief, driven through the real UI. Runs against a freshly seeded database. */

const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Nexora@2026";

async function login(page: Page, username: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill("#username", username);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function openItem(page: Page, brandSlug: string, title: string, month = "2026-10") {
  await page.goto(`/brands/${brandSlug}?m=${month}`);
  await page.getByRole("link", { name: title, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).last()).toBeVisible();

test.describe.serial("NEXORA acceptance", () => {
  test("login is required and wrong passwords are rejected", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await page.fill("#username", "king");
    await page.fill("#password", "wrong-password");
    await page.click("button[type=submit]");
    await expect(page.getByText("Wrong username or password.")).toBeVisible();
  });

  test("Scenario 1 — The Ampoule: Media → Social → Published, all automatic", async ({ page }) => {
    // Ayman picks up the Reel King already delivered.
    await login(page, "ayman");
    await openItem(page, "vanilla-roza", "The Ampoule");
    await expect(page.getByText("Waiting for someone to pick it up")).toBeVisible();
    await page.getByRole("button", { name: "I’ll take it" }).click();
    await expect(page.getByText("With Ayman")).toBeVisible();

    await page.fill("#driveUrl", "https://drive.google.com/file/d/the-ampoule-final");
    await page.getByRole("button", { name: /Submit final video/ }).click();
    await toast(page, "Sent to Social Media.");
    await expect(page.getByText("Social Media", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Drive file/ })).toHaveAttribute("href", "https://drive.google.com/file/d/the-ampoule-final");

    // Esraa publishes on Instagram and TikTok; Facebook & LinkedIn stay "Not planned".
    await login(page, "esraa");
    await openItem(page, "vanilla-roza", "The Ampoule");
    await page.getByLabel("Instagram status").selectOption("published");
    await toast(page, "Saved.");
    await page.getByPlaceholder("Paste the live post link").first().fill("https://www.instagram.com/p/ampoule");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(page.getByRole("link", { name: "Live post" }).first()).toBeVisible();

    await page.getByLabel("TikTok status").selectOption("published");
    await expect(page.getByText("Published").first()).toBeVisible();
    await expect(page.getByText(/completed Social Media.*Published/)).toBeVisible();
    await expect(page.getByLabel("Facebook status")).toHaveValue("not_planned");

    // The history shows who did what, automatically.
    await expect(page.getByText("Ayman completed Media Production → Social Media is now current.")).toBeVisible();
    await expect(page.getByText(/Ayman added the Drive link/)).toBeVisible();
  });

  test("Bulk add a month by pasting, then Content hands off to Media", async ({ page }) => {
    await login(page, "king");
    await page.goto("/add?brand=vanilla-roza&m=2026-11");
    await page.getByRole("button", { name: "Paste a list" }).click();
    await page
      .locator("textarea")
      .first()
      .fill(["Late Reel\thttps://canva.link/late-reel\t3/11/2026", "Revision Reel | Reel | 5 Nov", "Post 01: November Hello | 7 Nov", "OFF"].join("\n"));
    await page.getByRole("button", { name: /Read 3 items/ }).click();
    await expect(page.getByText("3 items", { exact: true })).toBeVisible();
    await expect(page.getByText(/2 Reels · 1 Static/)).toBeVisible();
    await page.getByRole("button", { name: "Add 3 items" }).click();
    await expect(page).toHaveURL(/\/brands\/vanilla-roza\?m=2026-11/);
    await expect(page.getByRole("link", { name: "Late Reel", exact: true })).toBeVisible();

    await openItem(page, "vanilla-roza", "Revision Reel", "2026-11");
    await expect(page.getByText("With King")).toBeVisible(); // brand default creator
    await page.getByRole("button", { name: /Content is ready/ }).click();
    await toast(page, "Sent to Media Production.");
    await expect(page.getByText(/Arrived .* from King \(Content\)/)).toBeVisible();
  });

  test("Scenario 2 — late Content shifts the Media deadline, Media is never blamed", async ({ page }) => {
    await login(page, "ammar");
    await openItem(page, "vanilla-roza", "Late Reel", "2026-11");
    const stageRows = page.locator("section", { hasText: "Plan ahead" });
    // Content deadline 3 days ago, Media deadline yesterday (container date is used as "today").
    const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date()));
    const shift = (d: number) => {
      const x = new Date(`${today}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + d);
      return x.toISOString().slice(0, 10);
    };
    await stageRows.getByLabel("Deadline").nth(0).fill(shift(-3));
    await toast(page, "Deadline saved.");
    await stageRows.getByLabel("Deadline").nth(1).fill(shift(-1));
    await toast(page, "Deadline saved.");
    await page.reload();
    await expect(page.getByText("Waiting on previous stage — not late")).toBeVisible();
    await expect(page.getByText("3 days late").first()).toBeVisible();

    await page.getByRole("button", { name: /Content is ready/ }).click();
    await toast(page, "Sent to Media Production.");
    await expect(page.getByText(/Deadline moved from/)).toBeVisible();
    await expect(page.getByText(/Shifted by 3 days because Content was delivered late/).first()).toBeVisible();
    await expect(page.getByText(/Media Production deadline moved/)).toBeVisible();

    // Mark Content's lateness as an exception.
    await page.getByRole("button", { name: "Mark as exception" }).click();
    await toast(page, /won't count as late/);
    await expect(page.getByText("Late · exception").first()).toBeVisible();
  });

  test("Scenario 3 — send a Reel back from Media to Content with a note, then continue", async ({ page }) => {
    await login(page, "assem");
    await openItem(page, "vanilla-roza", "The Oil");
    await page.getByRole("button", { name: "Send back" }).click();
    await page.getByPlaceholder("What needs to change? (optional)").fill("The script needs a stronger hook.");
    await page.getByRole("button", { name: "Send back to Content" }).click();
    await toast(page, "Sent back to Content.");
    await expect(page.getByText("Assem sent this back")).toBeVisible();
    await expect(page.getByText("Returned to Content").first()).toBeVisible();
    await expect(page.getByText(/Assem returned the work from Media Production to Content/)).toBeVisible();

    await login(page, "king");
    await openItem(page, "vanilla-roza", "The Oil");
    await page.getByRole("button", { name: /Content is ready/ }).click();
    await toast(page, "Sent to Media Production.");
  });

  test("Scenario 4 — SINAI one-off project: 5 Reels, delivered, no Social stage", async ({ page }) => {
    await login(page, "ammar");
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByPlaceholder("e.g. SINAI").fill("SINAI");
    await page.getByPlaceholder("e.g. Summer Campaign").fill("Summer Campaign");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { name: "Summer Campaign" })).toBeVisible();

    await page.getByRole("link", { name: "Add deliverables" }).first().click();
    await page.getByRole("button", { name: "Paste a list" }).click();
    await page.locator("textarea").first().fill("Reel 1\nReel 2\nReel 3\nReel 4\nReel 5");
    await page.getByRole("button", { name: /Read 5 items/ }).click();
    await page.getByText("Content is already done").click();
    await page.getByRole("button", { name: "Add 5 items" }).click();
    await expect(page.getByText("0/5")).toBeVisible();

    await page.getByRole("link", { name: "Reel 1", exact: true }).click();
    await expect(page.getByText("Social Media")).toHaveCount(0);
    await page.fill("#driveUrl", "https://drive.google.com/sinai-reel-1");
    await page.getByRole("button", { name: /Submit final video/ }).click();
    await toast(page, "Sent to Delivery.");
    await page.getByRole("button", { name: /Mark as delivered/ }).click();
    await toast(page, "Done — nice work.");
    await expect(page.getByText("Delivered").first()).toBeVisible();

    // Client comes back: same client, second project.
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByPlaceholder("e.g. SINAI").fill("sinai");
    await page.getByPlaceholder("e.g. Summer Campaign").fill("Winter Campaign");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "SINAI", level: 2 })).toHaveCount(1);
    await expect(page.getByText("2 projects")).toBeVisible();
  });

  test("Archive a brand without losing history, and bring it back", async ({ page }) => {
    await login(page, "shahenda");
    await page.goto("/settings/brands");
    const row = page.locator("#og-hub");
    await row.getByRole("button", { name: "Make inactive" }).click();
    await toast(page, "Brand moved to the archive.");
    await page.goto("/brands");
    await expect(page.getByRole("heading", { name: /Archive/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /OG Hub Archived/ })).toBeVisible();
    await page.goto("/settings/brands");
    await page.locator("#og-hub").getByRole("button", { name: "Reactivate" }).click();
    await toast(page, "Brand reactivated.");
  });

  test("Admins create accounts; new people can sign in", async ({ page }) => {
    await login(page, "shahenda");
    await page.goto("/settings/people");
    await page.getByRole("button", { name: "New account" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Nour");
    await page.getByLabel("Username (for signing in)").fill("nour");
    await page.getByLabel(/Temporary password/).fill("welcome-nour-1");
    await page.locator("form label", { hasText: "Social Media" }).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await toast(page, /Account created for Nour/);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill("#username", "nour");
    await page.fill("#password", "welcome-nour-1");
    await page.click("button[type=submit]");
    await expect(page.getByRole("heading", { name: /, Nour/ })).toBeVisible();

    // Non-admins don't get account controls.
    await page.goto("/settings/people");
    await expect(page.getByRole("button", { name: "New account" })).toHaveCount(0);
  });

  test("Search, history and insights reflect the work", async ({ page }) => {
    await login(page, "shahenda");
    await page.getByPlaceholder(/Search content/).fill("ampoule");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "The Ampoule" })).toBeVisible();

    await page.goto("/activity");
    await expect(page.getByText("can’t be edited or deleted")).toBeVisible();
    await expect(page.getByText(/Esraa marked TikTok as Published/)).toBeVisible();

    await page.goto("/team/ayman?range=last_30");
    await expect(page.getByText("The Ampoule")).toBeVisible();
  });
});
