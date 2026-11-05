# Product submission — Stage 1

## Shipped behavior

- `/submit` retains its server-verified Supabase session gate and private/no-index metadata.
- New heading, URL-first autofill card, editable product details, and two-step progress navigation.
- Step 2 offers Instant Entry ($1) and Earn Your Spot (free). The original checkout, payment webhook, eligibility checks, votes/reviews requirements, matching and product-creation APIs are unchanged.
- The free option links to existing live battles when no credit is available, shows current progress, and rechecks eligibility before submitting. Refreshing or returning restores the private draft and selected step.
- Drafts use per-user `sessionStorage` keys, expire after 24 hours, and contain only editable product fields and UI step. They are never database products. Successful free submission or the existing confirmed-checkout callback clears the draft. Failed requests and simply opening checkout do not clear it.
- Drafts remain within the current browser tab. Closing the tab clears them; blocked browser storage shows an explicit fallback notice. Switching accounts never restores another account's draft. Do not put credentials or private demo access into these public product fields.

## Autofill and cost

No existing AI provider was found in the project. **The feature works without paid AI:** it extracts website names, descriptions, conservative categories and unambiguous public X profile links. It identifies metadata as the source and asks founders to review results.

The optional `ProductAutofillProvider` interface is in `src/lib/product-autofill.ts`. A configured provider is used only when metadata lacks a name or pitch. Its response must match `AI_DETAILS_SCHEMA` exactly. Product name, pitch and battle pitch must be verbatim phrases present in the extracted evidence; unsupported claims, new keys, invented handles and categories outside Arena's existing list are rejected. Empty fields fall back to manual entry.

### Optional configuration

Leave these **unset** to keep the default metadata-only behavior and incur no AI API charges. No Vercel environment or provider settings were changed by this implementation.

| Server-only variable | Purpose |
| --- | --- |
| `ARENA_AUTOFILL_AI_URL` | Your trusted HTTPS JSON extraction gateway endpoint |
| `ARENA_AUTOFILL_AI_KEY` | Bearer credential for that endpoint |
| `ARENA_AUTOFILL_AI_MODEL` | A small model supported by your gateway |

The gateway receives `POST` JSON containing `model`, `instructions`, `categories`, `evidence`, `responseSchema`, and `maxOutputTokens: 300`. It must treat evidence as untrusted data, use no tools or additional fetches, enforce the supplied schema and output budget, and return the schema object directly:

```json
{"name":"Source product name","pitch":"A source phrase.","category":"General","battlePitch":""}
```

This contract supports any provider through a gateway or a replacement `ProductAutofillProvider` adapter. It is not an OpenAI/Anthropic-specific wire format. Provider errors, oversized responses, timeout or invalid output preserve the metadata/manual path. No live LLM credential was available or used; AI responses were simulated in tests.

## Security and limits

- Authenticated POST route with same-origin checks, a 4 KB request limit, account/IP rate limiting and private/no-store responses.
- Existing in-memory rate limiter reused: 6/account/minute, 30/account/hour, 20/IP/minute. Limits and cache are best-effort per serverless instance, not globally durable quotas. Default metadata mode avoids paid-model billing risk; configure gateway-side quotas before enabling a billable model.
- Per-account, 128-entry, 10-minute in-memory cache deduplicates concurrent requests and does not cache failed reads.
- Public HTTP(S) only; reject credentials, custom ports, private query parameters, internal names, private/reserved IPs, mapped and transition addresses, mixed private/public DNS answers, unsafe redirects and HTTPS downgrades.
- Every redirect is revalidated, with at most 3 hops. Connections pin a validated IP and preserve the original Host and TLS servername; no founder cookies or authorization headers are sent to product sites.
- 10-second total website deadline including DNS/response reads; maximum 300 KB HTML prefix retained, with the rest cancelled. Compressed responses are rejected unless the site honors identity encoding. Optional AI deadline: 5 seconds, response at most 8 KB.
- No scripts, browser automation, logins or internal pages are executed during extraction. JavaScript-only or bot-protected sites may require manual entry. Only one public page is fetched.
- Existing `safeFetch` callers retain their behavior. The stricter public-page helper is added to the same shared module for this flow.
- Networking uses Node's documented [HTTPS request/TLS servername support](https://nodejs.org/api/https.html).

## Files changed

- `src/app/submit/page.tsx`
- `src/components/SubmitForm.tsx`
- `src/components/SubmissionExperience.tsx`
- `src/app/api/submit/autofill/route.ts`
- `src/lib/submission-draft.ts`
- `src/lib/product-autofill-schema.ts`
- `src/lib/product-autofill.ts`
- `src/lib/safe-fetch.ts`
- `tests/product-autofill.test.mjs`
- `docs/submission-stage1.md`

No dependencies, migrations, payment configuration or new required environment variables.

## Verification

- TypeScript, ESLint and production build passed. ESLint retains the two existing warnings in ArenaApp and FeaturedMarquee.
- 107 automated tests passed: 89 regular tests plus 18 server-only tests with `--conditions=react-server`. Seventeen focused tests cover autofill extraction, provider fallback/schema, SSRF/redirect/DNS pinning/deadlines, caching, draft validation and API authorization/limits.
- Local browser testing used the actual submission page, form and existing PayButton against explicitly simulated auth, AI and submission/payment responses. Verified metadata and AI autofill, manual fallback after failure, editing, validation, step-back navigation, refresh, returning from battles/authentication, free credit handling, successful free submission and draft clearing. Paid button reached a simulated checkout; no real charge was made.
- Tested widths: 320, 375, 390, 430, 768 and 1280 pixels. Both steps had no horizontal overflow; interactive controls met 44 px height. Mobile input text is 16 px to avoid keyboard-focus zoom. Light/dark modes were inspected.
- Real read-only website extraction tested against example.com and The Arena without invoking a paid model.

Real provider delivery, a charged checkout and device-specific keyboard/browser behavior remain manual checks. Stage 2 and Stage 3 are not implemented.
