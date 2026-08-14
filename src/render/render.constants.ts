const renderQueue = "render";

const cvPdfJob = "cv-pdf";
const startupImagesJob = "startup-images";

const artifacts = [cvPdfJob, startupImagesJob] as const;

type TArtifact = (typeof artifacts)[number];

type TRenderJob = { force: boolean };

const isArtifact = (value: string): value is TArtifact =>
  (artifacts as readonly string[]).includes(value);

const cvPdf = {
  path: "/cv",
  key: "billy-watson-cv.pdf",
  contentType: "application/pdf",
} as const;

/* Both pages are captured as splash screens, so a change to either should
   re-capture the set. The key is where the content hash is recorded, not an
   object key — there are twenty-two of those. */
const startupImages = {
  paths: ["/", "/cv"],
  key: "startup-images",
} as const;

/* Retries exist for the transient case — a cold site, a slow asset, a browser
   that failed to launch. Exponential from 10s gives the upstream time to
   recover without a job sitting in the queue for hours. */
const jobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 10_000 },
  removeOnComplete: 20,
  removeOnFail: 50,
} as const;

export {
  renderQueue,
  cvPdfJob,
  startupImagesJob,
  artifacts,
  isArtifact,
  cvPdf,
  startupImages,
  jobOptions,
};
export type { TRenderJob, TArtifact };
