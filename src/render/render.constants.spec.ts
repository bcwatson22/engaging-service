import {
  artifacts,
  cvPdf,
  cvPdfJob,
  isArtifact,
  startupImages,
  startupImagesJob,
} from './render.constants';

/* The retry ladder these used to describe went with the processor — the Go
   worker runs its own, in its own process. What is left is the description of
   the artifacts themselves, which this service still needs to ask for them and
   to check them for drift. */
describe('artifacts', () => {
  it('covers both of them', () => {
    expect(artifacts).toEqual([cvPdfJob, startupImagesJob]);
  });

  /* The job names are half of the queue contract: the worker maps these exact
     strings to what it renders, and an unknown one is dead-lettered. */
  it('names them as the worker expects', () => {
    expect(cvPdfJob).toBe('cv-pdf');
    expect(startupImagesJob).toBe('startup-images');
  });

  it('recognises its own artifacts and nothing else', () => {
    expect(isArtifact(cvPdfJob)).toBe(true);
    expect(isArtifact('og-images')).toBe(false);
  });

  /* The pages an artifact is derived from, which the integrity check hashes.
     The splash screens come from both, so a change to either re-makes the set. */
  it('records which pages each is derived from', () => {
    expect(cvPdf.path).toBe('/cv');
    expect(startupImages.paths).toEqual(['/', '/cv']);
  });

  /* Where the site links to it, and where the content hash is recorded. */
  it('keeps the keys the site and the worker both use', () => {
    expect(cvPdf.key).toBe('billy-watson-cv.pdf');
    expect(startupImages.key).toBe('startup-images');
  });
});
