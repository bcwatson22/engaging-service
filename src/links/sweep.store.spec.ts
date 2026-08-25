import { Test } from '@nestjs/testing';

import { redisClient } from '../redis/redis.module';
import type { TResult } from './check';
import { isSweep, key, SweepStore, type TSweep } from './sweep.store';

const problem: TResult = {
  url: 'https://github.com/someone',
  status: 404,
  state: 'broken',
};

const sweep: TSweep = {
  at: '2026-08-17T12:00:00.000Z',
  checked: 12,
  problems: [problem],
};

const setup = async ({ stored = null as string | null } = {}) => {
  const get = vi.fn<() => Promise<string | null>>().mockResolvedValue(stored);
  const set = vi
    .fn<(key: string, value: string) => Promise<'OK'>>()
    .mockResolvedValue('OK');

  const module = await Test.createTestingModule({
    providers: [{ provide: redisClient, useValue: { get, set } }, SweepStore],
  }).compile();

  return { store: module.get(SweepStore), get, set };
};

describe('SweepStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns nothing before a sweep has run', async () => {
    const { store } = await setup();

    await expect(store.get()).resolves.toBeNull();
  });

  it('returns what the last sweep found', async () => {
    const { store } = await setup({ stored: JSON.stringify(sweep) });

    await expect(store.get()).resolves.toEqual(sweep);
  });

  it.each([
    ['unparseable', 'not json'],
    ['the wrong shape', JSON.stringify({ at: 'now' })],
    [
      'a problem of the wrong shape',
      JSON.stringify({ at: 'now', checked: 1, problems: [{ url: 1 }] }),
    ],
  ])('treats %s stored data as never swept', async (_label, stored) => {
    const { store } = await setup({ stored });

    await expect(store.get()).resolves.toBeNull();
  });

  it('keeps the count and the problems under one key', async () => {
    const { store, set } = await setup();

    await store.set(12, [problem]);

    expect(set.mock.calls[0][0]).toBe(key);
    expect(JSON.parse(set.mock.calls[0][1]) as TSweep).toMatchObject({
      checked: 12,
      problems: [problem],
    });
  });

  it('stamps the time itself', async () => {
    const { store, set } = await setup();

    await store.set(0, []);

    const { at } = JSON.parse(set.mock.calls[0][1]) as TSweep;

    expect(Number.isNaN(Date.parse(at))).toBe(false);
  });
});

describe('isSweep', () => {
  it('accepts a full sweep', () => {
    expect(isSweep(sweep)).toBe(true);
  });

  it('accepts a sweep that found nothing wrong', () => {
    expect(isSweep({ ...sweep, problems: [] })).toBe(true);
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['no time', { ...sweep, at: undefined }],
    ['a count that is not a number', { ...sweep, checked: 'lots' }],
    ['problems that are not a list', { ...sweep, problems: {} }],
    ['a problem that is not an object', { ...sweep, problems: ['nope'] }],
    ['a problem that is null', { ...sweep, problems: [null] }],
    [
      'a state it does not recognise',
      {
        ...sweep,
        problems: [{ ...problem, state: 'maybe' }],
      },
    ],
  ])('rejects %s', (_label, value) => {
    expect(isSweep(value)).toBe(false);
  });
});
