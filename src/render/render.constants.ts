const renderQueue = 'render';

const cvPdfJob = 'cv-pdf';
const startupImagesJob = 'startup-images';

const artifacts = [cvPdfJob, startupImagesJob] as const;

type TArtifact = (typeof artifacts)[number];

type TRenderJob = { force: boolean };

const isArtifact = (value: string): value is TArtifact =>
  (artifacts as readonly string[]).includes(value);

/* Short, because a CV can be updated minutes before someone is sent the
   link. stale-while-revalidate lets the edge answer instantly and refresh
   behind the request, so freshness costs nobody a wait. */
const cvPdf = {
  path: '/cv',
  key: 'billy-watson-cv.pdf',
  contentType: 'application/pdf',
  cacheControl: 'public, max-age=600, stale-while-revalidate=3600',
} as const;

/* Both pages are captured as splash screens, so a change to either should
   re-capture the set. The key is where the content hash is recorded, not an
   object key — there are twenty-two of those. */
const startupImages = {
  paths: ['/', '/cv'],
  key: 'startup-images',
} as const;

/* The CMS notifies the site and this service at the same moment, so the first
   attempt usually lands while the page is still serving its previous render.
   The ladder only has to outlast that revalidation.

   It used to have a second job. A delayed retry does not wake a sleeping
   machine — an incoming request does, a timer in Redis does not — so the whole
   ladder had to fit inside the two minutes the box stayed awake, and the base
   delay was cut from 10s to 5s to make it fit. `fly.toml` now keeps one
   machine resident, which is what retired that constraint, so the delay goes
   back to 10s: five attempts waiting 10 + 20 + 40 + 80 = 150 seconds. */
/* How long the worker's blocking read waits before re-issuing when the queue
   is empty. BullMQ defaults to a few seconds, which is sensible for a busy
   queue and absurd for this one: idle, it was the largest single contributor
   to 155,000 Redis commands a day, for a queue that runs twice a month.

   Five minutes costs nothing here. Nothing user-facing waits on a render, and
   enqueueing writes the marker key this read is blocked on, so a real job
   wakes the worker immediately — the delay only ever applies to an idle poll.

   Was 60s, which took the queue from ~108 commands a minute to ~9. This takes
   the remainder of the polling down by another fifth. */
const drainDelay = 300;

/* How often the worker looks for jobs whose processor died mid-render.
   BullMQ checks every 30 seconds by default. At two renders a month, five
   minutes is still far quicker than anybody would notice, and it costs a
   tenth as many commands.

   Not disabled outright: this is what recovers a job when the machine is
   replaced mid-render, which is the durability the queue exists to provide. */
const stalledInterval = 300_000;

const jobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: 20,
  removeOnFail: 50,
} as const;

/* Sum of an exponential ladder: delay * (2^(attempts-1) - 1). */
const totalBackoff = (): number =>
  jobOptions.backoff.delay * (2 ** (jobOptions.attempts - 1) - 1);

/* Which pages an artifact is derived from, and the key its content hash is
   recorded under. The processor reaches for these constants directly when it
   renders; this states the association once so the integrity check cannot
   drift from it by checking the wrong page. */
const sourcesFor = (artifact: TArtifact): { paths: string[]; key: string } =>
  artifact === cvPdfJob
    ? { paths: [cvPdf.path], key: cvPdf.key }
    : { paths: [...startupImages.paths], key: startupImages.key };

export {
  renderQueue,
  drainDelay,
  stalledInterval,
  sourcesFor,
  cvPdfJob,
  startupImagesJob,
  artifacts,
  isArtifact,
  cvPdf,
  startupImages,
  jobOptions,
  totalBackoff,
};
export type { TRenderJob, TArtifact };
