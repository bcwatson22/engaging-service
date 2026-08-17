/* A link is checked with HEAD: the body is never wanted, and downloading a
   megabyte of somebody's homepage weekly to learn a status code would be
   rude. */
const method = 'HEAD';

const timeout = 8000;

/* A real one. A default fetch user-agent gets refused by more hosts than it
   gets served by, which would report half the CV's links as broken. */
const userAgent =
  'Mozilla/5.0 (compatible; engaging.engineering link check; +https://www.engaging.engineering)';

/* `broken` is a link to fix. `blocked` is a host refusing a bot, which says
   nothing about whether the link works for a person — LinkedIn answers 999 to
   anything that looks automated, and treating that as broken would train
   anyone reading this to ignore the whole report. */
type TState = 'ok' | 'blocked' | 'broken';

type TResult = {
  url: string;
  status: number;
  state: TState;
};

/* Statuses that mean "not for robots" rather than "not there".
   999 is LinkedIn's own. 403 and 429 are the polite versions. 405 means the
   host does not take HEAD at all, which is about the request, not the URL. */
const blockedStatuses = new Set([401, 403, 405, 429, 999]);

/* No status at all: DNS failure, a refused connection, or the timeout above.
   Reported as 0 so the shape stays a number and the page has something to
   show. */
const noResponse = 0;

const stateFor = (status: number): TState => {
  if (status >= 200 && status < 400) return 'ok';

  return blockedStatuses.has(status) ? 'blocked' : 'broken';
};

const checkLink = async (url: string): Promise<TResult> => {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'user-agent': userAgent },
      /* One hop is followed by default; a chain longer than that is a
         redirect loop or a parked domain, and either is worth reporting. */
      signal: AbortSignal.timeout(timeout),
    });

    return { url, status: response.status, state: stateFor(response.status) };
  } catch {
    return { url, status: noResponse, state: 'broken' };
  }
};

export {
  checkLink,
  stateFor,
  method,
  timeout,
  userAgent,
  blockedStatuses,
  noResponse,
};
export type { TResult, TState };
