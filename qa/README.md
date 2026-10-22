# Winkler Mechanical — prelaunch security & regression checks

Run the two Node 22+ suites against the live Vercel preview:

```bash
WM_SITE_URL=https://winkler-stripe-checkout-review.vercel.app node --test qa/*.test.mjs
```

These checks are **read-only or validation-only**. They do not book appointments, send customer notifications, or charge money. They cover route responses, no exposed private/temporary files, selected security headers, the 31 optimized gallery thumbnails, PHP-path exposure, unauthorized-origin rejection, incomplete-form rejection, privacy routes, and launch feature flags.

## Distinguish a WAF challenge from a website failure

Vercel may challenge an automated runner with HTTP 403, `x-vercel-mitigated: challenge`, and `Retry-After`. This does **not** mean the underlying page returned 403; the tests explicitly report this state as *inconclusive*. Never disable the WAF simply to make CI green.

For an **approved automated testing identity**, configure Vercel's Automation Bypass feature and save `VERCEL_AUTOMATION_BYPASS_SECRET` as an appropriately scoped GitHub Actions environment secret. Do not commit, print, paste into the chat, or expose this secret to untrusted pull requests. Limit secret-bearing jobs to protected branches and required human reviewers. The tests automatically send the header only when this variable is set.

## Separate release gates

Successful scripts **do not** establish PCI compliance, New Jersey HVACR licensing, legal sufficiency, WCAG conformity, or production-scale readiness. A real-browser/mobile functional test is also required. Do not enable live Stripe charges or public instant booking based on these scripts alone.

The current Vercel project isn't yet Git-linked to a reviewed complete source repository. This QA branch is **not** a deployable copy of production. Do not point Vercel's production branch at it until the complete source has been reconciled and checked in.
