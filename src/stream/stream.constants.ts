/* The queue contract, mirrored from engaging-worker.

   These names and this payload shape are the interface between two repos in
   two languages. Nothing else enforces them: change one side and the only
   symptom is renders quietly stopping. The worker's internal/queue package
   holds the other half, and the version field exists so a mismatch is refused
   rather than interpreted optimistically. */

/* Bumped only when the payload shape changes in a way the other side cannot
   read. The worker dead-letters anything it does not recognise. */
const streamVersion = 1;

const renderStream = 'render';
const renderGroup = 'workers';
const deadLetterStream = 'render:dead';

/* The single field each entry carries. Streams are field/value maps; putting
   the whole payload in one JSON field keeps the contract in one place rather
   than spread across keys both sides must agree to spell identically. */
const payloadField = 'payload';

/* Caps the stream. BullMQ had removeOnComplete; a stream grows forever unless
   told not to, and `~` lets Redis trim at a convenient boundary rather than
   exactly, which is cheaper and no less effective at this size. */
const streamMaxLength = 1000;

/* A publish fires one webhook per artifact and Hygraph will retry a webhook it
   thinks failed, so the same render can be asked for twice within seconds.
   Sixty seconds collapses that without hiding a genuine re-publish, which
   cannot happen that fast by hand. */
const dedupePrefix = 'stream-dedupe';
const dedupeSeconds = 60;

type TStreamJob = {
  v: number;
  job: string;
  contentHash: string;
  requestedAt: string;
  force: boolean;
};

export {
  streamVersion,
  renderStream,
  renderGroup,
  deadLetterStream,
  payloadField,
  streamMaxLength,
  dedupePrefix,
  dedupeSeconds,
};
export type { TStreamJob };
