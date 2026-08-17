import { extractLinks } from './extract';

const setup = (html: string) => extractLinks(html);

describe('extractLinks', () => {
  it('finds an outbound link', () => {
    expect(setup('<a href="https://linkedin.com/in/someone">x</a>')).toEqual([
      'https://linkedin.com/in/someone',
    ]);
  });

  it('finds several', () => {
    expect(
      setup('<a href="https://a.com">a</a><a href="http://b.com">b</a>'),
    ).toEqual(['https://a.com', 'http://b.com']);
  });

  /* A CMS field with a trailing space produces a URL that is valid to a CMS
     and broken to a browser, and there is one of those in this content. */
  it('trims a href that carries whitespace', () => {
    expect(setup('<a href="https://linkedin.com/in/someone ">x</a>')).toEqual([
      'https://linkedin.com/in/someone',
    ]);
  });

  /* Checking the same profile twice tells nobody anything new. */
  it('reports a repeated link once', () => {
    expect(
      setup('<a href="https://a.com">1</a><a href="https://a.com">2</a>'),
    ).toEqual(['https://a.com']);
  });

  it.each([
    ['a relative path', '<a href="/cv">cv</a>'],
    ['an anchor', '<a href="#skills">skills</a>'],
    ['a mail link', '<a href="mailto:hello@engaging.engineering">mail</a>'],
    ['a telephone link', '<a href="tel:+447518716298">call</a>'],
  ])('ignores %s, which has no host to ask', (_label, html) => {
    expect(setup(html)).toEqual([]);
  });

  it('finds nothing in a page with no links', () => {
    expect(setup('<p>nothing here</p>')).toEqual([]);
  });
});
