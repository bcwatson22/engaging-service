import { idleTimeout, jobOptions, totalBackoff } from './render.constants';

describe('jobOptions', () => {
  /* A delayed retry does not wake a sleeping machine — only an incoming
     request does. If the ladder outlasts the idle timeout its final attempts
     never fire, and the artifact stays stale with nothing to signal it. */
  it('finishes every attempt before the machine can sleep', () => {
    expect(totalBackoff()).toBeLessThan(idleTimeout);
  });

  it('still retries enough times to outlast a slow revalidation', () => {
    expect(jobOptions.attempts).toBeGreaterThanOrEqual(5);
  });

  it('backs off exponentially rather than hammering the site', () => {
    expect(jobOptions.backoff.type).toBe('exponential');
  });
});
