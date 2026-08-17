import { localhost, originsFor } from './cors';

const siteUrl = 'https://www.engaging.engineering';

const setup = (isProduction: boolean) => originsFor(siteUrl, isProduction);

describe('originsFor', () => {
  it('allows the site in production', () => {
    expect(setup(true)).toEqual([siteUrl]);
  });

  it('allows nothing but the site in production', () => {
    expect(setup(true)).toHaveLength(1);
  });

  it('allows the site outside production too', () => {
    expect(setup(false)).toContain(siteUrl);
  });

  it('allows a local dev server outside production', () => {
    expect(setup(false)).toContain(localhost);
  });
});

describe('localhost', () => {
  it.each([
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost',
  ])('matches %s', (origin) => {
    expect(localhost.test(origin)).toBe(true);
  });

  /* The last two matter most: an origin is whatever the requesting browser
     says it is, so a pattern that matched these would be trivially spoofable
     by a page on someone else's domain. */
  it.each([
    'https://localhost:3000',
    'http://localhost.example.com',
    'http://notlocalhost:3000',
    'http://evil.com/?x=http://localhost:3000',
  ])('does not match %s', (origin) => {
    expect(localhost.test(origin)).toBe(false);
  });
});
