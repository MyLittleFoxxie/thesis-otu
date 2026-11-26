"""Summarize FormSubmit records in inbox arrival order, one per eligible invite."""

import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path

from build import load_content

CODE = re.compile(r"[0-9a-f]{32}")
SUBMISSION = re.compile(r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}")


def read_invites(path):
    codes = [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not codes or len(codes) != len(set(codes)) or any(not CODE.fullmatch(code) for code in codes):
        raise ValueError("Use one distinct 32 character study code per line.")
    return set(codes)


def validate_ratings(raw_ratings, packet):
    # FormSubmit emails carry the JSON array in one field.
    ratings = json.loads(raw_ratings) if isinstance(raw_ratings, str) else raw_ratings
    cards = packet["cards"]
    if not isinstance(ratings, list) or len(ratings) != len(cards):
        raise ValueError("Expected one rating per card.")
    for rating, card in zip(ratings, cards):
        if (rating["card_id"] != card["id"] or rating["criterion"] != card["criterion"]
                or rating["level"] not in packet["levels"] or rating["outcome"] not in packet["outcomes"]):
            raise ValueError("Unexpected card or rating.")
    return ratings


def validate_familiarity(raw_familiarity, familiarity_counts):
    scores = json.loads(raw_familiarity) if isinstance(raw_familiarity, str) else raw_familiarity
    if not isinstance(scores, dict) or scores.keys() != familiarity_counts.keys():
        raise ValueError("Expected one score per familiarity question.")
    for question, score in scores.items():
        if type(score) is not int or score not in familiarity_counts[question]:
            raise ValueError("Invalid familiarity score.")
    return scores


def summarize_field(ratings, field, options):
    counts = Counter(rating[field] for rating in ratings)
    rateable = len(ratings) - counts["cannot_judge"]
    matching = sum(math.comb(counts[value], 2) for value in options if value != "cannot_judge")
    total_pairs = math.comb(rateable, 2)
    return {
        "counts": {value: counts[value] for value in options},
        "respondents": len(ratings),
        "pair_respondents": rateable,
        "matching_pairs": matching,
        "pairs": total_pairs,
        "pair_agreement": matching / total_pairs if total_pairs else None,
    }


def summarize(lines, invites, content):
    packet = content["packet"]
    counters = Counter(dict.fromkeys([
        "deliveries", "test", "invalid", "other_packet", "unknown_invite",
        "duplicate_submission", "repeat_invite", "eligible_responses", "with_comment",
    ], 0))
    expected = {
        "survey_id": packet["survey_id"],
        "survey_version": packet["version"],
        "rubric_version": packet["rubric_version"],
        "packet_sha256": content["fingerprint"],
    }
    by_card = {card["id"]: [] for card in packet["cards"]}
    familiarity_counts = {
        item["id"]: dict.fromkeys(range(1, len(item["labels"]) + 1), 0)
        for item in packet["familiarity"]
    }
    seen_codes = set()
    seen_submissions = set()
    for line in lines:
        if not line.strip():
            continue
        counters["deliveries"] += 1
        try:
            record = json.loads(line)
            code = record["study_code"]
            if code.startswith("test-"):
                counters["test"] += 1
                continue
            if any(record.get(field) != expected[field] for field in expected):
                counters["other_packet"] += 1
                continue
            if code not in invites:
                counters["unknown_invite"] += 1
                continue
            if record.get("consent") != "agreed":
                raise ValueError("Missing consent.")
            submission_id = record["submission_id"]
            if not SUBMISSION.fullmatch(submission_id):
                raise ValueError("Invalid submission ID.")
            ratings = validate_ratings(record["ratings"], packet)
            familiarity = validate_familiarity(record["familiarity"], familiarity_counts)
            comment = record.get("comment", "")
            if not isinstance(comment, str):
                raise ValueError("Expected comment text.")
        except (KeyError, ValueError, AttributeError, TypeError):
            counters["invalid"] += 1
            continue

        if submission_id in seen_submissions:
            counters["duplicate_submission"] += 1
            continue
        seen_submissions.add(submission_id)
        if code in seen_codes:
            counters["repeat_invite"] += 1
            continue
        seen_codes.add(code)
        counters["eligible_responses"] += 1
        counters["with_comment"] += bool(comment.strip())
        for question, score in familiarity.items():
            familiarity_counts[question][score] += 1
        for rating in ratings:
            by_card[rating["card_id"]].append(rating)

    return {
        "packet_sha256": content["fingerprint"],
        "invites": len(invites),
        "participant_flow": dict(counters),
        "familiarity": familiarity_counts,
        "criteria": {
            card["criterion"]: {
                "level": summarize_field(by_card[card["id"]], "level", packet["levels"]),
                "outcome": summarize_field(by_card[card["id"]], "outcome", packet["outcomes"]),
            }
            for card in packet["cards"]
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("records", type=Path, help="UTF-8 JSON Lines file")
    parser.add_argument("--invites", required=True, type=Path)
    parser.add_argument("--release-config", required=True, type=Path)
    args = parser.parse_args()
    try:
        content = load_content(args.release_config)
        invites = read_invites(args.invites)
        with args.records.open(encoding="utf-8") as records:
            result = summarize(records, invites, content)
    except (OSError, KeyError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
