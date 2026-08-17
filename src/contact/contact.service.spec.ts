import { Test } from '@nestjs/testing';

import { honeypotField, minElapsedMs, type TContact } from './contact.schema';
import { ContactService } from './contact.service';
import { Mailer } from './mailer';
import { RateLimitStore } from './rate-limit.store';

const address = '81.2.69.142';

const contact = (overrides: Partial<TContact> = {}): TContact => ({
  name: 'Tom Tollafield',
  email: 'tom@example.com',
  message: 'I would like to talk to you about a role.',
  [honeypotField]: '',
  renderedAt: Date.now() - minElapsedMs * 2,
  ...overrides,
});

const setup = async ({ allowed = true } = {}) => {
  const send = vi.fn<() => Promise<void>>().mockResolvedValue();
  const allows = vi.fn<() => Promise<boolean>>().mockResolvedValue(allowed);

  const module = await Test.createTestingModule({
    providers: [
      ContactService,
      { provide: Mailer, useValue: { send } },
      { provide: RateLimitStore, useValue: { allows } },
    ],
  }).compile();

  return { service: module.get(ContactService), send, allows };
};

describe('ContactService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends a genuine submission', async () => {
    const { service, send } = await setup();
    const submission = contact();

    await expect(service.submit(submission, address)).resolves.toBe('sent');

    expect(send).toHaveBeenNthCalledWith(1, submission);
  });

  it('discards an automated submission', async () => {
    const { service } = await setup();

    await expect(
      service.submit(contact({ [honeypotField]: 'spam' }), address),
    ).resolves.toBe('discarded');
  });

  it('sends nothing when a submission is discarded', async () => {
    const { service, send } = await setup();

    await service.submit(contact({ [honeypotField]: 'spam' }), address);

    expect(send).not.toHaveBeenCalled();
  });

  it('does not spend a rate-limit allowance on an obvious bot', async () => {
    const { service, allows } = await setup();

    await service.submit(contact({ [honeypotField]: 'spam' }), address);

    expect(allows).not.toHaveBeenCalled();
  });

  it('reports a rate-limited submission', async () => {
    const { service } = await setup({ allowed: false });

    await expect(service.submit(contact(), address)).resolves.toBe('limited');
  });

  it('sends nothing once rate limited', async () => {
    const { service, send } = await setup({ allowed: false });

    await service.submit(contact(), address);

    expect(send).not.toHaveBeenCalled();
  });

  it('limits on the address and the submitted identity', async () => {
    const { service, allows } = await setup();
    const submission = contact();

    await service.submit(submission, address);

    expect(allows).toHaveBeenNthCalledWith(1, address, submission.email);
  });

  it('lets a provider failure surface rather than reporting success', async () => {
    const { service, send } = await setup();

    send.mockRejectedValue(new Error('Resend responded 422'));

    await expect(service.submit(contact(), address)).rejects.toThrow('422');
  });
});
