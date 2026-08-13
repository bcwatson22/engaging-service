const renderQueue = "render";

const cvPdfJob = "cv-pdf";

const cvPdf = {
  path: "/cv",
  key: "billy-watson-cv.pdf",
  contentType: "application/pdf",
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

export { renderQueue, cvPdfJob, cvPdf, jobOptions };
