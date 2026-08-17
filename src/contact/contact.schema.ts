import { z } from 'zod';

/* Long enough not to truncate a real enquiry, short enough that the body of a
   spam run does not become the payload. */
const maxName = 100;
const maxMessage = 5000;
const minMessage = 10;

/* A form filled in faster than this was not read. Bots post the instant they
   parse the page; a person needs seconds to type a sentence. */
const minElapsedMs = 3000;

/* And one older than this is a replayed capture rather than a live session. */
const maxElapsedMs = 24 * 60 * 60 * 1000;

/* Named for what an autofill heuristic expects to see, not for what it does.
   Hidden in the form and never filled by a human, so anything in it is a bot
   that filled every field it found. */
const honeypotField = 'website';

const contactSchema = z.object({
  name: z.string().trim().min(1).max(maxName),
  email: z.email(),
  message: z.string().trim().min(minMessage).max(maxMessage),

  /* Any string, including a filled one. Rejecting a non-empty value here
     would answer 400 and tell the bot exactly which field caught it; instead
     it is carried through and handled by looksAutomated, which answers the
     same 202 a real submission gets. */
  [honeypotField]: z.string(),

  /* When the form was rendered, in epoch ms. Client-supplied and therefore
     forgeable — this is one signal among several, not a gate that holds on
     its own. */
  renderedAt: z.coerce.number().int().positive(),
});

type TContact = z.infer<typeof contactSchema>;

/* Split from the schema rather than folded in as a refinement, so a failure
   here can be answered differently from a validation failure: a human seeing
   an error, versus a bot seeing the same 202 as a success.

   Both signals live together because both mean the same thing and get the
   same response — a filled honeypot is conclusive, a suspicious elapsed time
   is not, and neither is worth reporting separately to whoever sent it. */
const looksAutomated = (contact: TContact, now: number): boolean => {
  if (contact[honeypotField] !== '') return true;

  const elapsed = now - contact.renderedAt;

  return elapsed < minElapsedMs || elapsed > maxElapsedMs;
};

export {
  contactSchema,
  looksAutomated,
  honeypotField,
  minElapsedMs,
  maxElapsedMs,
  maxName,
  maxMessage,
  minMessage,
};
export type { TContact };
