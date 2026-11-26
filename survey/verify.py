"""Check the survey packet, source pins, preview and analysis with synthetic data."""

import argparse
import hashlib
import json
import re
from pathlib import Path

from analyze import summarize
from build import PREVIEW, PAGES_PREVIEW, load_content, render_page


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_content(content, *, paper_path=None, readme_path=None, rubric_path=None):
    packet, manifest = content["packet"], content["manifest"]
    assert packet["rubric_version"] == "5.1"
    assert [item["id"] for item in packet["familiarity"]] == ["ai", "benchmarks", "scores"]
    assert all(len(item["labels"]) == 5 for item in packet["familiarity"])
    snapshot = manifest["snapshot_commit"]
    assert re.fullmatch(r"[a-f0-9]{40}", snapshot)
    assert manifest["documents"]["readme"]["url"] == (
        f"https://github.com/sylinrl/TruthfulQA/blob/{snapshot}/README.md"
    )
    for label, path, expected in (
        ("Paper", paper_path, manifest["documents"]["paper"]["sha256"]),
        ("README", readme_path, manifest["documents"]["readme"]["sha256"]),
        ("Rubric", rubric_path, manifest["rubric_sha256"]),
    ):
        assert re.fullmatch(r"[a-f0-9]{64}", expected), f"Missing or invalid {label} fingerprint."
        if path is not None:
            assert digest(path) == expected, f"{label} differs from the pinned copy."

    assert [card["criterion"] for card in packet["cards"]] == ["B06", "B07", "B10", "B12", "B18", "B20"]
    assert list(packet["levels"]) == [
        "claimed", "documented", "verified", "contradicted", "undocumented", "cannot_judge",
    ]
    assert list(packet["outcomes"]) == ["passed", "failed", "not_performed", "not_recorded", "cannot_judge"]
    for options in (packet["levels"], packet["outcomes"]):
        assert all(option["label"] and option["help"] for option in options.values())
    aliases = [alias.lower() for item in packet["definitions"] for alias in item["aliases"]]
    assert all(aliases) and len(aliases) == len(set(aliases))
    assert all(item["label"] and item["aliases"] and item["definition"] for item in packet["definitions"])
    assert [packet["example"][field] for field in ("level", "outcome")] == ["verified", "failed"]
    used_sources = set()
    for card in packet["cards"]:
        assert card["id"] == "truthfulqa-" + card["criterion"].lower()
        assert all(card[field] for field in ("evidence", "sources", "scope", "documented", "verified"))
        for source_id in card["sources"]:
            source = manifest["locators"][source_id]
            assert source["location"] and source["document"] in manifest["documents"]
            used_sources.add(source_id)
        if "table" in card:
            assert all(len(row) == len(card["table"]["headers"]) for row in card["table"]["rows"])
    assert used_sources == set(manifest["locators"])
    assert content["endpoint"] is None and content["consent"] is None
    html = render_page(content)
    for preview in (PREVIEW, PAGES_PREVIEW):
        assert preview.read_text(encoding="utf-8") == html, "Run build.py to update the previews."


def verify_analysis(content):
    packet = content["packet"]
    codes = {character * 32 for character in "abcdef"}

    def record(code, id_suffix, level="documented", outcome="not_recorded", comment=""):
        return {
            "study_code": code,
            "submission_id": f"00000000-0000-4000-8000-{id_suffix:012d}",
            "survey_id": packet["survey_id"],
            "survey_version": packet["version"],
            "rubric_version": packet["rubric_version"],
            "packet_sha256": content["fingerprint"],
            "consent": "agreed",
            "familiarity": json.dumps({"ai": 1, "benchmarks": 3, "scores": 5}),
            "ratings": json.dumps([
                {"card_id": card["id"], "criterion": card["criterion"], "level": level, "outcome": outcome}
                for card in packet["cards"]
            ]),
            "comment": comment,
        }

    rows = [
        record("a" * 32, 1, comment="Synthetic comment"),
        record("a" * 32, 1),
        record("a" * 32, 2, "contradicted", "failed"),
        record("a" * 32, 2),
        record("b" * 32, 3),
        record("c" * 32, 4, "verified", "failed"),
        record("d" * 32, 5, "cannot_judge", "cannot_judge"),
        record("test-" + "0" * 32, 6),
        record("9" * 32, 7),
        dict(record("e" * 32, 8), packet_sha256="wrong"),
        dict(record("f" * 32, 9), ratings="invalid"),
        dict(record("f" * 32, 10), consent=""),
        dict(record("f" * 32, 11), familiarity={"ai": 1, "benchmarks": 3}),
        dict(record("f" * 32, 12), familiarity={"ai": 1, "benchmarks": 3, "scores": 6}),
    ]
    result = summarize(map(json.dumps, rows), codes, content)
    assert result["participant_flow"] == {
        "deliveries": 14, "test": 1, "invalid": 4, "other_packet": 1, "unknown_invite": 1,
        "duplicate_submission": 2, "repeat_invite": 1, "eligible_responses": 4, "with_comment": 1,
    }
    assert result["familiarity"] == {
        "ai": {1: 4, 2: 0, 3: 0, 4: 0, 5: 0},
        "benchmarks": {1: 0, 2: 0, 3: 4, 4: 0, 5: 0},
        "scores": {1: 0, 2: 0, 3: 0, 4: 0, 5: 4},
    }
    for criterion in result["criteria"].values():
        for field in criterion.values():
            assert field["counts"]["cannot_judge"] == 1
            assert (field["respondents"], field["pair_respondents"]) == (4, 3)
            assert (field["matching_pairs"], field["pairs"], field["pair_agreement"]) == (1, 3, 1 / 3)
    result = summarize([json.dumps(rows[0])], codes, content)
    assert result["criteria"]["B06"]["level"]["pair_agreement"] is None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--paper", type=Path, help="also verify the local copy of the pinned PDF")
    parser.add_argument("--readme", type=Path, help="also verify the local copy of the pinned TruthfulQA README")
    parser.add_argument("--rubric", type=Path, help="also verify the local copy of MESA rubric 5.1")
    args = parser.parse_args()
    content = load_content()
    verify_content(content, paper_path=args.paper, readme_path=args.readme, rubric_path=args.rubric)
    verify_analysis(content)
    print("PASS: survey content, source pins, preview and agreement calculations.")


if __name__ == "__main__":
    main()
