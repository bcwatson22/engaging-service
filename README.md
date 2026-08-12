# engaging-service

Render service for [engaging.engineering](https://www.engaging.engineering) — a [NestJS](https://nestjs.com/) app that generates the site's browser-rendered artifacts on a queue, instead of inside the site's build.

## Why it exists

The portfolio's CV page has a downloadable PDF, and its PWA manifest needs a set of per-device splash screens. Both are produced by driving headless Chrome over the live site. That work used to run inside `next build`, which meant:

- every deploy downloaded a Chrome binary and performed a full render, so an unrelated CSS change paid the cost;
- a slow download or a render timeout failed the deploy;
- the artifacts could only change when the site was deployed, even though the pages themselves refresh within seconds of a CMS publish.

A 10–20 second headless render does not fit a serverless function's execution limits, and a ~150 MB browser binary is not something to cold-start per invocation. So it lives here, in a long-lived container, triggered by the same CMS webhook that revalidates the site.

## How it works

A Hygraph publish fires two independent webhooks — one to the site to revalidate its pages, one to this service. This service verifies the signature, puts a job on a Redis-backed queue and returns immediately. A worker then renders the artifact with headless Chrome and uploads it to object storage, where the site links to it at a stable URL.

The two webhooks are deliberately independent rather than chained: this service is never in the content-publish path, so if it is down the site still refreshes normally. Only the artifacts go stale.

The cost of that independence is a race — the worker can load a page before the site has finished revalidating, capturing stale content. The worker therefore hashes the live page before rendering and retries with backoff until the hash changes.

## Status

Under construction. See the branch table in the plan for what has landed.

## Development

```bash
pnpm install
pnpm dev
```

Copy `.env.example` to `.env` and fill it in first.
