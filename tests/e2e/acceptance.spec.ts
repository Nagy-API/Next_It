import { expect, test, type Page } from "@playwright/test";

/** Acceptance scenarios, driven through the real UI as each team member. Runs against a freshly seeded database. */

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
const card = (page: Page, title: string) => page.locator(".card", { has: page.getByRole("link", { name: title, exact: true }) }).first();

test.describe.serial("NEXORA acceptance", () => {
  test("login is required; each person lands on the right page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await page.fill("#username", "king");
    await page.fill("#password", "wrong-password");
    await page.click("button[type=submit]");
    await expect(page.getByText("Wrong username or password.")).toBeVisible();

    await login(page, "gannah");
    await expect(page).toHaveURL(/\/my-work/);
    await expect(page.getByRole("heading", { name: /Hi Gannah/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add content" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

    await login(page, "shahenda");
    await expect(page).toHaveURL(/\/overview/);
  });

  test("Scenario 1 — The Ampoule: Media pastes the Drive link, Social pastes live links → Published", async ({ page }) => {
    await login(page, "ayman");
    await openItem(page, "vanilla-roza", "The Ampoule");
    await expect(page.getByText("Waiting for someone to pick it up")).toBeVisible();
    await page.getByRole("button", { name: "I’ll take it" }).click();
    await expect(page.getByText("With Ayman")).toBeVisible();
    await page.getByLabel(/Google Drive link to the final video/).fill("https://drive.google.com/file/d/the-ampoule-final");
    await page.getByRole("button", { name: /Send to Social Media/ }).click();
    await toast(page, "Sent to the Social Media team.");
    await expect(page.getByRole("link", { name: /Drive file/ })).toHaveAttribute("href", "https://drive.google.com/file/d/the-ampoule-final");

    // Esraa picks the platforms, then pastes live links from her task list — pasting the link marks it Published.
    await login(page, "esraa");
    await openItem(page, "vanilla-roza", "The Ampoule");
    await page.getByLabel("Instagram status").selectOption("pending");
    await toast(page, "Saved.");
    await page.getByLabel("TikTok status").selectOption("pending");
    await toast(page, "Saved.");
    await page.goto("/my-work");
    await card(page, "The Ampoule").getByPlaceholder(/Instagram post link/).fill("https://www.instagram.com/p/ampoule");
    await card(page, "The Ampoule").getByRole("button", { name: "Published" }).first().click();
    await toast(page, "Saved.");
    await card(page, "The Ampoule").getByPlaceholder(/TikTok post link/).fill("https://www.tiktok.com/@vr/video/1");
    await card(page, "The Ampoule").getByRole("button", { name: "Published" }).click();
    await toast(page, "Saved.");

    await openItem(page, "vanilla-roza", "The Ampoule");
    await expect(page.getByText("Published").first()).toBeVisible();
    await expect(page.getByLabel("Facebook status")).toHaveValue("not_planned");
    await page.getByText("History").click();
    await expect(page.getByText("Ayman completed Media Production → Social Media is now current.")).toBeVisible();
    await expect(page.getByText(/Esraa .*TikTok as Published/)).toBeVisible();
  });

  test("Adding content: rows with a Canva link go to their team automatically", async ({ page }) => {
    await login(page, "king");
    await page.goto("/add?brand=vanilla-roza&m=2026-11");
    await page.getByRole("button", { name: "Paste a list" }).click();
    await page
      .locator("textarea")
      .first()
      .fill(["Late Reel\t3/11/2026", "Revision Reel | Reel | 5 Nov", "Post 01: November Hello | https://canva.link/nov-hello | 7 Nov", "OFF"].join("\n"));
    await page.getByRole("button", { name: /Read 3 items/ }).click();
    await expect(page.getByText(/2 Reels · 1 Static/)).toBeVisible();
    await page.getByRole("button", { name: "Add 3 items" }).click();
    await expect(page).toHaveURL(/\/brands\/vanilla-roza\?m=2026-11/);

    // The post had its Canva link → already with Graphic Design; the reels wait with King.
    await page.goto("/brands/vanilla-roza?m=2026-11&team=design");
    await expect(page.getByText("Waiting for Design team")).toBeVisible();
    await page.goto("/my-work");
    await expect(card(page, "Revision Reel")).toBeVisible();

    // King pastes the Canva link right in his task list → sent to Media, time recorded.
    await card(page, "Revision Reel").getByPlaceholder(/Canva link/).fill("https://canva.link/revision-reel");
    await card(page, "Revision Reel").getByRole("button", { name: /Send to Media Production/ }).click();
    await toast(page, "Sent to the Media Production team.");
    await expect(page.getByRole("link", { name: "Revision Reel", exact: true })).toHaveCount(0);
  });

  test("Scenario 2 — late Content shifts the Media deadline; only an admin can excuse it", async ({ page }) => {
    await login(page, "ammar");
    await openItem(page, "vanilla-roza", "Late Reel", "2026-11");
    await page.getByText("More details").click();
    const steps = page.locator("details");
    const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date()));
    const shift = (d: number) => {
      const x = new Date(`${today}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + d);
      return x.toISOString().slice(0, 10);
    };
    await steps.getByLabel("Deadline").nth(0).fill(shift(-3));
    await toast(page, "Deadline saved.");
    await steps.getByLabel("Deadline").nth(0).fill(shift(-1)); // now the Media row (Content's deadline is locked)
    await toast(page, "Deadline saved.");
    await page.reload();
    await page.getByText("More details").click();
    await expect(page.getByText("Waiting on previous stage — not late")).toBeVisible();
    await expect(page.getByText("3 days late").first()).toBeVisible();

    await page.getByLabel(/Canva link to this content/).fill("https://canva.link/late-reel");
    await page.getByRole("button", { name: /Send to Media Production/ }).click();
    await toast(page, "Sent to the Media Production team.");
    await expect(page.getByText(/Deadline moved from/)).toBeVisible();
    await expect(page.getByText(/Shifted by 3 days because Content was delivered late/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as exception" })).toHaveCount(0);

    await login(page, "shahenda");
    await openItem(page, "vanilla-roza", "Late Reel", "2026-11");
    await page.getByText("More details").click();
    await page.getByRole("button", { name: "Mark as exception" }).click();
    await toast(page, /won't count as late/);
  });

  test("Scenario 3 — send a Reel back from Media to Content with a note, then continue", async ({ page }) => {
    await login(page, "assem");
    await openItem(page, "vanilla-roza", "The Oil");
    await page.getByRole("button", { name: "Send back" }).click();
    await page.getByPlaceholder("What needs to change? (optional)").fill("The script needs a stronger hook.");
    await page.getByRole("button", { name: "Send back to Content" }).click();
    await toast(page, "Sent back to Content.");
    await expect(page.getByText("Assem sent this back")).toBeVisible();

    await login(page, "king");
    await page.goto("/my-work");
    await expect(card(page, "The Oil").getByText(/Sent back by Assem/)).toBeVisible();
    await card(page, "The Oil").getByRole("button", { name: /Send to Media Production/ }).click();
    await toast(page, "Sent to the Media Production team.");
  });

  test("Scenario 4 — SINAI one-off project: Content → Media → Delivered", async ({ page }) => {
    await login(page, "ammar");
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByPlaceholder("e.g. SINAI").fill("SINAI");
    await page.getByPlaceholder("e.g. Summer Campaign").fill("Summer Campaign");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { name: "Summer Campaign" })).toBeVisible();

    await page.getByRole("link", { name: "Add deliverables" }).first().click();
    await page.getByRole("button", { name: "Paste a list" }).click();
    await page
      .locator("textarea")
      .first()
      .fill(["Reel 1 https://canva.link/s1", "Reel 2 https://canva.link/s2", "Reel 3 https://canva.link/s3", "Reel 4 https://canva.link/s4", "Reel 5 https://canva.link/s5"].join("\n"));
    await page.getByRole("button", { name: /Read 5 items/ }).click();
    await page.getByRole("button", { name: "Add 5 items" }).click();
    await expect(page.getByText("0/5")).toBeVisible();

    await login(page, "ayman");
    await card(page, "Reel 1").getByPlaceholder(/Google Drive link/).fill("https://drive.google.com/sinai-reel-1");
    await card(page, "Reel 1").getByRole("button", { name: /Done — send to Delivery/ }).click();
    await toast(page, "Sent to the Delivery team.");

    await login(page, "assem");
    await page.goto("/my-work");
    await card(page, "Reel 1").getByRole("button", { name: /Mark as delivered/ }).click();
    await toast(page, "Done — nice work.");

    await login(page, "ammar");
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByPlaceholder("e.g. SINAI").fill("sinai");
    await page.getByPlaceholder("e.g. Summer Campaign").fill("Winter Campaign");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "SINAI", level: 2 })).toHaveCount(1);
    await expect(page.getByText("2 projects")).toBeVisible();
  });

  test("Content chooses the team, person and deadline; deadlines lock; team members pick up work", async ({ page }) => {
    await login(page, "king");
    await page.goto("/add?brand=vanilla-roza&m=2026-12");
    await page.getByLabel("Title").first().fill("Cover Reel");
    await page.getByRole("button", { name: "Add 1 item" }).click();
    await expect(page).toHaveURL(/m=2026-12/);
    await openItem(page, "vanilla-roza", "Cover Reel", "2026-12");
    await page.getByLabel(/Canva link to this content/).fill("https://canva.link/cover-reel");
    await page.getByRole("button", { name: /Graphic Design/ }).click();
    await page.getByLabel(/Who\?/).selectOption({ label: "Gannah" });
    await page.getByLabel(/Deadline/).first().fill("2026-12-05");
    await page.getByRole("button", { name: "Send to Gannah" }).click();
    await toast(page, "Sent to Gannah (Graphic Design).");
    await expect(page.getByTitle(/can't be changed once set/).first()).toBeVisible();

    await login(page, "gannah");
    await card(page, "Cover Reel").getByPlaceholder(/Google Drive link/).fill("https://drive.google.com/cover-reel");
    await card(page, "Cover Reel").getByRole("button", { name: /Done — send to Social/ }).click();
    await toast(page, "Sent to the Social Media team.");

    await login(page, "ayman");
    await expect(card(page, "The Wall").getByText("NEW for your team")).toBeVisible();
    await card(page, "The Wall").getByRole("button", { name: /take it/ }).click();
    await expect(card(page, "The Wall").getByText("NEW for your team")).toHaveCount(0);

    // Ayman can't do Design's work or edit content.
    await openItem(page, "vanilla-roza", "Post 02: Talk To Me");
    await expect(page.getByText(/This step belongs to the/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

    await page.goto("/brands/vanilla-roza?m=2026-10&team=design");
    await expect(page.getByRole("link", { name: "Post 02: Talk To Me", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "The Wall", exact: true })).toHaveCount(0);
  });

  test("Comments: write to a person, they see it in My tasks and reply", async ({ page }) => {
    await login(page, "king");
    await openItem(page, "vanilla-roza", "Post 02: Talk To Me");
    await page.getByPlaceholder("Write a comment…").fill("Please use the pink background");
    await page.getByLabel("Send to").selectOption({ label: "To: Gannah (waits for their reply)" });
    await page.getByRole("button", { name: "Post" }).click();
    await expect(page.getByText("Waiting for Gannah")).toBeVisible();

    await login(page, "gannah");
    await expect(page.getByText("Messages for you")).toBeVisible();
    await page.getByText("Please use the pink background").click();
    await page.locator("#comments").getByRole("button", { name: "Reply" }).first().click();
    await page.getByPlaceholder("Write a reply…").fill("Done, check the new version");
    await page.locator("#comments").getByRole("button", { name: "Reply" }).last().click();
    await expect(page.locator("#comments").getByText("Done, check the new version")).toBeVisible();
    await expect(page.locator("#comments").getByText("Done", { exact: true })).toBeVisible();
    await page.goto("/my-work");
    await expect(page.getByText("Messages for you")).toHaveCount(0);
  });

  test("Archive a brand without losing history, and bring it back (admin only)", async ({ page }) => {
    await login(page, "shahenda");
    await page.goto("/settings/brands");
    await page.locator("#og-hub").getByRole("button", { name: "Make inactive" }).click();
    await toast(page, "Brand moved to the archive.");
    await page.goto("/brands");
    await expect(page.getByRole("heading", { name: /Archive/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /OG Hub Archived/ })).toBeVisible();
    await page.goto("/settings/brands");
    await page.locator("#og-hub").getByRole("button", { name: "Reactivate" }).click();
    await toast(page, "Brand reactivated.");

    await login(page, "king");
    await page.goto("/settings/brands");
    await expect(page).toHaveURL(/\/settings\/account/);
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
    await expect(page.getByRole("heading", { name: /Hi Nour/ })).toBeVisible();
  });

  test("Search, history and insights reflect the work", async ({ page }) => {
    await login(page, "shahenda");
    await page.getByPlaceholder(/Search content/).fill("ampoule");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "The Ampoule" })).toBeVisible();
    await page.goto("/activity");
    await expect(page.getByText("can’t be edited or deleted")).toBeVisible();
    await page.goto("/team/ayman?range=last_30");
    await expect(page.getByText("The Ampoule")).toBeVisible();
  });
});
