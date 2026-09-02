import {
  streamedArtifacts,
  dedupeSeconds,
  deadLetterStream,
  payloadField,
  renderGroup,
  renderStream,
  streamMaxLength,
  streamVersion,
} from './stream.constants';

/* These are not internal constants — they are one half of an interface with
   engaging-worker, whose internal/queue package hardcodes the same values.
   Nothing at runtime checks that the two agree, so asserting them here at
   least makes a change deliberate rather than accidental. */
describe('the queue contract', () => {
  it('matches the names the worker consumes', () => {
    expect(renderStream).toBe('render');
    expect(renderGroup).toBe('workers');
    expect(deadLetterStream).toBe('render:dead');
    expect(payloadField).toBe('payload');
  });

  it('is at version 1', () => {
    expect(streamVersion).toBe(1);
  });

  /* A stream grows forever unless told not to. BullMQ had removeOnComplete;
     this is its replacement. */
  it('caps the stream', () => {
    expect(streamMaxLength).toBeGreaterThan(0);
  });

  /* Widened when the worker learns an artifact, and not before: streaming one
     it cannot handle costs a dead letter and a woken machine per publish. */
  it('streams only what the worker implements', () => {
    expect(streamedArtifacts).toEqual(['cv-pdf']);
  });

  /* Long enough to collapse a webhook retry, short enough not to swallow a
     genuine re-publish. */
  it('collapses duplicates over a window of a minute or less', () => {
    expect(dedupeSeconds).toBeGreaterThan(0);
    expect(dedupeSeconds).toBeLessThanOrEqual(60);
  });
});
