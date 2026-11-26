"use strict";

const byId = (id) => document.getElementById(id);
const { packet, manifest, fingerprint, consent, endpoint } = JSON.parse(byId("survey-data").textContent);
const inputCode = new URLSearchParams(location.hash.slice(1)).get("code");
const studyCode = /^(?:test-)?[a-f0-9]{32}$/.test(inputCode || "") ? inputCode : "";
const draftKey = [packet.survey_id, packet.version, fingerprint, studyCode || "preview"].join(":");
const pageNames = { study: "Study information", example: "Example", review: "Review", confirmation: "Complete" };
const fields = { level: packet.levels, outcome: packet.outcomes };
const labels = { level: "Evidence level", outcome: "Check outcome" };
const choiceQuestions = { level: "What does the material support?", outcome: "What did the check find?" };
const enrollment = byId("enrollment");
const reviewForm = byId("review-form");
const send = byId("send");
const comment = byId("comment");
const termTip = byId("term-tip");
const termDefinitions = new Map(packet.definitions.flatMap((item) => (
  item.aliases.map((alias) => [alias.toLowerCase(), item])
)));
const termPattern = new RegExp("\\b(?:" + [...termDefinitions.keys()]
  .sort((first, second) => second.length - first.length)
  .map((alias) => alias.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("|") + ")\\b", "gi");

let currentPage = "study";
let sending = false;
let accepted = false;
let attempt = null;
let termAnchor = null;
let definitionPinned = false;
let definitionTimer;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function annotateTerms(root) {
  const seen = new Set();
  const textNodes = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement.closest("h1, button, label, select, summary, dt, .choice-help, .source, #consent-text")
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const candidates = [];
  while (textNodes.nextNode()) candidates.push(textNodes.currentNode);
  for (const node of candidates) {
    const text = node.textContent;
    const matches = [...text.matchAll(termPattern)].filter(([term]) => {
      const { label } = termDefinitions.get(term.toLowerCase());
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
    if (!matches.length) continue;
    const fragment = document.createDocumentFragment();
    let start = 0;
    for (const match of matches) {
      const [word] = match;
      const button = element("button", word, "term");
      button.type = "button";
      button.dataset.term = word.toLowerCase();
      button.setAttribute("aria-label", word + ", show definition");
      const icon = element("span", "?", "term-icon");
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      fragment.append(text.slice(start, match.index), button);
      start = match.index + word.length;
    }
    fragment.append(text.slice(start));
    node.replaceWith(fragment);
  }
}

function closeDefinition() {
  clearTimeout(definitionTimer);
  termAnchor?.removeAttribute("aria-describedby");
  termAnchor = null;
  definitionPinned = false;
  termTip.hidden = true;
}

function positionDefinition() {
  if (!termAnchor) return;
  const anchor = termAnchor.getBoundingClientRect();
  if (anchor.bottom <= 0 || anchor.top >= innerHeight) {
    closeDefinition();
    return;
  }
  const { width, height } = termTip.getBoundingClientRect();
  const preferredTop = anchor.bottom + height + 20 <= innerHeight ? anchor.bottom + 8 : anchor.top - height - 8;
  termTip.style.top = Math.max(12, Math.min(preferredTop, innerHeight - height - 12)) + "px";
  termTip.style.left = Math.max(12, Math.min(anchor.left, innerWidth - width - 12)) + "px";
}

function showDefinition(button, pin = false) {
  clearTimeout(definitionTimer);
  termAnchor?.removeAttribute("aria-describedby");
  termAnchor = button;
  definitionPinned = pin;
  const { label, definition } = termDefinitions.get(button.dataset.term);
  termTip.replaceChildren(element("strong", label), element("p", definition));
  termTip.hidden = false;
  button.setAttribute("aria-describedby", termTip.id);
  positionDefinition();
}

function deferDefinitionClose() {
  clearTimeout(definitionTimer);
  definitionTimer = setTimeout(() => {
    if (termAnchor && !definitionPinned && !termTip.matches(":hover")
        && !termAnchor.matches(":hover, :focus")) closeDefinition();
  }, 160);
}

function setStatus(message) {
  const status = byId("status");
  status.hidden = !message;
  status.textContent = message;
}

function showPage(page) {
  closeDefinition();
  for (const id of Object.keys(pageNames)) byId(id).hidden = id !== page;
  byId("phase").textContent = pageNames[page];
  currentPage = page;
  setStatus("");
  window.scrollTo(0, 0);
  byId(page).querySelector("h1").focus({ preventScroll: true });
}

function renderFamiliarity({ id, question, help, labels }) {
  const name = "familiarity-" + id;
  const field = element("fieldset", undefined, "familiarity-item");
  const description = element("p", help);
  description.id = name + "-help";
  field.setAttribute("aria-describedby", description.id);
  field.append(element("legend", question), description);
  for (const [index, text] of labels.entries()) {
    const label = element("label", undefined, "check");
    const input = element("input");
    input.type = "radio";
    input.name = name;
    input.value = index + 1;
    input.id = name + "-" + input.value;
    input.required = true;
    label.append(input, element("span", text));
    field.append(label);
  }
  return field;
}

function renderExample() {
  const { example } = packet;
  byId("example-question").textContent = example.question;
  byId("example-evidence").textContent = example.evidence;
  byId("example-explanation").textContent = example.explanation;
  for (const [field, options] of Object.entries(fields)) {
    const pair = element("div");
    pair.append(element("dt", labels[field]), element("dd", options[example[field]].label));
    byId("example-ratings").append(pair);
  }
}

function renderDefinitions(target) {
  for (const [field, options] of Object.entries(fields)) {
    const group = element("div");
    const list = element("dl");
    for (const { label, help } of Object.values(options)) {
      list.append(element("dt", label), element("dd", help));
    }
    group.append(element("h3", labels[field]), element("p", choiceQuestions[field], "hint"), list);
    target.append(group);
  }
}

function renderTable({ headers, rows }) {
  const table = element("table");
  table.createTHead().insertRow().append(...headers.map((header) => {
    const th = element("th", header);
    th.scope = "col";
    return th;
  }));
  const body = table.createTBody();
  for (const row of rows) body.insertRow().append(...row.map((cell) => element("td", cell)));
  return table;
}

function renderCard(card) {
  const article = element("article", undefined, "panel");
  const scope = element("p", undefined, "scope");
  scope.append(element("strong", "Scope "), card.scope);
  article.append(
    element("p", card.criterion + " · " + card.title, "criterion"),
    element("h2", card.question),
    scope,
  );

  const evidence = element("div", undefined, "evidence");
  evidence.append(...card.evidence.map((paragraph) => element("p", paragraph)));
  if (card.table) evidence.append(renderTable(card.table));
  for (const source of card.sources) {
    const { document, location } = manifest.locators[source];
    const citation = manifest.documents[document].label + " · " + location;
    evidence.append(element("span", citation, "source"));
  }
  article.append(evidence);

  const guide = element("details");
  const guideText = element("dl");
  guideText.append(
    element("dt", "Documented"), element("dd", card.documented),
    element("dt", "Verified"), element("dd", card.verified),
  );
  guide.append(element("summary", "What counts for this criterion"), guideText);
  article.append(guide);

  const choices = element("div", undefined, "choices");
  for (const [field, options] of Object.entries(fields)) {
    const group = element("div");
    const label = element("label", labels[field]);
    const select = element("select");
    select.id = card.criterion + "-" + field;
    select.setAttribute("aria-label", card.criterion + " " + labels[field]);
    select.required = true;
    select.add(new Option("Choose an answer", ""));
    for (const [value, { label }] of Object.entries(options)) select.add(new Option(label, value));
    const help = element("p", choiceQuestions[field], "hint choice-help");
    help.id = select.id + "-help";
    select.setAttribute("aria-describedby", help.id);
    label.htmlFor = select.id;
    group.append(label, select, help);
    choices.append(group);
  }
  article.append(choices);
  return article;
}

function getRatings() {
  return packet.cards.map(({ criterion, id }) => ({
    criterion,
    card_id: id,
    level: byId(criterion + "-level").value,
    outcome: byId(criterion + "-outcome").value,
  }));
}

function getFamiliarity() {
  return Object.fromEntries(packet.familiarity.map(({ id }) => [
    id, Number(enrollment.elements.namedItem("familiarity-" + id).value),
  ]));
}

function updateProgress() {
  const ratings = getRatings();
  const count = ratings.filter(({ level, outcome }) => level && outcome).length;
  byId("progress").textContent = count + " of " + packet.cards.length + " cards rated";
  for (const rating of ratings) {
    for (const [field, options] of Object.entries(fields)) {
      byId(rating.criterion + "-" + field + "-help").textContent =
        options[rating[field]]?.help ?? choiceQuestions[field];
    }
  }
}

function saveDraft() {
  try {
    const state = accepted ? { accepted: true } : {
      familiarity: getFamiliarity(),
      consented: byId("consent").checked,
      page: currentPage,
      ratings: getRatings(),
      comment: comment.value,
      attempt,
    };
    localStorage.setItem(draftKey, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

function showConfirmation() {
  accepted = true;
  byId("confirmation-text").textContent = "FormSubmit accepted your response. Thank you for taking part.";
  showPage("confirmation");
}

function loadDraft() {
  try {
    const state = JSON.parse(localStorage.getItem(draftKey));
    if (!state) {
      setStatus("There is no saved draft for this survey in this browser.");
      return;
    }
    if (state.accepted === true && endpoint && studyCode) {
      showConfirmation();
      return;
    }
    const validRatings = Array.isArray(state.ratings) && state.ratings.length === packet.cards.length
      && state.ratings.every(({ criterion, card_id, level, outcome }, index) => {
        const card = packet.cards[index];
        return criterion === card.criterion && card_id === card.id
          && (level === "" || Object.hasOwn(fields.level, level))
          && (outcome === "" || Object.hasOwn(fields.outcome, outcome));
      });
    const validFamiliarity = packet.familiarity.every(({ id, labels }) => {
      const score = state.familiarity?.[id];
      return Number.isInteger(score) && score >= 1 && score <= labels.length;
    });
    if (!validFamiliarity || state.consented !== true || state.page !== "review"
        || !validRatings || typeof state.comment !== "string" || state.comment.length > 1000) {
      throw new Error("Invalid draft");
    }
    for (const { id } of packet.familiarity) {
      enrollment.elements.namedItem("familiarity-" + id).value = String(state.familiarity[id]);
    }
    byId("consent").checked = true;
    for (const { criterion, level, outcome } of state.ratings) {
      byId(criterion + "-level").value = level;
      byId(criterion + "-outcome").value = outcome;
    }
    comment.value = state.comment;
    const saved = state.attempt;
    if (saved && /^[a-f0-9-]{36}$/.test(saved.id) && typeof saved.signature === "string") attempt = saved;
    updateProgress();
    showPage("review");
    setStatus("Draft loaded.");
  } catch {
    setStatus("This draft could not be loaded.");
  }
}

async function submitReview(event) {
  event.preventDefault();
  if (sending || accepted || !enrollment.checkValidity() || !reviewForm.reportValidity()) return;
  if (!endpoint) {
    setStatus("Preview complete. Delivery is disabled.");
    return;
  }
  if (!studyCode || location.protocol !== "https:") {
    setStatus("Open your HTTPS invitation link to submit your review.");
    return;
  }

  const familiarity = JSON.stringify(getFamiliarity());
  const ratings = JSON.stringify(getRatings());
  const note = comment.value.trim();
  const signature = JSON.stringify([familiarity, ratings, note]);
  if (attempt?.signature !== signature) {
    attempt = { id: crypto.randomUUID(), signature };
  }
  const payload = {
    _subject: studyCode.startsWith("test-") ? "TEST MSSurvey TruthfulQA" : "MSSurvey TruthfulQA",
    _template: "table",
    study_code: studyCode,
    submission_id: attempt.id,
    survey_id: packet.survey_id,
    survey_version: packet.version,
    rubric_version: packet.rubric_version,
    packet_sha256: fingerprint,
    consent: "agreed",
    familiarity,
    ratings,
    comment: note,
  };

  sending = true;
  for (const control of reviewForm.elements) control.disabled = true;
  const saved = saveDraft();
  setStatus("Sending your review…");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
    });
    const result = await response.json();
    if (!response.ok || ![true, "true"].includes(result?.success)) throw new Error("Delivery unconfirmed");
    showConfirmation();
    saveDraft();
  } catch {
    setStatus(saved
      ? "Delivery could not be confirmed. Your answers are saved in this browser. Check with the organizer before retrying."
      : "Delivery could not be confirmed. Keep this page open to keep your answers. Check with the organizer before retrying.");
  } finally {
    clearTimeout(timeout);
    sending = false;
    for (const control of reviewForm.elements) control.disabled = false;
  }
}

byId("preview-note").hidden = Boolean(endpoint);
byId("study-lede").textContent = packet.introduction.lede;
byId("study-purpose").textContent = packet.introduction.purpose;
byId("study-topics").append(...packet.introduction.topics.flatMap(({ name, description }) => [
  element("dt", name), element("dd", description),
]));
byId("study-steps").textContent = packet.introduction.steps;
byId("consent-text").textContent = consent || "This preview keeps responses in your browser if you save a draft.";
byId("familiarity").append(...packet.familiarity.map(renderFamiliarity));
byId("benchmark-description").textContent = packet.benchmark.description;
byId("feedback-label").textContent = packet.feedback_prompt;
byId("cards").append(...packet.cards.map(renderCard));
renderExample();
renderDefinitions(byId("example-definitions"));
renderDefinitions(byId("review-definitions"));
for (const root of document.querySelectorAll("#study, #example, #review > .lede, #review > .guide, #cards article")) {
  annotateTerms(root);
}
updateProgress();

document.addEventListener("pointerover", (event) => {
  const term = event.target.closest(".term");
  if (event.pointerType !== "touch" && term && event.relatedTarget?.closest?.(".term") !== term
      && (!definitionPinned || term === termAnchor)) showDefinition(term, definitionPinned);
});
document.addEventListener("pointerout", (event) => {
  const term = event.target.closest(".term");
  if (term && event.relatedTarget?.closest?.(".term") !== term) deferDefinitionClose();
});
termTip.addEventListener("pointerenter", () => clearTimeout(definitionTimer));
termTip.addEventListener("pointerleave", deferDefinitionClose);
document.addEventListener("focusin", (event) => {
  if (event.target.matches(".term")) showDefinition(event.target, definitionPinned && event.target === termAnchor);
  else if (!definitionPinned) closeDefinition();
});
document.addEventListener("click", (event) => {
  const term = event.target.closest(".term");
  if (term && !(definitionPinned && term === termAnchor)) showDefinition(term, true);
  else if (!event.target.closest("#term-tip")) closeDefinition();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDefinition();
});
window.addEventListener("resize", positionDefinition);
window.addEventListener("scroll", positionDefinition, { passive: true });

enrollment.addEventListener("submit", (event) => {
  event.preventDefault();
  if (endpoint && !studyCode) {
    setStatus("Open the survey using the link in your invitation.");
    return;
  }
  showPage("example");
});
for (const button of document.querySelectorAll("[data-page]")) {
  button.addEventListener("click", () => showPage(button.dataset.page));
}
byId("save-draft").addEventListener("click", () => {
  setStatus(saveDraft() ? "Draft saved in this browser." : "This browser could not save the draft.");
});
byId("load-draft").addEventListener("click", loadDraft);
reviewForm.addEventListener("change", updateProgress);
reviewForm.addEventListener("submit", submitReview);
window.addEventListener("hashchange", () => location.reload());

try {
  if (endpoint && studyCode && JSON.parse(localStorage.getItem(draftKey))?.accepted === true) {
    showConfirmation();
  }
} catch {
  // The form still works when browser storage is unavailable.
}
