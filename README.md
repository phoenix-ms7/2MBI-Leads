# 2-MBI Client Finder Dashboard (POC)

A static, no-backend dashboard that tracks Indian companies likely to buy
2-Mercaptobenzimidazole (2-MBI, CAS 583-39-1), with evidence links, a lead score, and
procurement contacts, so outreach can be tracked and emails drafted. See
[PLAN.md](PLAN.md) for the full background and scoring rules.

This is a proof of concept: plain HTML/CSS/JS, no build step, no npm, no API keys. All
lead data lives in `data/leads.json` and is researched and added by hand.

## Running locally

Browsers block `fetch()` on files opened directly from disk (`file://`), so serve the
folder over HTTP:

```bash
# Python
python -m http.server 8000

# or Node
npx serve .
```

Then open `http://localhost:8000`.

## Adding a lead

1. Pick a candidate (the seed list in `data/leads.json`, the FDA DMF Excel export, or a
   directory like PharmaCompass/Pharmaoffer).
2. Research it — in Claude or by hand — using this prompt:

   > Research whether this Indian company uses 2-Mercaptobenzimidazole (2-MBI, CAS
   > 583-39-1). Company: {name}, website: {domain}. End products that use 2-MBI:
   > lansoprazole, dexlansoprazole, rabeprazole and their intermediates; MB/ZMBI rubber
   > antioxidant. Search the company's own site and public filings. Return one JSON
   > object in the exact `leads.json` format (evidence with `snippet` + `source_url`).
   > Never guess. Leave a field empty if there is no source.

3. **Check every link yourself.** Open each `source_url` and confirm the quoted
   `snippet` is actually there. Delete anything that doesn't check out — a wrong claim
   is worse than no claim.
4. Find a procurement contact (company website, Apollo/Hunter free tier, or by phoning
   the plant). Procurement titles to look for: Purchase Manager, Head of Purchase,
   Procurement Manager, Sourcing Manager, Supply Chain Head, Materials Manager,
   Commercial Manager, "RM Purchase". For small companies, fall back to the Director or
   Plant Head. Record where the contact came from in `source`.
5. Add the JSON object to the array in `data/leads.json`. Allowed `signal` values:
   `import`, `clearance`, `dmf`, `cep`, `website`, `rubber`, `patent`.
6. Commit and push. GitHub Pages redeploys within a minute or two.

Never invent a contact name, email, or evidence snippet — leave the field empty instead.

The four `example-*` entries in `data/leads.json` are fictional, clearly marked, and
only there to show the scoring bands and screens working. Delete them whenever you like.

## Editing the scoring

The point values live in the `SCORING` object at the top of `app.js`. Bands (Hot/Warm/
Cold) are in the `BANDS` array just below it.

## Outreach tracking

Outreach stage, next-step date and notes are saved in the browser's `localStorage`, not
in the JSON file — they're per-browser, not shared. Use the **Export progress** /
**Import progress** buttons in the header to back them up or move them to another
browser.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch", branch
   `main`, folder `/ (root)`.
4. The site appears at `https://<username>.github.io/<repo>/` within a minute or two.

## Known limitations (by design, for this POC)

- No backend, database, or live API calls — all discovery is manual.
- No login — anyone with the link can view the page (and, if the repo is public,
  the full `leads.json`). Keep real contact names/emails out of the file, or make the
  repo private, until there's a reason to expose them (private GitHub Pages requires a
  paid GitHub plan).
- No email is sent from the app — "Draft email" only opens a pre-filled `mailto:` link
  in your own mail client.
