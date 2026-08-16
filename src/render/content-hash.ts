import { createHash } from 'node:crypto';

/* The body is hashed, not <main>.

   Streaming SSR does not put the finished page inside <main>. Each Suspense
   boundary first emits a fallback, and the content that replaces it arrives
   later as a sibling `<div hidden id="S:n">` followed by a script that moves
   it into place in the browser. So a page contains several <main> elements —
   the first being a loading skeleton whose markup never changes — while much
   of the real content sits outside all of them.

   Hashing the first <main> therefore produced a constant value, the check
   reported "unchanged" forever, and every artifact silently froze after the
   first successful render.

   Scripts are stripped because the RSC payload and chunk filenames change on
   every deploy. Head is excluded for the same reason — its preload hrefs
   carry build hashes. What remains is rendered markup, hidden blocks
   included. */
const bodyPattern = /<body[^>]*>([\s\S]*)<\/body>/;
const scriptPattern = /<script[\s\S]*?<\/script>/g;
const whitespacePattern = /\s+/g;

const missingBodyMessage = 'Could not find a <body> element to hash';
const statusMessage = 'The site responded with status';

const extractContent = (html: string): string => {
  const match = html.match(bodyPattern);

  if (!match) throw new Error(missingBodyMessage);

  return match[1]
    .replace(scriptPattern, '')
    .replace(whitespacePattern, ' ')
    .trim();
};

const hashContent = (html: string): string =>
  createHash('sha256').update(extractContent(html)).digest('hex');

const fetchContentHash = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: { 'cache-control': 'no-cache' },
  });

  if (!response.ok) throw new Error(`${statusMessage} ${response.status}`);

  return hashContent(await response.text());
};

/* An artifact derived from several pages changes when any of them does, so
   their hashes are combined into one value to compare against. */
const fetchCombinedHash = async (urls: string[]): Promise<string> => {
  const hashes = await Promise.all(urls.map((url) => fetchContentHash(url)));

  return createHash('sha256').update(hashes.join(':')).digest('hex');
};

export {
  fetchContentHash,
  fetchCombinedHash,
  hashContent,
  extractContent,
  missingBodyMessage,
  statusMessage,
};
