# MSSurvey guided review study

## Preview

Open `survey.html` to try all six cards. The preview keeps drafts in the browser and has delivery disabled. The build also writes the same preview to `docs/index.html` at the repository root for GitHub Pages.

From this folder, build and verify the preview with:

```sh
python3 build.py
python3 build.py --check
python3 verify.py
node check-browser.cjs
```

The browser check needs Playwright and Chrome or Playwright Chromium. Set `PLAYWRIGHT_MODULE` to the installed package path if Node cannot find it. Set `CHROME_PATH` if needed. The test builds with a fake endpoint, intercepts every request, and sends no email. Use `verify.py --paper`, `--readme`, and `--rubric` with files you have on hand to check them against the pins in `source-manifest.json`.

Edit `packet.json` for survey material and `source-manifest.json` for source locations. Update the version when changing the material after a packet has been frozen. The fingerprint covers the packet, source manifest, and consent text.

## Before recruitment

1. Check each card against the pinned paper and README. The cards use paraphrases and a table of reported scores. Confirm text, scope, and applicability before freezing the survey.
2. Confirm the study protocol, consent, retention, and FormSubmit use with the supervisor and Ontario Tech Research Ethics Board. Include the service, study mailbox, and browser draft behavior in the study information. The browser stores the ratings if the participant saves a draft or attempts delivery. A confirmed response leaves a receipt in that browser.
3. Create a JSON file outside Git with two string fields, `endpoint` and `consent`. Use the approved HTTPS FormSubmit AJAX address and consent text. Build the participant page outside the worktree:

   ```sh
   python3 build.py --release-config /private/path/release.json --output /private/path/survey.html
   ```

   Serve that HTML on the approved HTTPS host. Keep the release file, consent text, fingerprint, and analysis plan in the study records. For the authorized dummy delivery, use a link with `#code=test-` followed by 32 lowercase hexadecimal characters. Verify that the message reaches the intended inbox. Browser acceptance means FormSubmit accepted the request.
4. Aim for about 20 reviewers with AI evaluation experience. Check eligibility when recruiting. Give each reviewer a separate invitation with a code in the URL fragment, in the form `#code=<32 lowercase hexadecimal characters>`. Generate each code with a secure random generator, for example `python3 -c 'import secrets; print(secrets.token_hex(16))'`. Ask reviewers to use their own link and complete the review independently. Keep the code list apart from contact details and outside Git.

## Collect and summarize

Keep the original response messages outside Git. In inbox arrival order, copy each study response into a private UTF-8 JSON Lines file, one object per delivery. Use the field names from the messages. The `familiarity` field is a JSON object or string with a score from 1 to 5 for each of `ai`, `benchmarks`, and `scores`. The `ratings` field can be a JSON string or array with six entries, each with `criterion`, `card_id`, `level`, and `outcome`. Write the invited codes to a separate private file, with one code per line.

```sh
python3 analyze.py /private/path/responses.jsonl \
  --invites /private/path/invites.txt --release-config /private/path/release.json
```

The script counts test records, invalid records, other packets, unknown codes, repeat submission IDs, and later responses from the same invite. It keeps the first valid response per invited code. Every reported criterion and field has counts, the number of respondents, and exact agreement among reviewer pairs. The pair calculation excludes Cannot judge and reports how many respondents and pairs it used. When fewer than two people gave a rating, agreement has no estimate.

Report each familiarity question as a distribution of self ratings. These responses describe the reviewer group.

Read the comments to identify questions or guidance that need clarification. Report the number of people who commented, out of the number who responded. Follow the consent terms for any quoted text. Describe the results as agreement among these reviewers on the evidence shown. Pair matches and repeated ratings from one reviewer share observations. Use the saved model results as context and describe the differences in evidence and instructions.
