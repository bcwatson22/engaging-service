import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  accepted,
  addressHeader,
  ContactController,
  unknownAddress,
} from './contact.controller';
import { honeypotField, minElapsedMs } from './contact.schema';
import { ContactService } from './contact.service';
import type { TOutcome } from './contact.service';

const address = '81.2.69.142';

const body = (overrides: Record<string, unknown> = {}) => ({
  name: 'Tom Tollafield',
  email: 'tom@example.com',
  message: 'I would like to talk to you about a role.',
  [honeypotField]: '',
  renderedAt: Date.now() - minElapsedMs * 2,
  ...overrides,
});

const requestFrom = (headers: Record<string, string | string[]> = {}) => ({
  headers,
});

const setup = async ({ outcome = 'sent' as TOutcome } = {}) => {
  const submit = vi.fn<() => Promise<TOutcome>>().mockResolvedValue(outcome);

  const module = await Test.createTestingModule({
    controllers: [ContactController],
    providers: [{ provide: ContactService, useValue: { submit } }],
  }).compile();

  return { controller: module.get(ContactController), submit };
};

describe('ContactController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a valid submission', async () => {
    const { controller } = await setup();

    await expect(
      controller.submit(body(), requestFrom({ [addressHeader]: address })),
    ).resolves.toEqual(accepted);
  });

  it('answers a discarded submission exactly as it answers a sent one', async () => {
    const { controller } = await setup({ outcome: 'discarded' });

    await expect(
      controller.submit(body(), requestFrom({ [addressHeader]: address })),
    ).resolves.toEqual(accepted);
  });

  it('passes the proxy-supplied client address through', async () => {
    const { controller, submit } = await setup();
    const submission = body();

    await controller.submit(
      submission,
      requestFrom({ [addressHeader]: address }),
    );

    expect(submit).toHaveBeenNthCalledWith(1, submission, address);
  });

  it('buckets a request with no client address rather than exempting it', async () => {
    const { controller, submit } = await setup();

    await controller.submit(body(), requestFrom());

    expect(submit).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      unknownAddress,
    );
  });

  it('buckets a repeated header, which cannot be a single client', async () => {
    const { controller, submit } = await setup();

    await controller.submit(
      body(),
      requestFrom({ [addressHeader]: [address, '10.0.0.1'] }),
    );

    expect(submit).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      unknownAddress,
    );
  });

  it('rejects an invalid submission', async () => {
    const { controller } = await setup();

    await expect(
      controller.submit({ name: 'Tom' }, requestFrom()),
    ).rejects.toThrow(BadRequestException);
  });

  it('names the offending fields without echoing what was submitted', async () => {
    const { controller } = await setup();

    await expect(
      controller.submit(body({ email: 'tom@' }), requestFrom()),
    ).rejects.toMatchObject({
      response: { fields: ['email'] },
    });
  });

  it('sends nothing when the submission does not validate', async () => {
    const { controller, submit } = await setup();

    await expect(controller.submit({}, requestFrom())).rejects.toThrow(
      BadRequestException,
    );

    expect(submit).not.toHaveBeenCalled();
  });

  it('answers a rate-limited submission with 429', async () => {
    const { controller } = await setup({ outcome: 'limited' });

    await expect(
      controller.submit(body(), requestFrom({ [addressHeader]: address })),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
  });

  it('tells a rate-limited visitor they may try again', async () => {
    const { controller } = await setup({ outcome: 'limited' });

    await expect(
      controller.submit(body(), requestFrom({ [addressHeader]: address })),
    ).rejects.toThrow(HttpException);
  });
});
