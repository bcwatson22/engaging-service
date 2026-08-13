import { createHash } from "node:crypto";

/* Only the rendered content is hashed. The full document carries a build id
   and RSC payload that change on every deploy, which would report a content
   change where there is none. */
const mainPattern = /<main[^>]*>([\s\S]*?)<\/main>/;
const scriptPattern = /<script[\s\S]*?<\/script>/g;
const whitespacePattern = /\s+/g;

const missingMainMessage = "Could not find a <main> element to hash";
const statusMessage = "The site responded with status";

const extractContent = (html: string): string => {
  const match = html.match(mainPattern);

  if (!match) throw new Error(missingMainMessage);

  return match[1]
    .replace(scriptPattern, "")
    .replace(whitespacePattern, " ")
    .trim();
};

const hashContent = (html: string): string =>
  createHash("sha256").update(extractContent(html)).digest("hex");

const fetchContentHash = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache" },
  });

  if (!response.ok) throw new Error(`${statusMessage} ${response.status}`);

  return hashContent(await response.text());
};

/* An artifact derived from several pages changes when any of them does, so
   their hashes are combined into one value to compare against. */
const fetchCombinedHash = async (urls: string[]): Promise<string> => {
  const hashes = await Promise.all(urls.map((url) => fetchContentHash(url)));

  return createHash("sha256").update(hashes.join(":")).digest("hex");
};

export {
  fetchContentHash,
  fetchCombinedHash,
  hashContent,
  extractContent,
  missingMainMessage,
  statusMessage,
};
