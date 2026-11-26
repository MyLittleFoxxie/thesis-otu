"""Verify thesis manuscript references, citations, assets, and privacy rules.

Usage:
    python3 tools/verify_thesis.py
    python3 tools/verify_thesis.py --compile
"""
from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN_TEX = ROOT / "OntarioTechThesis.tex"
BIB_FILE = ROOT / "BibFiles" / "references.bib"
CLS_FILE = ROOT / "MastersDoctoralThesis.cls"

PRIVACY_PATTERNS = [
    re.compile(r"thesis-literature", re.I),
    re.compile(r"\.\./literature", re.I),
]


def strip_comments(text: str) -> str:
    lines = []
    for line in text.splitlines():
        out = []
        i = 0
        while i < len(line):
            if line[i] == "%" and (i == 0 or line[i - 1] != "\\"):
                break
            out.append(line[i])
            i += 1
        lines.append("".join(out))
    return "\n".join(lines)


def collect_tex_files(main_tex: Path) -> tuple[list[Path], list[str]]:
    missing_includes = []
    files = [main_tex]
    seen = {main_tex.resolve()}

    def walk(path: Path) -> None:
        raw = strip_comments(path.read_text(encoding="utf-8"))
        for target in re.findall(r"\\(?:include|input)\{([^}]+)\}", raw):
            cand = ROOT / (target if target.endswith(".tex") else f"{target}.tex")
            if not cand.is_file():
                missing_includes.append(target)
                continue
            resolved = cand.resolve()
            if resolved not in seen:
                seen.add(resolved)
                files.append(cand)
                walk(cand)

    walk(main_tex)
    return files, missing_includes


def parse_bib_keys(bib_path: Path) -> set[str]:
    text = bib_path.read_text(encoding="utf-8")
    return set(re.findall(r"@\w+\s*\{\s*([^,\s]+)", text))


def find_tex_tool(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    mactex = Path("/Library/TeX/texbin") / name
    if mactex.is_file():
        return str(mactex)
    return None


def compile_thesis() -> int:
    if not CLS_FILE.is_file():
        print(f"FAIL: Cannot compile — missing {CLS_FILE.name} in repository root.")
        return 1
    pdflatex = find_tex_tool("pdflatex")
    bibtex = find_tex_tool("bibtex")
    if not pdflatex or not bibtex:
        print("FAIL: pdflatex or bibtex not found on PATH or /Library/TeX/texbin.")
        return 1

    steps = [
        [pdflatex, "-interaction=nonstopmode", MAIN_TEX.name],
        [bibtex, MAIN_TEX.stem],
        [pdflatex, "-interaction=nonstopmode", MAIN_TEX.name],
        [pdflatex, "-interaction=nonstopmode", MAIN_TEX.name],
    ]
    for cmd in steps:
        print(f"Running: {' '.join(cmd)}")
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        if proc.returncode != 0:
            print(proc.stdout[-2000:])
            print(proc.stderr[-2000:])
            print(f"FAIL: {' '.join(cmd)} exited with {proc.returncode}")
            return proc.returncode
    print(f"PASS: {MAIN_TEX.with_suffix('.pdf').name} compiled cleanly.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Ontario Tech thesis manuscript.")
    parser.add_argument("--compile", action="store_true", help=f"Compile {MAIN_TEX.name} via pdflatex/bibtex.")
    args = parser.parse_args()

    errors = []

    if not MAIN_TEX.is_file():
        print(f"FAIL: {MAIN_TEX.name} not found.")
        return 1
    if not BIB_FILE.is_file():
        print("FAIL: BibFiles/references.bib not found.")
        return 1

    tex_files, missing_includes = collect_tex_files(MAIN_TEX)
    if missing_includes:
        errors.append(f"Missing included .tex files: {sorted(set(missing_includes))}")

    bib_keys = parse_bib_keys(BIB_FILE)
    labels: set[str] = set()
    refs: set[str] = set()
    cites: set[str] = set()
    missing_figs: list[str] = []
    privacy_hits: list[str] = []

    for tf in tex_files:
        raw_full = tf.read_text(encoding="utf-8")
        cleaned = strip_comments(raw_full)
        rel = tf.relative_to(ROOT).as_posix()

        for pat in PRIVACY_PATTERNS:
            if pat.search(raw_full):
                privacy_hits.append(f"{rel} matches {pat.pattern}")

        labels.update(re.findall(r"\\label\{([^}]+)\}", cleaned))
        refs.update(re.findall(r"\\(?:ref|eqref|pageref|autoref)\{([^}]+)\}", cleaned))

        for cite_group in re.findall(r"\\cite[a-zA-Z]*\*?(?:\[[^\]]*\])*\{([^}]+)\}", cleaned):
            for key in cite_group.split(","):
                key = key.strip()
                if key:
                    cites.add(key)

        for fig in re.findall(r"\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}", cleaned):
            fig_path = ROOT / fig
            if not fig_path.is_file():
                missing_figs.append(f"{rel}: {fig}")

    readme = ROOT / "README.md"
    if readme.is_file():
        readme_text = readme.read_text(encoding="utf-8")
        for pat in PRIVACY_PATTERNS:
            if pat.search(readme_text):
                privacy_hits.append(f"README.md matches {pat.pattern}")

    missing_cites = sorted(cites - bib_keys)
    missing_refs = sorted(refs - labels)

    if missing_cites:
        errors.append(f"Missing BibTeX keys: {missing_cites}")
    if missing_refs:
        errors.append(f"Undefined \\ref labels: {missing_refs}")
    if missing_figs:
        errors.append(f"Missing figure files: {missing_figs}")
    if privacy_hits:
        errors.append(f"Private literature repo mentioned in public/manuscript files: {privacy_hits}")

    print(f"Checked {len(tex_files)} .tex files against {len(bib_keys)} BibTeX keys.")
    print(f"Citations found: {len(cites)} | Labels defined: {len(labels)} | Refs checked: {len(refs)}")
    if not CLS_FILE.is_file():
        print("NOTE: MastersDoctoralThesis.cls is not yet present; add the Ontario Tech SGS class file to compile PDF.")

    if errors:
        for err in errors:
            print(f"FAIL: {err}")
        return 1

    print("PASS: All thesis verification checks succeeded.")
    if args.compile:
        return compile_thesis()
    return 0


if __name__ == "__main__":
    sys.exit(main())
