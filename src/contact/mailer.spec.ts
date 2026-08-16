import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { honeypotField, type TContact } from './contact.schema';
import { endpoint, Mailer, type TResendBody } from './mailer';

const env = {
  RESEND_API_KEY: 'resend-key',
  CONTACT_FROM: 'contact@engaging.engineering',
  CONTACT_TO: 'hello@engaging.engineering',
};

const contact: TContact = {
  name: 'Tom Tollafield',
  email: 'tom@example.com',
  message: 'I would like to talk to you about a role.',
  [honeypotField]: '',
  renderedAt: 1_760_000_000_000,
};

const setup = async ({ ok = true, status = 200 } = {}) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue({
    ok,
    status,
    text: () => Promise.resolve('provider detail'),
  } as Response);

  vi.stubGlobal('fetch', fetch);

  const module = await Test.createTestingModule({
    providers: [
      Mailer,
      {
        provide: ConfigService,
        useValue: { get: (key: keyof typeof env) => env[key] },
      },
    ],
  }).compile();

  return { mailer: module.get(Mailer), fetch };
};

/* fetch's own signature types init loosely — headers may be a Headers, a
   tuple array or a record — so the recorded call is narrowed once here to
   what this caller actually sends, rather than asserted at every use. */
type TSentRequest = {
  headers: Record<string, string>;
  body: string;
};

const requestOf = (
  fetch: ReturnType<typeof setup> extends Promise<{ fetch: infer F }>
    ? F
    : never,
): TSentRequest => {
  const [, init] = fetch.mock.calls[0] ?? [];

  if (!init) throw new Error('fetch was never called');

  return init as TSentRequest;
};

/* The body is JSON on the request, so assertions read it back rather than
   matching a serialised string. */
const bodyOf = (fetch: Parameters<typeof requestOf>[0]): TResendBody =>
  JSON.parse(requestOf(fetch).body) as TResendBody;

describe('Mailer', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('posts the message to Resend', async () => {
    const { mailer, fetch } = await setup();

    await mailer.send(contact);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(endpoint);
  });

  it('authenticates with the configured key', async () => {
    const { mailer, fetch } = await setup();

    await mailer.send(contact);

    expect(requestOf(fetch).headers.authorization).toBe(
      `Bearer ${env.RESEND_API_KEY}`,
    );
  });

  it('sends from the verified domain, not from the visitor', async () => {
    const { mailer, fetch } = await setup();

    await mailer.send(contact);

    expect(bodyOf(fetch).from).toBe(env.CONTACT_FROM);
    expect(bodyOf(fetch).to).toBe(env.CONTACT_TO);
  });

  it('puts the visitor in reply_to, so replying reaches them', async () => {
    const { mailer, fetch } = await setup();

    await mailer.send(contact);

    expect(bodyOf(fetch).reply_to).toBe(contact.email);
  });

  it('names the sender in the subject', async () => {
    const { mailer, fetch } = await setup();

    await mailer.send(contact);

    expect(bodyOf(fetch).subject).toContain(contact.name);
  });

  it('carries the address and message in the body', async () => {
    const { mailer, fetch } = await setup();

    await mailer.send(contact);

    expect(bodyOf(fetch).text).toContain(contact.email);
    expect(bodyOf(fetch).text).toContain(contact.message);
  });

  it('throws when the provider refuses, so nothing reports success', async () => {
    const { mailer } = await setup({ ok: false, status: 422 });

    await expect(mailer.send(contact)).rejects.toThrow('422');
  });
});
