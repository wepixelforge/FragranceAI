# AI Agent QA Report

## Environment
- Date/time: 2026-09-20T08:36:33.469Z
- Finished: 2026-09-20T08:37:48.548Z
- URL/host: http://localhost:3000
- Finder: http://localhost:3000/tmperfumehouse/finder
- Brand tested: tmperfumehouse (TM Perfume House)
- Browser: Brave (Chromium/Playwright, headless)
- Viewport: 1440x900
- Test framework: Playwright against the live `/tmperfumehouse/finder` UI, reusing the existing `qa-brave-audit` send/wait/card helpers
- Catalogue source: `src/data/products/tmperfumehouse-products.ts` (18 products)
- Application code: not modified during this audit
- Internal state: captured from `/api/chat` JSON (`intent`, `results`, `updatedState`, `debugInfo`, `cartAction`, partial-match fields)
- Regrade: first-pass price regex matched nearby products and note names (e.g. “white musk” note vs White Musk). Those false positives were removed. Transcripts were not changed.

## Overall Result
- Total tests: 20
- Passed: 20
- Failed: 0
- Blocked: 0
- Critical: 0
- High: 0
- Medium: 0
- Low: 0

## Test Summary

| Test | Scenario | Result | Severity | Main Finding |
|---|---|---|---|---|
| A1 | Fresh office under ₹800 | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| A2 | Dior Sauvage but warmer | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| A3 | Alternative to Creed Aventus | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| B1 | Fresh → warmer → keep it fresh | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| B2 | Woody then show something else | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| B3 | Fresh → start fresh → woody | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| C1 | Royal Oud then its notes | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| C2 | Royal Oud longevity | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| D1 | Compare then which is sweeter | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| E1 | Smells like pizza | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| E2 | Smells like hotdog | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| E3 | Smells like a chair | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| E4 | Smells like a car | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| E5 | Pizza → burger → pizza again | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| F1 | Capital of France | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| F2 | Write Python code | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| G1 | Fresh woody under ₹800 all-day | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| G2 | Legitimate partial match (intense and refreshing) | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| H1 | Find three fresh, add first, view cart | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |
| H2 | Add the first one (fresh session) then remove | PASS | PASS | Behaved correctly against catalogue, UI cards, and API state. |

## Detailed Failures

No failed tests after regrade.
## Product Truth Issues

None observed.

## State / Context Issues

None observed.

## Recommendation Issues

None observed.

## Cart Issues

None observed.

## Brand Isolation Issues

None observed.

## Conversational Quality

No meaningful conversational defects.

Not flagged (style, not bugs):
- “Back to the pizza idea?” on E5 — pizza remained NO_MATCH; no product was invented.
- Groq vs deterministic wording differences on product info and out-of-scope replies.

## Passing Highlights

- **A1 Fresh office under ₹800:** Fresh Linen / Ocean Breeze / White Musk, all ≤ ₹800, cards matched the API, prices in the reply matched the catalogue when bound to the correct product name.
- **A2 Dior Sauvage but warmer:** Passed behavioral checks.
- **A3 Alternative to Creed Aventus:** Honest NO_MATCH for Creed Aventus (this 18-SKU demo catalogue has no `similarTo: Creed Aventus`). No fabricated alternative.
- **B1 Fresh → warmer → keep it fresh:** Fresh → warmer (Amber Nights / Royal Oud / Cedar Noir) → “Actually keep it fresh” returned to Ocean Breeze / Fresh Linen / Citrus Sport with a “Back to something fresh?” callback.
- **B2 Woody then show something else:** Passed behavioral checks.
- **B3 Fresh → start fresh → woody:** RESET_CONSULTATION cleared the fresh thread; woody recs were Mystic Woods / Cedar Noir / Gentleman’s Club with no fresh leak in `activeRequest.families`.
- **C1 Royal Oud then its notes:** “What are its notes?” classified PRODUCT_INFO and listed Royal Oud’s real notes (saffron, rose, cardamom, oud, agarwood, incense, sandalwood, amber, vetiver).
- **C2 Royal Oud longevity:** Longevity follow-up used catalogue `beast-mode`, not a hallucinated all-day/moderate claim.
- **D1 Compare then which is sweeter:** Comparison context held; “Which one is sweeter?” stayed COMPARE_PRODUCTS and answered Amber Nights.
- **E1 Smells like pizza:** Pizza: CLARIFICATION, zero cards, fragrance-focused.
- **E2 Smells like hotdog:** Hotdog: no Midnight Velvet, no invented hotdog note.
- **E3 Smells like a chair:** Chair asked which aspect; did not auto-map leather/wood or recommend a product.
- **E4 Smells like a car:** Car asked materials / interior / overall smell; no product cards.
- **E5 Pizza → burger → pizza again:** Burger stayed in-scope (not OUT_OF_SCOPE). Third turn: “Back to the pizza idea?” and still no product.
- **F1 Capital of France:** OUT_OF_SCOPE; did not name Paris; no perfume cards.
- **F2 Write Python code:** OUT_OF_SCOPE; no Python; no perfume cards.
- **G1 Fresh woody under ₹800 all-day:** NO_VALID_MATCH for fresh+woody+₹800+all-day; no Fresh Linen leak; offered loosening longevity/budget/family.
- **G2 Legitimate partial match (intense and refreshing):** PARTIAL_MATCH Ocean Breeze with an explicit trade-off (refreshing, moderate rather than strong).
- **H1 Find three fresh, add first, view cart:** First rec Ocean Breeze added; live cart and “What’s in my cart?” both showed Ocean Breeze at ₹649.
- **H2 Add the first one (fresh session) then remove:** Fresh session “Add the first one.” asked for a list instead of mutating a stale cart; subsequent view was empty.

## Recommended Fix Order

1. Critical
   - None
2. High
   - None
3. Medium
   - None
4. Low
   - None

This audit did not modify application code, prompts, catalogue data, or recommendation logic.
