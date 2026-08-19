import { jobOptions, totalBackoff } from './render.constants';

describe('jobOptions', () => {
  /* The ladder exists to outlast the site's revalidation after a publish.
     Two minutes is the slowest revalidation seen; anything shorter risks
     giving up while the page is still serving its previous render. */
  it('stays patient for longer than a slow revalidation', () => {
    expect(totalBackoff()).toBeGreaterThanOrEqual(120_000);
  });

  it('still retries enough times to outlast a slow revalidation', () => {
    expect(jobOptions.attempts).toBeGreaterThanOrEqual(5);
  });

  it('backs off exponentially rather than hammering the site', () => {
    expect(jobOptions.backoff.type).toBe('exponential');
  });
});
