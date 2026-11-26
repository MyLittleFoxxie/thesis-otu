"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const origin = "https://survey.test";
const provider = "https://formsubmit.co/ajax/browser-test-only";
const testCode = "test-" + "1".repeat(32);
const fakeConsent = "Synthetic consent for browser checks. <draft>";
const preview = fs.readFileSync(path.join(__dirname, "survey.html"), "utf8");
const criteria = ["B06", "B07", "B10", "B12", "B18", "B20"];
const sampleFamiliarity = { ai: 1, benchmarks: 2, scores: 3 };
const expectedChoices = [
  "Claimed", "Documented", "Verified", "Contradicted", "Undocumented", "Cannot judge",
  "Passed", "Failed", "Not performed", "Not recorded", "Cannot judge",
];

async function fillFamiliarity(page, scores = sampleFamiliarity) {
  for (const [id, score] of Object.entries(scores)) {
    await page.locator("#familiarity-" + id + "-" + score).check();
  }
}

async function openReview(page, scores) {
  await fillFamiliarity(page, scores);
  await page.getByLabel(/I have read/).check();
  await page.getByRole("button", { name: "See the example" }).click();
  await page.getByRole("heading", { name: "How to rate a card" }).waitFor();
  assert.match(await page.locator("#example-ratings").innerText(), /Verified[\s\S]+Failed/);
  assert.ok(await page.locator('#example > .lede .term[data-term="check outcome"]').isVisible());
  assert.deepEqual(await page.locator("#example-definitions dt").allTextContents(), expectedChoices);
  assert.ok(await page.locator("#example-definitions").isVisible());
  await checkViewport(page, page.viewportSize().width > 540 ? "guide-desktop" : "guide-mobile");
  await page.getByRole("button", { name: "Review TruthfulQA" }).click();
  await page.getByRole("heading", { name: "Review TruthfulQA" }).waitFor();
}

async function fillRatings(page) {
  for (const criterion of criteria) {
    await page.getByLabel(criterion + " Evidence level").selectOption("documented");
    await page.getByLabel(criterion + " Check outcome").selectOption("not_recorded");
  }
}

