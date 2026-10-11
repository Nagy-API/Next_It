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

/** Date fields read day first: "2026-10-03" → "03/10/2026". */
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).last()).toBeVisible();
const card = (page: Page, title: string) => page.locator("article.card", { has: page.getByRole("link", { name: title, exact: true }) }).first();

test.describe.serial("NEXORA acceptance", () => {
  test("login is required; each person lands on the right page; managers see manager tools", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await page.fill("#username", "king");
    await page.fill("#password", "wrong-password");
    await page.click("button[type=submit]");
    await expect(page.getByText("Wrong username or password.")).toBeVisible();

    await login(page, "gannah");
    await expect(page).toHaveURL(/\/my-work/);
    await expect(page.getByRole("heading", { name: /Gannah/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Add content" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Activity log" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Give a task" })).toHaveCount(0);
    await page.goto("/activity");
    await expect(page).toHaveURL(/\/my-work/);

    await login(page, "ammar");
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.getByRole("button", { name: "Give a task" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Activity log" })).toBeVisible();
  });

  test("Scenario 1 — The Ampoule: shoot → edit v1 → content creator approves → Social publishes", async ({ page }) => {
    // Ayman (default for shooting) plans the shoot and sends it to editing.
    await login(page, "ayman");
    await openItem(page, "vanilla-roza", "The Ampoule");
    await expect(page.getByText("With Ayman")).toBeVisible();
    await page.getByLabel("Shoot day").fill(dmy("2026-10-03"));
    await page.getByLabel("From", { exact: true }).fill("10:00");
    await page.getByLabel("To", { exact: true }).fill("12:00");
    await page.getByRole("button", { name: "Save shoot" }).click();
    await toast(page, "Shoot saved.");
    await expect(page.getByText(/Shoot Sat 3 Oct/).first()).toBeVisible();
    await page.getByRole("button", { name: /Shooting done, send to Jana/ }).click();
    await toast(page, "Sent to Jana (Post-production).");

    // Jana (editing) sends v1 from her task list.
    await login(page, "jana");
    await card(page, "The Ampoule").getByPlaceholder(/Drive link to v1/).fill("https://drive.google.com/file/d/the-ampoule-v1");
    await card(page, "The Ampoule").getByRole("button", { name: "Send v1 for approval" }).click();
    await toast(page, "v1 sent for approval.");

    // King (content creator) asks for changes, Jana sends v2, King approves → Social.
    await login(page, "king");
    await page.goto("/my-work"); // King is a manager too: he lands on the overview
    const review = page.locator("article.card", { has: page.getByRole("link", { name: "The Ampoule", exact: true }) }).first();
    await review.getByRole("button", { name: "Request changes" }).click();
    await review.getByLabel(/What should change in v1/).fill("Make the logo bigger at the end");
    await review.getByRole("button", { name: /ask for v2/ }).click();
    await toast(page, /Sent back for changes/);

    await login(page, "jana");
    await expect(card(page, "The Ampoule").getByText(/Make the logo bigger at the end/).first()).toBeVisible();
    await card(page, "The Ampoule").getByPlaceholder(/Drive link to v2/).fill("https://drive.google.com/file/d/the-ampoule-final");
    await card(page, "The Ampoule").getByRole("button", { name: "Send v2 for approval" }).click();
    await toast(page, "v2 sent for approval.");

    await login(page, "king");
    await page.goto("/my-work");
    await expect(page.getByText("Waiting for your approval")).toBeVisible();
    await page.getByRole("button", { name: /Approve v2, send to Esraa/ }).click();
    await toast(page, "Approved and sent to Esraa.");

    // Esraa picks the platforms, then pastes live links — pasting the link marks it Published.
    await login(page, "esraa");
    await openItem(page, "vanilla-roza", "The Ampoule");
    await expect(page.getByRole("link", { name: /Drive file/ })).toHaveAttribute("href", "https://drive.google.com/file/d/the-ampoule-final");
    // The Social step: tap each app it goes to (with its icon), then paste each live link.
    await page.getByRole("button", { name: "Instagram", exact: true }).click();
    await expect(page.getByPlaceholder(/Instagram link/)).toBeVisible();
    await page.getByRole("button", { name: "TikTok", exact: true }).click();
    await expect(page.getByPlaceholder(/TikTok link/)).toBeVisible();
    await page.goto("/my-work");
    await card(page, "The Ampoule").getByPlaceholder(/Instagram link/).fill("https://www.instagram.com/p/ampoule");
    await card(page, "The Ampoule").getByRole("button", { name: "Live" }).first().click();
    await toast(page, "Published!");
    await card(page, "The Ampoule").getByPlaceholder(/TikTok link/).fill("https://www.tiktok.com/@vr/video/1");
    await card(page, "The Ampoule").getByRole("button", { name: "Live" }).click();
    await toast(page, /Published everywhere/);

    await openItem(page, "vanilla-roza", "The Ampoule");
    await expect(page.getByText("Published").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Versions" })).toBeVisible();
    await page.getByText("History").click();
    await expect(page.getByText("King approved v2 of Post-production.")).toBeVisible();
    await expect(page.getByText(/Esraa .*TikTok as Published/)).toBeVisible();
  });

  test("Adding content: paste a list, rows with a Canva link go to their team automatically", async ({ page }) => {
    await login(page, "king");
    await page.goto("/add?brand=vanilla-roza&m=2026-11");
    await page.getByRole("button", { name: "Paste a list" }).click();
    await page.getByRole("button", { name: "Try the example" }).click();
    await expect(page.getByText("What we understood (4)")).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();
    await page
      .getByLabel(/one line = one post/)
      .fill(["Late Reel\t3/11/2026", "Revision Reel | Reel | 5 Nov", "Post 01: November Hello | https://canva.link/nov-hello | 7 Nov", "OFF"].join("\n"));
    await page.getByRole("button", { name: /Add 3 items to the list below/ }).click();
    await expect(page.getByText(/2 Reels · 1 Static/)).toBeVisible();
    await page.getByRole("button", { name: "Add 3 items" }).click();
    await expect(page).toHaveURL(/\/brands\/vanilla-roza\?m=2026-11/);

    // The post had its Canva link → already with the default designer; the reels wait with King.
    await page.goto("/brands/vanilla-roza?m=2026-11&team=design");
    await expect(page.getByRole("link", { name: "Post 01: November Hello", exact: true })).toBeVisible();
    await expect(page.getByText("Gannah").filter({ visible: true }).first()).toBeVisible(); // (phones show the name on a second line)
    await page.goto("/my-work");
    await expect(card(page, "Revision Reel")).toBeVisible();

    // King pastes the Canva link right in his task list → sent to shooting (Ayman), time recorded.
    await card(page, "Revision Reel").getByPlaceholder(/content link/i).fill("https://canva.link/revision-reel");
    await card(page, "Revision Reel").getByRole("button", { name: /Content ready, send to Ayman/ }).click();
    await toast(page, "Sent to Ayman (Pre-production).");
    await expect(page.getByRole("link", { name: "Revision Reel", exact: true })).toHaveCount(0);
  });

  test("Scenario 2 — late Content shifts the next deadline; only the admin can excuse it", async ({ page }) => {
    await login(page, "assem"); // a manager sets deadlines
    await openItem(page, "vanilla-roza", "Late Reel", "2026-11");
    await page.getByText("More details").click();
    const steps = page.locator("details").first();
    const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date()));
    const shift = (d: number) => {
      const x = new Date(`${today}T12:00:00Z`);
      x.setUTCDate(x.getUTCDate() + d);
      return x.toISOString().slice(0, 10);
    };
    await steps.getByLabel("Deadline").nth(0).fill(dmy(shift(-3)));
    await toast(page, "Deadline saved.");
    await steps.getByLabel("Deadline").nth(0).fill(dmy(shift(-1))); // now the Pre-production row (Content's deadline is locked)
    await toast(page, "Deadline saved.");
    await page.reload();
    await page.getByText("More details").click();
    await expect(page.getByText("Waiting on previous stage — not late")).toBeVisible();
    await expect(page.getByText("3 days late").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as exception" })).toHaveCount(0); // admins only

    await login(page, "king");
    await openItem(page, "vanilla-roza", "Late Reel", "2026-11");
    await page.getByLabel(/^Content link/).fill("https://canva.link/late-reel");
    await page.getByRole("button", { name: /Done, send to Ayman/ }).click();
    await toast(page, "Sent to Ayman (Pre-production).");
    await expect(page.getByText(/Deadline moved from/)).toBeVisible();
    await expect(page.getByText(/Shifted by 3 days because Content was delivered late/).first()).toBeVisible();

    await login(page, "shahenda");
    await openItem(page, "vanilla-roza", "Late Reel", "2026-11");
    await page.getByText("More details").click();
    await page.getByRole("button", { name: "Mark as exception" }).click();
    await toast(page, /won't count as late/);
  });

  test("Scenario 3 — send a Reel back to Content with a note, then continue", async ({ page }) => {
    await login(page, "assem");
    await openItem(page, "vanilla-roza", "The Oil");
    await page.getByRole("button", { name: "Send back" }).click();
    await expect(page.getByRole("dialog", { name: "Send it back for changes" })).toBeVisible();
    await page.getByLabel(/What needs to change/).fill("The script needs a stronger hook.");
    await page.getByRole("button", { name: "Send back to Content" }).click();
    await toast(page, "Sent back to Content.");
    await expect(page.getByText("Assem sent this back")).toBeVisible();

    await login(page, "king");
    await page.goto("/my-work");
    // He reads what to change, presses "OK, I'm on it" → Adjusting (the clock runs).
    await expect(card(page, "The Oil").getByText(/Changes requested by Assem/)).toBeVisible();
    await expect(card(page, "The Oil").getByText(/stronger hook/)).toBeVisible();
    await card(page, "The Oil").getByRole("button", { name: /I.m on it/ }).click();
    await toast(page, /On it/);
    await expect(card(page, "The Oil").getByRole("radio", { name: "Adjusting" })).toHaveAttribute("aria-checked", "true");
    await card(page, "The Oil").getByRole("button", { name: /Content ready, send to Ayman/ }).click();
    await toast(page, "Sent to Ayman (Pre-production).");
  });

  test("Scenario 4 — SINAI one-off project assigned to a content creator: Content → Shooting → Editing (approved) → Delivered", async ({ page }) => {
    await login(page, "ammar");
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByPlaceholder("e.g. SINAI").fill("SINAI");
    await page.getByPlaceholder("e.g. Summer Campaign").fill("Summer Campaign");
    await page.getByLabel("Assigned to (content)").selectOption({ label: "Ammar" });
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { name: "Summer Campaign" })).toBeVisible();
    await expect(page.getByText("Assigned to")).toBeVisible();

    await page.getByRole("link", { name: "Add deliverables" }).first().click();
    await page.getByRole("button", { name: "Paste a list" }).click();
    await page
      .getByLabel(/one line = one post/)
      .fill(["Reel 1 https://canva.link/s1", "Reel 2 https://canva.link/s2", "Reel 3 https://canva.link/s3", "Reel 4 https://canva.link/s4", "Reel 5 https://canva.link/s5"].join("\n"));
    await page.getByRole("button", { name: /Add 5 items to the list below/ }).click();
    await page.getByRole("button", { name: "Add 5 items" }).click();
    await expect(page.getByText("0/5")).toBeVisible();

    await login(page, "ayman");
    await page.goto("/my-work"); // Ayman is a manager: he lands on the overview
    await expect(card(page, "Reel 1").getByText("NEW for your team")).toBeVisible();
    await card(page, "Reel 1").getByRole("button", { name: /Shooting done, send to Editing/ }).click();
    await toast(page, "Sent to the Post-production team.");
    await card(page, "Reel 1").getByPlaceholder(/Drive link to v1/).fill("https://drive.google.com/sinai-reel-1");
    await card(page, "Reel 1").getByRole("button", { name: "Send v1 for approval" }).click();
    await toast(page, "v1 sent for approval.");

    await login(page, "ammar");
    await page.goto("/my-work");
    await page.getByRole("button", { name: /Approve v1, send to Assem/ }).click();
    await toast(page, "Approved and sent to Assem.");

    await login(page, "assem");
    await page.goto("/my-work");
    await card(page, "Reel 1").getByRole("button", { name: /Mark as delivered/ }).click();
    await toast(page, /Done. Nice work/);

    await login(page, "ammar");
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    await page.getByPlaceholder("e.g. SINAI").fill("sinai");
    await page.getByPlaceholder("e.g. Summer Campaign").fill("Winter Campaign");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("heading", { name: "Winter Campaign" })).toBeVisible();
    // Delete the empty one again (with a confirmation).
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete project" }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: "SINAI", level: 2 })).toHaveCount(1);
    await expect(page.getByText("1 project")).toBeVisible();
  });

  test("Content chooses the team; a manager sets the deadline and it locks; design goes through approval", async ({ page }) => {
    await login(page, "king");
    await page.goto("/add?brand=vanilla-roza&m=2026-12");
    await page.getByLabel("Title").first().fill("Cover Reel");
    await page.getByRole("button", { name: "Add 1 item" }).click();
    await expect(page).toHaveURL(/m=2026-12/);
    // Kemo (content creator) sends it on.
    await login(page, "kemo");
    await openItem(page, "vanilla-roza", "Cover Reel", "2026-12");
    await page.getByLabel(/^Content link/).fill("https://canva.link/cover-reel");
    await page.getByRole("radio", { name: /Graphic Design/ }).click();
    // Anyone sending work on may pick the person in that team, or themselves.
    await expect(page.getByRole("combobox", { name: "Who works on it?" })).toBeVisible();
    await page.getByRole("button", { name: /Done, send to Gannah/ }).click();
    await toast(page, "Sent to Gannah (Graphic Design).");

    await login(page, "assem");
    await openItem(page, "vanilla-roza", "Cover Reel", "2026-12");
    await page.getByLabel("Deadline").first().fill(dmy("2026-12-05"));
    await toast(page, "Deadline saved.");
    await page.reload();
    await expect(page.getByTitle(/can't be changed once set/).first()).toBeVisible();

    await login(page, "gannah");
    await page.getByRole("button", { name: /Notifications, \d+ need attention/ }).click();
    await expect(page.getByText("New task: Cover Reel")).toBeVisible();
    await page.keyboard.press("Escape");
    await card(page, "Cover Reel").getByRole("radio", { name: "In progress" }).click();
    await expect(card(page, "Cover Reel").getByRole("radio", { name: "In progress" })).toHaveAttribute("aria-checked", "true");
    await card(page, "Cover Reel").getByPlaceholder(/Drive link to v1/).fill("https://drive.google.com/cover-reel");
    await card(page, "Cover Reel").getByRole("button", { name: "Send v1 for approval" }).click();
    await toast(page, "v1 sent for approval.");

    await login(page, "king");
    await page.goto("/my-work");
    await page.getByRole("button", { name: /Approve v1, send to Esraa/ }).click();
    await toast(page, "Approved and sent to Esraa.");

    await login(page, "ayman");
    await page.goto("/my-work");
    await expect(card(page, "Reel 2").getByText("NEW for your team")).toBeVisible();
    await card(page, "Reel 2").getByRole("button", { name: /work on it/ }).click();
    await expect(card(page, "Reel 2").getByText("NEW for your team")).toHaveCount(0);

    // Jana (editing) can't do Design's work or edit content.
    await login(page, "jana");
    await openItem(page, "vanilla-roza", "Post 02: Talk To Me");
    await expect(page.getByText(/The Graphic Design team is working on it/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);

    await page.goto("/brands/vanilla-roza?m=2026-10&team=design");
    await expect(page.getByRole("link", { name: "Post 02: Talk To Me", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "The Wall", exact: true })).toHaveCount(0);
  });

  test("Comments: write to a person or @mention them; they see it and reply", async ({ page }) => {
    await login(page, "king");
    await openItem(page, "vanilla-roza", "Post 02: Talk To Me");
    await page.getByPlaceholder(/Write a comment/).fill("Please use the pink background");
    await page.getByLabel("Send to").selectOption({ label: "To: Gannah (waits for their reply)" });
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByText("Waiting for Gannah")).toBeVisible();

    await login(page, "gannah");
    await expect(page.getByText("Messages for you")).toBeVisible();
    await page.getByText("Please use the pink background").click();
    await page.locator("#comments").getByRole("button", { name: "Reply" }).first().click();
    await page.getByPlaceholder("Write a reply…").fill("Done, check the new version");
    await page.locator("#comments").getByRole("button", { name: "Reply" }).last().click();
    await expect(page.locator("#comments").getByText("Done, check the new version")).toBeVisible();
    await page.goto("/my-work");
    await expect(page.getByText("Messages for you")).toHaveCount(0);
  });

  test("Managers give tasks (one-off or repeating); the person ticks them off", async ({ page }) => {
    await login(page, "ammar");
    await page.getByRole("button", { name: "Give a task" }).click();
    const dlg = page.getByRole("dialog", { name: "Give a task" });
    await dlg.getByLabel("What needs to be done?").fill("Send the weekly report to Vanilla Roza");
    await dlg.getByRole("button", { name: "Esraa" }).click();
    await dlg.getByRole("button", { name: "King" }).click();
    await dlg.getByRole("radio", { name: "Every week" }).click();
    await dlg.getByRole("button", { name: "Send task" }).click();
    await toast(page, "Task sent to 2 people.");
    await page.goto("/my-work");
    await page.getByRole("link", { name: /Tasks I gave/ }).click();
    await expect(page).toHaveURL(/tab=given/);
    await expect(page.getByText("Send the weekly report to Vanilla Roza").first()).toBeVisible();

    // Approval by whoever gave it is the default: Esraa's tick sends it to Ammar.
    await login(page, "esraa");
    await expect(page.getByText("Tasks given to you")).toBeVisible();
    await page.getByRole("button", { name: "Done: Send the weekly report to Vanilla Roza" }).click();
    await toast(page, "Sent for approval.");
    await page.getByRole("link", { name: "This week" }).click();
    await expect(page).toHaveURL(/when=week/);

    await login(page, "ammar");
    await page.goto("/my-work");
    const approve = page.locator("#approve");
    await expect(approve.getByText("Send the weekly report to Vanilla Roza")).toBeVisible();
    await approve.getByRole("button", { name: /^Approve$/ }).first().click();
    await toast(page, "Done! The next one is already scheduled.");
  });

  test("Team chat: @mention someone and they're notified", async ({ page }) => {
    await login(page, "king");
    await page.getByRole("link", { name: /Team chat/ }).click();
    const box = page.getByLabel("Message");
    await box.fill("Morning team! @Gan");
    await page.getByRole("group", { name: "People to mention" }).getByRole("button", { name: /Gannah/ }).click();
    await box.pressSequentially("the new carousel is ready");
    await box.press("Enter");
    await expect(page.getByText("the new carousel is ready")).toBeVisible();

    await login(page, "gannah");
    await expect(page.getByRole("link", { name: /Team chat\s*1/ })).toBeVisible();
    await page.getByRole("button", { name: /Notifications/ }).click();
    await expect(page.getByText("King mentioned you in Team chat")).toBeVisible();
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
    // The edit popup is never cut off by the table.
    await page.locator("#blissify").getByRole("button", { name: "Edit brand" }).click();
    await expect(page.getByLabel("Calendar color")).toBeInViewport();
    await page.keyboard.press("Escape");

    await login(page, "esraa");
    await page.goto("/settings/brands");
    await expect(page).toHaveURL(/\/settings\/account/);
  });

  test("Admins create accounts and managers; new people can sign in", async ({ page }) => {
    await login(page, "shahenda");
    await page.goto("/settings/people");
    await page.getByRole("button", { name: "New account" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Nour");
    await page.getByLabel("Username (for signing in)").fill("nour");
    await page.getByLabel(/Temporary password/).fill("Welcome-Team-51");
    await page.locator("form label", { hasText: "Social Media" }).click();
    await page.getByRole("button", { name: "Create account" }).click();
    await toast(page, /Account created for Nour/);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.fill("#username", "nour");
    await page.fill("#password", "Welcome-Team-51");
    await page.click("button[type=submit]");
    // The password from the admin is temporary: nothing else until she picks her own.
    await expect(page.getByRole("heading", { name: "Welcome, Nour" })).toBeVisible();
    await page.goto("/my-work");
    await expect(page.getByRole("heading", { name: "Welcome, Nour" })).toBeVisible();
    await page.getByLabel("Current password").fill("Welcome-Team-51");
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByLabel("Repeat new password").fill("short");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible(); // browser/server refuse a weak one
    await page.getByLabel("New password", { exact: true }).fill("Nour-Own-Pass-7");
    await page.getByLabel("Repeat new password").fill("Nour-Own-Pass-7");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByRole("heading", { name: /Nour/ })).toBeVisible();
    await expect(page).toHaveURL(/\/my-work/);
  });

  test("Delete from the list (with a confirmation), restore it, and edit straight from the row", async ({ page }) => {
    await login(page, "king");
    await page.goto("/brands/vanilla-roza?m=2026-11");
    await page.getByRole("button", { name: "Delete Revision Reel" }).click();
    const dialog = page.getByRole("dialog", { name: /Delete “Revision Reel”/ });
    await dialog.getByRole("button", { name: "Delete" }).click();
    await toast(page, /Deleted/);
    await expect(page.getByRole("link", { name: "Revision Reel", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: /Show deleted items/ }).click();
    await page.getByRole("button", { name: "Restore" }).first().click();
    await toast(page, "Item restored.");

    await page.goto("/brands/vanilla-roza?m=2026-11");
    await page.getByRole("link", { name: "Edit Late Reel" }).click();
    await expect(page.getByRole("dialog", { name: "Edit details" })).toBeVisible();
  });

  test("Dashboard counts every brand, team and person, exports to Excel; brand defaults are editable", async ({ page }) => {
    await login(page, "shahenda");
    await page.goto("/stats?m=2026-10");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Teams by brand")).toBeVisible();
    await expect(page.getByRole("link", { name: /Vanilla Roza/ }).first()).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export to Excel" }).click();
    expect((await download).suggestedFilename()).toBe("NEXORA-dashboard-2026-10.xlsx");

    await page.goto("/settings/brands");
    await expect(page.getByLabel("Blissify: default Content").locator("option:checked")).toHaveText("Kemo");
    await expect(page.getByLabel("Blissify: default Graphic design").locator("option:checked")).toHaveText("Gannah");
    await expect(page.getByLabel("Blissify: default Shooting").locator("option:checked")).toHaveText("Ayman");
    await expect(page.getByLabel("Blissify: default Editing").locator("option:checked")).toHaveText("Jana");

    // People see their own numbers; only managers see everyone's.
    await login(page, "gannah");
    await page.goto("/team/king");
    await expect(page).toHaveURL(/\/team\/gannah/);
    const mine = page.waitForEvent("download");
    await page.getByRole("link", { name: "Export to Excel" }).click();
    expect((await mine).suggestedFilename()).toMatch(/^NEXORA-gannah-/);
  });

  test("Security: headers, public privacy page, sign-in lock-out; King (IT) has full access", async ({ page, request }) => {
    const res = await request.get("/login");
    const h = res.headers();
    expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["x-powered-by"]).toBeUndefined();
    expect((await request.get("/api/notifications")).status()).toBe(401);
    expect((await request.get("/api/backup")).status()).toBe(401);

    await page.context().clearCookies();
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: /privacy & security/i })).toBeVisible();

    // 5 wrong passwords → locked, even with the right one.
    for (let i = 0; i < 5; i++) {
      await page.goto("/login");
      await page.fill("#username", "jana");
      await page.fill("#password", `wrong-${i}`);
      await page.click("button[type=submit]");
      await expect(page.getByText("Wrong username or password.")).toBeVisible();
    }
    await page.fill("#username", "jana");
    await page.fill("#password", PASSWORD);
    await page.click("button[type=submit]");
    await expect(page.getByText(/Too many wrong attempts/)).toBeVisible();

    await login(page, "king");
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Give a task" })).toBeVisible();
    await page.goto("/settings/people");
    await expect(page.getByRole("button", { name: "New account" })).toBeVisible();
    await expect(page.getByText("Content Creator").first()).toBeVisible(); // same position
  });

  test("Search and the activity log reflect the work", async ({ page }) => {
    await login(page, "shahenda");
    await page.getByLabel(/Search content/).fill("ampoule");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "The Ampoule" })).toBeVisible();
    await page.goto("/activity");
    await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();
    await page.getByRole("link", { name: "Sent back" }).click();
    await expect(page.getByText(/Assem returned the work from Pre-production to Content/).first()).toBeVisible();
    await page.getByRole("link", { name: "Versions & approvals" }).click();
    await expect(page.getByText(/approved v2 of Post-production/).first()).toBeVisible();
    await page.goto("/team/ayman?range=last_30");
    await expect(page.getByText("The Ampoule").first()).toBeVisible();
  });

  test("Spaces: build a workflow from a template, add tasks, finish one; access is per person", async ({ page }) => {
    await login(page, "king");
    await page.goto("/spaces/new");
    await page.getByRole("button", { name: /Simple board/ }).click();
    await page.getByLabel("Space name").fill("IT requests");
    await page.getByRole("button", { name: /Create IT requests/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: /IT requests/ })).toBeVisible();
    await page.getByRole("textbox", { name: /e.g. Book the studio/ }).fill("New laptop for Jana\nFix the office Wi-Fi");
    await page.getByRole("button", { name: "Add 2" }).click();
    await toast(page, "2 tasks added.");
    await page.getByRole("button", { name: /Mark Fix the office Wi-Fi Done/ }).click();
    await toast(page, "Done!");
    await page.getByRole("button", { name: "Filter and group" }).click();
    await page.getByLabel(/Show finished/).check();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Fix the office Wi-Fi" })).toBeVisible();
    await page.getByRole("tab", { name: "Board" }).click();
    await expect(page.getByText("New laptop for Jana")).toBeVisible();

    await page.goto("/settings/access?u=assem");
    await expect(page.getByRole("switch", { name: "Edit worked time for Assem" })).toHaveAttribute("aria-checked", "true");

    await login(page, "esraa");
    await page.goto("/settings/access");
    await expect(page).toHaveURL(/\/settings\/account/);
    await page.goto("/spaces");
    await expect(page.getByRole("link", { name: /IT requests/ }).first()).toBeVisible(); // public space: the whole team sees it
  });
});
