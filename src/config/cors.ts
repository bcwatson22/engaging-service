/* Any localhost port, so a site dev server on 3000 can post to this one on
   3001 without the two having to agree a number in advance. */
const localhost = /^http:\/\/localhost(:\d+)?$/;

/* Only the site in production. Everything else here is called
   server-to-server — Hygraph's webhook, the manual render trigger — and none
   of those are subject to CORS at all, so widening this grants access to
   nothing that needs it.

   SITE_URL rather than a second variable: the origin the renderer navigates
   to and the origin allowed to post a contact form are the same site, and two
   variables that must agree is a way for them to disagree.

   Localhost is allowed outside production only, and the deployed service must
   never accept it. "Allow localhost" sounds harmless because it is your own
   machine, but an origin is asserted by whichever browser is asking — so it
   would let any page anyone runs locally post through this service, under
   this domain's sending reputation. Developing the form against the deployed
   service is therefore deliberately impossible: run this service locally. */
const originsFor = (
  siteUrl: string,
  isProduction: boolean,
): (string | RegExp)[] => (isProduction ? [siteUrl] : [siteUrl, localhost]);

export { originsFor, localhost };
