# 2-MBI Client Finder Dashboard — Build Plan

Goal: a static dashboard that finds Indian companies that buy, or are likely to start
buying, 2-Mercaptobenzimidazole (2-MBI, CAS 583-39-1), with a named procurement
contact for each, so Finornic can send outreach emails.

A company is a lead when there is evidence that 2-MBI is a raw material or intermediate
for something it makes, or that it already imports or buys 2-MBI. Every lead shows that
evidence with a source link.

This is a POC: a static site with no backend, hosted on GitHub Pages. Lead data is
researched offline and saved as JSON that the page reads.

## Evidence signals (strongest to weakest)

1. `import` — appears in Indian import records for 2-MBI. Direct, buying-now signal.
2. `dmf` / `cep` — US DMF, EU CEP, or Indian CDSCO approval for lansoprazole or
   rabeprazole.
3. `clearance` — environmental clearance document lists 2-MBI as a raw material.
4. `website` — company site/catalog lists an end product (lansoprazole, rabeprazole,
   dexlansoprazole, or an intermediate).
5. `rubber` — company site/catalog lists MB/ZMBI antioxidant or a latex/rubber product
   that uses it.
6. `patent` — patent or paper mentions 2-MBI. Weakest signal.

Each signal is a separate evidence row with its source URL and a short quoted snippet.

## Scoring (0-100, capped)

| Signal | Points |
|---|---|
| `import` — import record in the last 24 months | +40 |
| `clearance` — environmental clearance lists 2-MBI | +35 |
| `dmf` / `cep` — DMF or CEP for lansoprazole, dexlansoprazole, rabeprazole | +30 |
| `website` — site lists one of those APIs or intermediates | +20 |
| `rubber` — site lists MB/ZMBI antioxidant or a latex/rubber product | +15 |
| Plant in Gujarat, Maharashtra or Telangana | +10 |
| Verified procurement email found | +5 |
| `patent` — patent/paper mention only | +5 |
| Captive (makes 2-MBI in-house) | -30 |
| Is a 2-MBI manufacturer/trader (competitor) | excluded from lead list, shown on Competitors tab |

Bands: 70+ Hot, 40-69 Warm, below 40 Cold.

## Data model (`data/leads.json`)

One object per company; evidence and contacts nested inside. Score is calculated by
`app.js` from evidence, not stored.

```json
{
  "id": "metrochem-api",
  "name": "Metrochem API Private Limited",
  "website": "https://example.com",
  "segment": "pharma",
  "state": "Telangana",
  "city": "Hyderabad",
  "end_products": ["lansoprazole", "rabeprazole"],
  "captive_2mbi": "unknown",
  "is_competitor": false,
  "is_example": false,
  "evidence": [
    {
      "signal": "dmf",
      "end_product": "lansoprazole",
      "snippet": "Lansoprazole USP, DMF holder",
      "source_url": "https://...",
      "date": "2026-10-01"
    }
  ],
  "contacts": [
    { "name": "", "title": "Purchase Manager", "email": "", "email_status": "unknown", "source": "manual" }
  ],
  "notes": ""
}
```

Allowed `signal` values: `import`, `clearance`, `dmf`, `cep`, `website`, `rubber`,
`patent`. Outreach stage, next-step date and notes are kept per company in
`localStorage`, not in the JSON file.

Outreach stages: New, Researching, Ready to contact, Emailed, Replied, Sample sent,
Quoted, Won, Lost, Not a fit.

## How to add a lead (see README.md)

1. Pick a candidate (seed list, FDA DMF Excel, directory).
2. Research it — confirm each evidence snippet against its source link yourself. Never
   invent a quote, link, contact name or email.
3. Find a procurement contact (company site, Apollo/Hunter free tier, or phone).
4. Add the JSON object to `data/leads.json`, commit, and push.

## Scope

In scope: India-based companies, 2-MBI only, browsable lead list with evidence/scores/
contacts, outreach status tracked in the browser, template-based first email via
`mailto:`.

Out of scope: backend/database, live API calls, automated discovery, login, sending
email from the app, any API keys in the code (this is a public static page).
