import {
  contactSchema,
  honeypotField,
  looksAutomated,
  maxElapsedMs,
  maxMessage,
  maxName,
  minElapsedMs,
  minMessage,
} from './contact.schema';

const now = Date.parse('2026-08-16T12:00:00.000Z');

const valid = {
  name: 'Tom Tollafield',
  email: 'tom@example.com',
  message: 'I would like to talk to you about a role.',
  [honeypotField]: '',
  renderedAt: now - minElapsedMs * 2,
};

const setup = (overrides: Record<string, unknown> = {}) =>
  contactSchema.safeParse({ ...valid, ...overrides });

describe('contactSchema', () => {
  it('accepts a filled-in form', () => {
    expect(setup().success).toBe(true);
  });

  it('trims surrounding whitespace from the message', () => {
    expect(setup({ message: `  ${valid.message}  ` }).data?.message).toBe(
      valid.message,
    );
  });

  it('rejects a message too short to be an enquiry', () => {
    expect(setup({ message: 'a'.repeat(minMessage - 1) }).success).toBe(false);
  });

  it('rejects a message long enough to be a payload', () => {
    expect(setup({ message: 'a'.repeat(maxMessage + 1) }).success).toBe(false);
  });

  it('rejects a name longer than a name', () => {
    expect(setup({ name: 'a'.repeat(maxName + 1) }).success).toBe(false);
  });

  it('rejects a name that is only whitespace', () => {
    expect(setup({ name: '   ' }).success).toBe(false);
  });

  it('rejects an address that is not one', () => {
    expect(setup({ email: 'tom@' }).success).toBe(false);
  });

  it('coerces the timestamp a form submits as a string', () => {
    expect(
      setup({ renderedAt: String(valid.renderedAt) }).data?.renderedAt,
    ).toBe(valid.renderedAt);
  });

  it('accepts a filled honeypot, leaving it for looksAutomated to answer', () => {
    expect(setup({ [honeypotField]: 'https://spam.example' }).success).toBe(
      true,
    );
  });

  it('rejects a post that never rendered the form', () => {
    expect(setup({ [honeypotField]: undefined }).success).toBe(false);
  });
});

describe('looksAutomated', () => {
  const contact = (overrides: Record<string, unknown> = {}) =>
    contactSchema.parse({ ...valid, ...overrides });

  it('passes a form a person spent time on', () => {
    expect(looksAutomated(contact(), now)).toBe(false);
  });

  it('catches a filled honeypot however plausible the timing', () => {
    expect(
      looksAutomated(contact({ [honeypotField]: 'https://spam.example' }), now),
    ).toBe(true);
  });

  it('catches a form submitted faster than it could be read', () => {
    expect(
      looksAutomated(contact({ renderedAt: now - minElapsedMs + 1 }), now),
    ).toBe(true);
  });

  it('catches a replayed capture from an old session', () => {
    expect(
      looksAutomated(contact({ renderedAt: now - maxElapsedMs - 1 }), now),
    ).toBe(true);
  });

  it('allows a form left open for a while before sending', () => {
    expect(
      looksAutomated(contact({ renderedAt: now - maxElapsedMs + 1 }), now),
    ).toBe(false);
  });
});
