# Agent Instructions

Use this file as the repository guide for AI coding and research agents working on the Ontario Tech University Master's thesis (`thesis-otu`). Read [`README.md`](README.md) first, then the relevant chapter or companion-paper files before editing.

## Thesis Scope and Source Provenance

This thesis integrates two companion empirical papers from sibling repositories in the workspace:
- **Chapter 3 (Paper 1 — MESA):** `../MESA-meta-evaluation-standard-for-ai/mesa_paper.tex` (`main` branch), mapping 280 items from seven benchmark review frameworks onto 30 shared concerns and evaluating the 39-criterion MESA rubric across Claude and Gemini on four benchmarks.
- **Chapter 4 (Paper 2 — Requirement Decisions):** `../benchmark-evidence-requirement-decisions/decisions_paper.tex` (`main` branch), operationalizing MESA ratings in a fail-closed three-step decision method across 88 SymPy coding-agent sessions.
- **Shared Literature SSOT:** Consult `../thesis-literature/` (`catalog.md`, `pdfs/<key>.pdf`, `markdown/<key>.md`, `slr-mesa/`, `slr-decisions/`, and `references.bib`) when verifying citations or syncing `BibFiles/references.bib`.

## Writing & Scientific Integrity Rules

- Use plain, direct American English. Prefer concrete nouns and verbs. Limit adjectives and hyphenated terms to those needed for precision. Keep official names and established terms. Avoid marketing language.
- Always verify reported numbers directly against the latest `main` verification scripts in the two companion repositories (`checks/check_paper_numbers.py` in MESA; `analysis/check_decisions_numbers.py` and `analysis/step2_decisions_analyses.py` in Requirement Decisions). Do not copy outdated counts from earlier drafts or seminar scripts.
- Keep existing BibTeX keys in `BibFiles/references.bib` aligned with `../thesis-literature/references.bib`.
- **Privacy rule:** Never cite, link, or mention `../thesis-literature/` (or `../literature/`) inside `OntarioTechThesis.tex`, `Frontmatter/`, `Chapters/`, `Appendices/`, `BibFiles/`, or `README.md`.
- Preserve the Ontario Tech University `MastersDoctoralThesis` template structure in `OntarioTechThesis.tex`.

## Thesis Chapter Structure

- Use [Gangolli's thesis](thesis_examples/Gangolli_Aakash_Anil.pdf) as a guide to chapter organization and level of detail. Keep the thesis voice and use the source papers for research claims.
- Open the introduction with a problem the reader can follow. State the motivation, research questions, scope, and contributions. Give a chapter outline and close with a short summary.
- Define terms before comparing prior work. Group studies by the problem they address. For each study that shapes the thesis, explain what it examined, how it gathered evidence, what it found, and how that finding applies here. Use a table when it makes differences easier to compare.
- End the background chapter by explaining how the literature leads to the two thesis studies. Check interpretations and numbers against the original source.

## GitHub Authentication

- This repository belongs to the `MyLittleFoxxie` GitHub account. Before running remote Git or GitHub operations (`git fetch`, `git pull`, `git push`, `gh`), check the active `gh` account (use `/opt/homebrew/bin/gh` if `gh` is not on `PATH`), switch to `MyLittleFoxxie` (`gh auth switch -u MyLittleFoxxie`), and switch back to the previously active account immediately afterward.

## Verification

Run from the repository root:
- `python3 tools/verify_thesis.py` — validates included `.tex` files, BibTeX keys, `\ref`/`\label` links, figure paths, and privacy rules.
- `python3 tools/verify_thesis.py --compile` — compiles `OntarioTechThesis.pdf` via `pdflatex` and `bibtex` (TeX Live is at `/Library/TeX/texbin`).
