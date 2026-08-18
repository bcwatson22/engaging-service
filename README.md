# Engaging Service

[![CI](https://github.com/bcwatson22/engaging-service/actions/workflows/ci.yml/badge.svg)](https://github.com/bcwatson22/engaging-service/actions/workflows/ci.yml)
![Coverage 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)

Render service for [engaging.engineering](https://www.engaging.engineering) — a [NestJS](https://nestjs.com/) app that generates the site's browser-rendered artifacts on a queue, instead of inside the site's build. The site itself lives in [engaging](https://github.com/bcwatson22/engaging).

## Stack

### NestJS

<table>
  <tr>
    <td width="58">
      <img src="https://cdn.simpleicons.org/nestjs" alt="NestJS icon" width="32" />
    </td>
    <td>
      Modules, DI and lifecycle hooks give the queue, the schedulers and the HTTP surface one shape, and its testing module makes the wiring assertable rather than mocked around.
    </td>
  </tr>
</table>

### TypeScript

<table>
  <tr>
    <td width="58">
      <img src="https://cdn.simpleicons.org/typescript" alt="TypeScript icon" width="32" />
    </td>
    <td>
      Strict throughout, with <a href="https://zod.dev/">Zod</a> validating the environment at boot - so a missing secret fails the release rather than the first request that happens to need it.
    </td>
  </tr>
</table>

### Puppeteer

<table>
  <tr>
    <td width="58">
      <img src="https://cdn.simpleicons.org/puppeteer" alt="Puppeteer icon" width="32" />
    </td>
    <td>
      Drives headless Chrome over the live site to produce the CV PDF and the 22 PWA splash screens. A render takes 10-20 seconds, which is why it lives here and not in a serverless function.
    </td>
  </tr>
</table>

### BullMQ & Redis

<table>
  <tr>
    <td width="58">
      <img src="https://cdn.simpleicons.org/redis" alt="Redis icon" width="32" />
    </td>
    <td>
      The webhook returns as soon as the job is queued, so the CMS never waits on a render. Redis also backs the contact form’s rate limiting.
    </td>
  </tr>
</table>

### Cloudflare R2

<table>
  <tr>
    <td width="58">
      <img src="https://cdn.simpleicons.org/cloudflare" alt="Cloudflare icon" width="32" />
    </td>
    <td>
      Rendered artifacts are uploaded here over the S3 API and served through the site’s own domain, so visitors never see a bucket URL and Vercel’s CDN absorbs the traffic.
    </td>
  </tr>
</table>

### Resend

<table>
  <tr>
    <td width="58">
      <img src="https://cdn.simpleicons.org/resend" alt="Resend icon" width="32" />
    </td>
    <td>
      Sends the contact form from a verified address on this domain with the visitor in <code>reply_to</code>, which keeps DMARC happy and still lets a reply reach whoever wrote in.
    </td>
  </tr>
</table>

### Fly.io

<table>
  <tr>
    <td width="58">
      <img src="https://cdn.simpleicons.org/flydotio" alt="Fly.io icon" width="32" />
    </td>
    <td>
      A long-lived container, which a ~150 MB browser binary needs. One machine stays resident so the contact form never meets a cold boot - see <a href="#why-the-machine-no-longer-sleeps">below</a> for the measurements behind that.
    </td>
  </tr>
</table>

### Vitest

<table>
  <tr>
    <td width="58">
      <img src="https://cdn.simpleicons.org/vitest" alt="Vitest icon" width="32" />
    </td>
    <td>
      100% coverage, with thresholds set in <code>vitest.config.mts</code> and enforced by CI. Composition roots are excluded and covered by the e2e path instead.
    </td>
  </tr>
</table>

### Rust

<table>
  <tr>
    <td width="58">
      <img src="https://cdn.simpleicons.org/rust" alt="Rust icon" width="32" />
    </td>
    <td>
      Only indirectly: <a href="https://oxc.rs/">oxlint and oxfmt</a> are compiled Rust binaries and handle all linting and formatting here. No Rust is written in this repo. It is worth naming because the toolchain is where most TypeScript projects meet the language first.
    </td>
  </tr>
</table>

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

Copy `.env.example` to `.env` and fill it in, then start a local Redis:

```bash
docker run -d -p 6379:6379 --name engaging-redis redis:7-alpine
```

```bash
pnpm install && pnpm dev
```

## Deployment

Merging to `main` deploys. CI runs lint, format, types, coverage and a build,
and only a green run reaches `flyctl deploy` — nothing is run by hand.

Secrets live in Fly rather than in CI, set with `fly secrets set KEY=value`.
They are validated at boot by `src/config/env.schema.ts`, so a missing one
fails the release rather than the first request that happens to need it.

To roll back, list the releases and redeploy the image from a good one:

```bash
fly releases -a engaging-service
```

## Endpoints

| Route                         | Trigger       | Notes                                                                                         |
| ----------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `POST /webhooks/hygraph`      | A CMS publish | Verifies `gcms-signature`. Queues every artifact, each waiting for its own content to change. |
| `POST /contact`               | A visitor     | The site's contact form. CORS-locked to `SITE_URL`. See below.                                |
| `POST /render/cv-pdf`         | You, by hand  | Guarded by `x-render-secret`. Forces a render, skipping the content check.                    |
| `POST /render/startup-images` | You, by hand  | As above, for the 22 PWA splash screens.                                                      |
| `GET /status`                 | Anyone        | What the last render produced and how deep the queue is. Cached for a minute.                 |
| `GET /health`                 | The platform  | Readiness.                                                                                    |

Trigger a render by hand:

```bash
curl -X POST localhost:3000/render/cv-pdf -H "x-render-secret: $RENDER_SECRET"
```

Both return `202` with a job id - the render takes 10-20 seconds, far longer
than a webhook sender will wait. The worker logs the render and the resulting
public URL.

The manual route forces the render deliberately: it exists for re-rendering
after a change the CMS knows nothing about, such as a print-stylesheet tweak,
which the unchanged-content check would otherwise reject.

## The status endpoint

`GET /status` answers "is the PDF current?" without reading the logs. Per
artifact it returns the last twenty renders, newest first — so the head of the
list is "when was this last rendered" and the rest is a history — along with the
queue's waiting, active, delayed and failed counts.

Each entry records what the render produced (a public URL for the PDF, a count
for the startup images, which have no single URL between them) and what it cost:

| Field        | Means                                                                      |
| ------------ | -------------------------------------------------------------------------- |
| `durationMs` | The render itself — headless Chrome, then the upload.                      |
| `elapsedMs`  | Enqueue to finish, so it spans every attempt and the backoff between them. |
| `attempts`   | How many passes it took before the live page had changed.                  |

The gap between `elapsedMs` and `durationMs` is the interesting one: it is how
long the site took to catch up after a CMS publish, which is the race the
content-hash check retries through. Nothing else records that — the logs are the
only other place it exists, and they go with the machine.

`RecordStore` writes an entry on the `completed` event, the one place both
artifacts finish, so an artifact cannot be added that renders but never reports.
The list is capped at twenty: renders happen roughly twice a month, so that is
the best part of a year, and short enough to read whole on every request.

It is unguarded on purpose — it exists to be looked at — and deliberately
boring. No environment values, no error text, no internal hostnames. Nothing in
it tells anybody something they could not learn by watching the site. The
minute-long `cache-control` stops it being used to probe the service or to keep
the machine awake.

## The integrity check

Artifacts are only ever re-made when the CMS publishes. A change shipped from
the site's own repo — a print stylesheet, a font, a layout fix — changes the
page without touching Hygraph, so the PDF and the splash screens quietly drift
from what they are supposed to depict. `POST /render/cv-pdf` exists precisely
because of that, which is an admission that the automation has a gap rather
than a fix for it.

Weekly, this hashes the live pages an artifact is derived from and compares
that against the hash of whatever was last rendered from them. On a mismatch it
queues a render — unforced, so the render's own content check still waits for
the site rather than skipping the retry ladder.

The result of the last check is reported by `GET /status`, per artifact:

| Field     | Means                                                                             |
| --------- | --------------------------------------------------------------------------------- |
| `drifted` | The live page no longer matches what was last rendered from it.                   |
| `queued`  | This check enqueued a render to put that right.                                   |
| `stale`   | It drifted, a previous check already queued a render, and it is _still_ drifting. |

`stale` is the one to care about: something is wrong that re-rendering will not
fix. The check deliberately stops queueing at that point rather than asking
again every week, which would be a slow loop that never fixes anything and
hides the problem in a normal-looking log line.

Two things it does not do. Nothing rendered yet is not drift — there is no
previous version to have drifted from, and queueing there would fight whatever
is meant to produce the first one. And it only runs at all because the machine
stopped sleeping: a timer in a stopped container never fires.

A deploy hook from the site would be tighter than a schedule, and is the better
answer if that pipeline ever calls this. The schedule is the version that needs
no coupling between two deploys.

## The contact endpoint

`POST /contact` is the one route a person waits on, which makes it the
exception to the rule below — so it is worth setting out why it is here.

Submissions are filtered before anything is sent. A hidden honeypot field and
a check on how long the form was open catch automated posts; both answer `202`
with the same body a real submission gets, because telling a bot which signal
caught it is how it learns to avoid that signal. Genuine submissions are then
rate-limited in Redis, by client address and by the address they gave, before
the send is attempted rather than after — so a provider outage cannot be
retried into an unbounded number of attempts.

Mail goes out through Resend from a verified address on this domain, with the
visitor in `reply_to`. Sending _as_ the visitor would fail their domain's DMARC
and be refused by Resend anyway; this way a reply in any mail client reaches
the person who wrote.

### Why the machine no longer sleeps

This service used to scale to zero between renders. It was measured at **21.3
seconds to cold-boot against 46ms warm** — the image carries Chrome, and that
is what a browser costs at startup. Renders never noticed, because nothing
waits on them. A contact form does, and since it is used a few times a month
it would have found the machine cold essentially every time.

So `fly.toml` now keeps one machine resident. That cost falls when the render
half moves out and this tier stops shipping a browser. It also retires two
bugs rather than working around them: the dead Upstash sockets handled in
`fix/redis-resilience` and the truncated retry window in
`fix/retry-within-idle-window` were both consequences of sleeping.

### The amended principle

The original rule for this service was: _it only ever removes things from the
critical path; if a feature would make the live site depend on this container,
it does not belong here._

A contact endpoint appears to break that, so the rule is now stated more
precisely: **this service never sits between a visitor and content, and any
request-time feature it owns must degrade to something that needs no server.**

Pages stay prerendered and webhook-revalidated, so nothing anybody reads passes
through here. And the contact form is an enhancement over a capability the site
already had — the CV carries a `mailto:` and a `tel:` link. If this service is
down, the form falls back to that link rather than showing an error.