async function checkViewport(page, label) {
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert.ok(noOverflow, label + " must fit the viewport");
  if (process.env.MESASURVEY_QA_DIR) {
    await page.screenshot({ path: path.join(process.env.MESASURVEY_QA_DIR, label + ".png"), fullPage: true });
  }
}

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "mesa-survey-browser-"));
  let browser;
  try {
    const config = path.join(temp, "release.json");
    const output = path.join(temp, "release.html");
    fs.writeFileSync(config, JSON.stringify({ endpoint: provider, consent: fakeConsent }));
    execFileSync(process.env.PYTHON || "python3", [
      path.join(__dirname, "build.py"), "--release-config", config, "--output", output,
    ]);
    const release = fs.readFileSync(output, "utf8");
    const chrome = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    browser = await chromium.launch(fs.existsSync(chrome) ? { executablePath: chrome } : {});
    const context = await browser.newContext({
      viewport: { width: 1220, height: 920 }, hasTouch: true, serviceWorkers: "block",
    });
    const sent = [];
    const responses = [];
    const errors = [];
    await context.route("**/*", async (route) => {
      const { pathname, origin: target } = new URL(route.request().url());
      if (target === origin && ["/preview", "/release"].includes(pathname)) {
        await route.fulfill({ contentType: "text/html; charset=utf-8", body: pathname === "/preview" ? preview : release });
        return;
      }
      if (route.request().url() === provider && route.request().method() === "POST") {
        sent.push(route.request().postDataJSON());
        const reply = responses.shift();
        assert.ok(reply, "Unexpected submission");
        if (reply.delay) await new Promise((resolve) => setTimeout(resolve, reply.delay));
        await route.fulfill({
          status: reply.status,
          headers: { "Access-Control-Allow-Origin": origin },
          json: { success: reply.success },
        });
        return;
      }
      await route.abort();
    });

    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin + "/preview");
    await page.getByText(/Preview mode/).waitFor();
    await checkViewport(page, "study-desktop");
    const mobileStudy = await context.newPage();
    await mobileStudy.setViewportSize({ width: 390, height: 844 });
    await mobileStudy.goto(origin + "/preview");
    await checkViewport(mobileStudy, "study-mobile");
    await mobileStudy.close();
    assert.equal(await page.locator("#familiarity input[type=radio]").count(), 15);
    assert.equal(await page.locator("#familiarity input:checked").count(), 0);
    assert.deepEqual(await page.locator("#study-topics dt").allTextContents(), ["AI benchmarks", "MESA", "TruthfulQA"]);
    assert.match(await page.locator("#study-purpose").innerText(), /answer a few questions for my thesis/);
    await page.keyboard.press("Tab");
    assert.match(await page.locator(":focus").getAttribute("aria-label"), /MESA, show definition/);
    assert.match(await page.getByRole("tooltip").innerText(), /a set of questions for reviewing how an AI test works/);
    await page.keyboard.press("Tab");
    assert.match(await page.locator(":focus").getAttribute("aria-label"), /AI benchmark, show definition/);
    await page.getByRole("tooltip").waitFor();
    await page.keyboard.press("Escape");
    assert.ok(await page.getByRole("tooltip").isHidden());
    await page.locator('#study .term[data-term="evidence"]').focus();
    assert.match(await page.getByRole("tooltip").innerText(), /Information that helps you decide whether a claim is supported/);
    await page.locator('#study .term[data-term="ai system"]').hover();
    assert.match(await page.getByRole("tooltip").innerText(), /answering questions or recognizing images/);
    await page.locator('#study .term[data-term="scores"]').focus();
    assert.match(await page.getByRole("tooltip").innerText(), /percentage of answers marked correct/);
    assert.equal(await page.locator('#study .term[data-term="misconceptions"]').count(), 0);
    await page.locator('#study .term[data-term="cards"]').focus();
    await page.getByRole("tooltip").waitFor();
    assert.match(await page.getByRole("tooltip").innerText(), /One review item in this survey/);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("id"), "familiarity-ai-1");
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("id"), "familiarity-benchmarks-1");
    await page.getByLabel(/I have read/).check();
    await page.getByRole("button", { name: "See the example" }).click();
    assert.ok(await page.locator("#study").isVisible());
    await fillFamiliarity(page);
    await page.getByLabel(/I have read/).uncheck();
    await page.getByRole("button", { name: "See the example" }).click();
    assert.ok(await page.locator("#study").isVisible());
    await openReview(page);
    await page.getByText("All rating choices", { exact: true }).click();
    assert.deepEqual(await page.locator("#review-definitions dt").allTextContents(), expectedChoices);
    assert.ok(await page.locator("#review-definitions").isVisible());
    await page.getByText("All rating choices", { exact: true }).click();
    const tooltip = page.getByRole("tooltip");
    const tokenProbability = page.locator('.term[data-term="token log probability"]');
    await tokenProbability.hover();
    await tooltip.waitFor();
    assert.match(await tooltip.innerText(), /how likely the model thought a piece of text was/);
    await tooltip.hover();
    assert.ok(await tooltip.isVisible());
    await page.getByRole("heading", { name: "Is variation on repeated testing reported?" }).hover();
    await tooltip.waitFor({ state: "hidden" });
    await tokenProbability.focus();
    await tooltip.waitFor();
    assert.equal(await tokenProbability.getAttribute("aria-describedby"), "term-tip");
    await page.keyboard.press("Escape");
    assert.ok(await tooltip.isHidden());
    assert.ok(await tokenProbability.evaluate((node) => node === document.activeElement));
    assert.equal(await page.locator("select:required").count(), 12);
    assert.match(await page.locator("#progress").innerText(), /^0 of 6/);
    for (const select of await page.locator("select").all()) assert.equal(await select.inputValue(), "");
    await page.getByRole("button", { name: "Submit review" }).click();
    assert.deepEqual(sent, []);
    assert.equal(await page.locator(":focus").getAttribute("id"), "B06-level");

    await page.getByLabel("B06 Evidence level").selectOption("cannot_judge");
    await page.getByLabel("B06 Check outcome").selectOption("not_performed");
    assert.equal(await page.locator("#B06-level-help").textContent(), "You are unsure which evidence level fits after reading the material.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.reload();
    await page.getByRole("button", { name: "Load draft" }).click();
    assert.equal(await page.getByLabel("B06 Evidence level").inputValue(), "cannot_judge");
    assert.equal(await page.getByLabel("B06 Check outcome").inputValue(), "not_performed");
    assert.equal(await page.locator("#B06-outcome-help").textContent(), "The material shows that the check did not take place.");
    assert.equal(await page.getByLabel("B07 Evidence level").inputValue(), "");
    for (const [id, score] of Object.entries(sampleFamiliarity)) {
      assert.ok(await page.locator("#familiarity-" + id + "-" + score).isChecked());
    }
    assert.match(await page.locator("#progress").innerText(), /^1 of 6/);
    await checkViewport(page, "review-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await checkViewport(page, "review-mobile");
    const temperature = page.locator('.term[data-term="temperature"]');
    await temperature.tap();
    await tooltip.waitFor();
    assert.match(await tooltip.innerText(), /how a model picks the next piece of text/);
    assert.ok(await tooltip.evaluate((node) => {
      const { left, right, top, bottom } = node.getBoundingClientRect();
      return left >= 0 && right <= innerWidth && top >= 0 && bottom <= innerHeight;
    }));
    await page.getByRole("heading", { name: "Is variation on repeated testing reported?" }).tap();
    assert.ok(await tooltip.isHidden());
    await fillRatings(page);
    await page.getByRole("button", { name: "Submit review" }).click();
    await page.getByText("Preview complete. Delivery is disabled.").waitFor();
    assert.deepEqual(sent, []);

    await page.goto(origin + "/release");
    assert.equal(await page.locator("#consent-text").innerText(), fakeConsent);
    await fillFamiliarity(page);
    await page.getByLabel(/I have read/).check();
    await page.getByRole("button", { name: "See the example" }).click();
    await page.getByText("Open the survey using the link in your invitation.").waitFor();

    await Promise.all([
      page.waitForEvent("load"),
      page.goto(origin + "/release#code=" + testCode),
    ]);
    await page.getByRole("button", { name: "Load draft" }).waitFor();
    await page.getByRole("button", { name: "Load draft" }).click();
    await page.getByText("There is no saved draft for this survey in this browser.").waitFor();
    await openReview(page);
    await fillRatings(page);
    await page.getByLabel("B07 Evidence level").selectOption("verified");
    await page.getByLabel("B07 Check outcome").selectOption("failed");
    await page.getByLabel(/Which rating was hardest/).fill("Synthetic feedback");

    responses.push({ status: 503, success: false, delay: 200 });
    await page.evaluate(() => {
      const form = document.getElementById("review-form");
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.getByText(/Delivery could not be confirmed/).waitFor();
    assert.equal(sent.length, 1);
    const first = sent[0];
    assert.equal(first._subject, "TEST MSSurvey TruthfulQA");
    assert.equal(first.study_code, testCode);
    assert.equal(first.survey_id, "mesa-human-review-truthfulqa");
    assert.equal(first.survey_version, "1.8");
    assert.equal(first.rubric_version, "5.1");
    assert.equal(first.consent, "agreed");
    assert.match(first.packet_sha256, /^[0-9a-f]{64}$/);
    assert.match(first.submission_id, /^[0-9a-f-]{36}$/);
    assert.deepEqual(Object.keys(first).sort(), [
      "_subject", "_template", "comment", "consent", "familiarity", "packet_sha256", "ratings", "rubric_version",
      "study_code", "submission_id", "survey_id", "survey_version",
    ]);
    assert.deepEqual(JSON.parse(first.familiarity), sampleFamiliarity);
    assert.equal(first.comment, "Synthetic feedback");
    const ratings = JSON.parse(first.ratings);
    assert.deepEqual(ratings.map(({ criterion }) => criterion), criteria);
    assert.deepEqual(ratings[1], { criterion: "B07", card_id: "truthfulqa-b07", level: "verified", outcome: "failed" });

    await page.reload();
    await page.getByRole("button", { name: "Load draft" }).click();
    assert.equal(await page.getByLabel("B07 Check outcome").inputValue(), "failed");
    responses.push({ status: 200, success: "false" });
    await page.getByRole("button", { name: "Submit review" }).click();
    await page.getByText(/Delivery could not be confirmed/).waitFor();
    assert.deepEqual(sent[1], first);

    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Back" }).click();
    const changedFamiliarity = { ...sampleFamiliarity, scores: 5 };
    await openReview(page, changedFamiliarity);
    responses.push({ status: 200, success: "true" });
    await page.getByRole("button", { name: "Submit review" }).click();
    await page.getByText(/FormSubmit accepted your response/).waitFor();
    assert.notEqual(sent[2].submission_id, first.submission_id);
    assert.equal(sent[2].comment, "Synthetic feedback");
    assert.deepEqual(JSON.parse(sent[2].familiarity), changedFamiliarity);
    assert.equal(sent[2].ratings, first.ratings);
    await page.reload();
    await page.getByRole("heading", { name: "Review complete" }).waitFor();
    assert.equal(sent.length, 3);
    assert.deepEqual(errors, []);
    await context.close();
    console.log("PASS: keyboard, desktop and mobile layout, validation, drafts, payload, retry and mock delivery.");
  } finally {
    if (browser) await browser.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
