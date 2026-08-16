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

/* The machine sleeps after roughly two minutes without traffic, and a
   delayed retry does not wake it — an incoming request does, a timer in Redis
   does not. So the whole ladder has to fit inside the window the machine is
   awake for, or its tail is stranded until something else happens to wake the
   box, leaving an artifact silently stale until the next publish.

   Five attempts from 5s gives 5 + 10 + 20 + 40 = 75 seconds, comfortably
   inside it. At 10s it was 150 seconds and the last two attempts could fall
   past the machine's bedtime. */
const idleTimeout = 120_000;

const jobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: 20,
  removeOnFail: 50,
} as const;

/* Sum of an exponential ladder: delay * (2^(attempts-1) - 1). */
const totalBackoff = (): number =>
  jobOptions.backoff.delay * (2 ** (jobOptions.attempts - 1) - 1);

export {
  renderQueue,
  cvPdfJob,
  startupImagesJob,
  artifacts,
  isArtifact,
  cvPdf,
  startupImages,
  jobOptions,
  idleTimeout,
  totalBackoff,
};
export type { TRenderJob, TArtifact };
