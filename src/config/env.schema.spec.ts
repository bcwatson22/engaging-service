import { defaultPort, invalidMessage, validate } from './env.schema';

const required = {
  SITE_URL: 'https://www.engaging.engineering',
  REDIS_URL: 'redis://127.0.0.1:6379',
  WORKER_URL: 'http://engaging-worker.flycast',
  RENDER_SECRET: 'shared-secret',
  HYGRAPH_WEBHOOK_SECRET: 'hygraph-secret',
  RESEND_API_KEY: 'resend-key',
  CONTACT_FROM: 'contact@engaging.engineering',
  CONTACT_TO: 'hello@engaging.engineering',
};

const setup =
  (config: Record<string, unknown> = {}) =>
  () =>
    validate({ ...required, ...config });

describe('validate', () => {
  it('applies defaults when only the required values are supplied', () => {
    expect(setup()()).toMatchObject({
      NODE_ENV: 'development',
      PORT: defaultPort,
    });
  });

  it('returns the supplied values', () => {
    expect(setup()().SITE_URL).toBe(required.SITE_URL);
  });

  it('coerces a numeric port from its string environment value', () => {
    expect(setup({ PORT: '8080' })().PORT).toBe(8080);
  });

  it('keeps a recognised environment', () => {
    expect(setup({ NODE_ENV: 'production' })().NODE_ENV).toBe('production');
  });

  it('throws when the environment is not recognised', () => {
    expect(setup({ NODE_ENV: 'staging' })).toThrow(invalidMessage);
  });

  it('throws when the port is not a positive integer', () => {
    expect(setup({ PORT: '-1' })).toThrow(invalidMessage);
  });

  it('throws when a required url is missing', () => {
    expect(setup({ SITE_URL: undefined })).toThrow(/SITE_URL —/);
  });

  it('throws when a url is malformed', () => {
    expect(setup({ WORKER_URL: 'not-a-url' })).toThrow(/WORKER_URL —/);
  });

  it('throws when a required credential is empty', () => {
    expect(setup({ RESEND_API_KEY: '' })).toThrow(/RESEND_API_KEY —/);
  });

  it('labels a root-level failure when the config is not an object', () => {
    const parse = () =>
      validate('nonsense' as unknown as Record<string, never>);

    expect(parse).toThrow(/\(root\) —/);
  });
});
