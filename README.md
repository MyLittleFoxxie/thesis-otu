# Benchmark Evidence for Software Requirement Decisions

Master's thesis repository (Ontario Tech University, `MastersDoctoralThesis` LaTeX template) uniting two empirical studies on artificial intelligence benchmark evaluation and software requirement decisions:

1. **MESA (Chapter 3):** Unifying seven AI benchmark review frameworks (280 items, 30 shared concerns) into a 39-criterion evidence rubric evaluated across four benchmarks and two reviewer model families.
2. **Requirement Decisions (Chapter 4):** A fail-closed, three-step requirement decision method operationalizing MESA ratings and exact one-sided 95% binomial bounds, evaluated across 88 SymPy coding-agent sessions.

## Repository Layout

| Path | Contents |
|---|---|
| `OntarioTechThesis.tex` | Main document for Overleaf and local builds. |
| `MastersDoctoralThesis.cls` | Ontario Tech thesis class from the original Overleaf project. |
| `Frontmatter/` | `customPackages.tex`, `thesisInfo.tex`, `customFormatting.tex`, `titlepage.tex`, `preliminaryPages.tex`, `abbreviations.tex`. |
| `Chapters/` | `Chapter1.tex` (Introduction) through `Chapter6.tex` (Conclusion and Future Work). |
| `Appendices/` | `AppendixA.tex` (MESA concerns and 39-criterion rubric) and `AppendixB.tex` (decision policies, statistical cut points, and artifacts). |
| `BibFiles/references.bib` | Shared BibTeX bibliography (`biblatex`, `backend=bibtex`, `style=numeric`, `natbib=true`). |
| `Figures/` | Study overview figures (`mesa_study_overview.pdf`, `decisions_study_overview.pdf`). |
| `tools/verify_thesis.py` | Offline checker for includes, citations, labels, figure paths, and LaTeX compilation. |

## Template Setup

Use `OntarioTechThesis.tex` as the main document in the linked Overleaf project. The remaining thesis metadata and front matter tasks are marked in the source.

## MSSurvey

The [survey preview](https://mylittlefoxxie.github.io/thesis-otu/) is built from the `survey/mesa-human-review` branch.

## Verification and Building

Run offline structural and citation checks:

```sh
python3 tools/verify_thesis.py
```

With TeX Live installed, compile the thesis PDF:

```sh
python3 tools/verify_thesis.py --compile
```

Or manually with TeX Live (`pdflatex` and `bibtex`):

```sh
pdflatex -interaction=nonstopmode OntarioTechThesis.tex
bibtex OntarioTechThesis
pdflatex -interaction=nonstopmode OntarioTechThesis.tex
pdflatex -interaction=nonstopmode OntarioTechThesis.tex
```
