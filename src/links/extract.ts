/* The plan had this reading `contactLinks`, `onlineLinks` and the references
   out of the CV query. This service has no Hygraph credentials — only the
   webhook secret — and giving it some to read three fields would be a new
   coupling to the CMS schema for no gain.

   The rendered page is the better source anyway: it is what a visitor
   actually clicks, it needs no credentials, and it picks up any outbound link
   on the page rather than the three fields someone remembered to list. The
   service already fetches this page to hash it. */

const hrefPattern = /href\s*=\s*"([^"]*)"/g;

const external = /^https?:\/\//i;

/* Trimmed before anything looks at it. A CMS field with a trailing space
   produces a URL that is valid to a CMS and broken to a browser, and there is
   at least one of those in this content today. */
const extractLinks = (html: string): string[] => {
  const found = [...html.matchAll(hrefPattern)]
    .map(([, href]) => href.trim())
    .filter((href) => external.test(href));

  /* Deduplicated: the same profile is often linked from a contact block and a
     reference, and checking it twice tells nobody anything new. */
  return [...new Set(found)];
};

export { extractLinks, hrefPattern, external };
