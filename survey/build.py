"""Build the standalone survey. The default build has delivery disabled."""

import argparse
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PREVIEW = HERE / "survey.html"
PAGES_PREVIEW = ROOT / "docs" / "index.html"
ENDPOINT_PATTERN = r"https://formsubmit\.co/ajax/(?:[\w-]+|[\w.+%-]+@[\w.-]+)"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def encode_json(data):
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def load_content(config_path=None):
    packet = read_json(HERE / "packet.json")
    manifest = read_json(HERE / "source-manifest.json")
    consent = None
    endpoint = None
    if config_path is not None:
        config_path = config_path.resolve()
        if config_path.is_relative_to(ROOT):
            raise ValueError("Keep the release config outside the Git worktree.")
        config = read_json(config_path)
        if not isinstance(config, dict):
            raise ValueError("The release config must be a JSON object.")
        endpoint, consent = config["endpoint"], config["consent"]
        if not isinstance(endpoint, str) or not re.fullmatch(ENDPOINT_PATTERN, endpoint, re.ASCII):
            raise ValueError("Use an HTTPS FormSubmit AJAX endpoint.")
        if not isinstance(consent, str) or not consent.strip():
            raise ValueError("Provide the approved consent text.")
        consent = consent.strip()
    content = {"packet": packet, "manifest": manifest, "consent": consent}
    fingerprint = hashlib.sha256(encode_json(content).encode("utf-8")).hexdigest()
    return {**content, "fingerprint": fingerprint, "endpoint": endpoint}


def render_page(content):
    parts = {
        "STYLE": (HERE / "survey.css").read_text(encoding="utf-8"),
        "SCRIPT": (HERE / "survey.js").read_text(encoding="utf-8"),
        "DATA": encode_json(content).replace("<", "\\u003c"),
    }
    template = (HERE / "template.html").read_text(encoding="utf-8")
    return re.sub(r"__(STYLE|SCRIPT|DATA)__", lambda match: parts[match[1]], template)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="check both tracked previews")
    parser.add_argument("--release-config", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.check and (args.release_config or args.output):
        parser.error("--check applies to the preview only")
    if args.release_config and (not args.output or args.output.resolve().is_relative_to(ROOT)):
        parser.error("write the release with --output outside the Git worktree")
    try:
        content = load_content(args.release_config)
    except (OSError, ValueError, KeyError) as error:
        parser.error(f"Could not load survey content ({type(error).__name__}). {error}")
    html = render_page(content)
    outputs = [args.output] if args.output else [PREVIEW, PAGES_PREVIEW]
    if args.check:
        for output in outputs:
            if not output.exists() or output.read_text(encoding="utf-8") != html:
                parser.exit(1, f"{output.relative_to(ROOT)} differs from its inputs. Run build.py.\n")
        print("Both survey previews match their inputs.")
        return
    for output in outputs:
        output.write_text(html, encoding="utf-8")
        print(f"Built {output} · {content['fingerprint']}")


if __name__ == "__main__":
    main()
