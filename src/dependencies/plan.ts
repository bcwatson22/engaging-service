/* Works out which dependency bumps a monthly routine should apply, and which
   it should only mention.

   Versions here are pinned exactly, which is deliberate — a build resolves to
   the same tree a year later — and it means `pnpm update` has nothing to do:
   the wanted version is always the installed one. So the choice of what to
   raise has to be made here rather than by a range in package.json. */

type Outdated = {
  current?: string;
  latest?: string;
  dependencyType?: string;
};

/* What separates a bump that can be merged on a green CI from one that needs
   a person: a major is a promise the author has broken something. */
type Change = 'major' | 'minor' | 'patch';

type Bump = {
  name: string;
  from: string;
  to: string;
  change: Change;
  dependencyType: string;
};

type Plan = {
  /* Raised by the routine, because semver says they should be safe and the
     verify run is what actually decides. */
  apply: Bump[];
  /* Named in the PR and left alone. A major wants a human reading a
     changelog, not an agent reading a version number. */
  hold: Bump[];
};

/* pnpm writes its warnings to stdout, ahead of the JSON it was asked for —
   an unsupported-engine notice is enough to make JSON.parse throw on output
   that is otherwise exactly right.

   The warning carries braces of its own (`wanted: {"node":"^24.0.0"}`), so the
   first brace in the output is the wrong one. pnpm prints its JSON starting at
   a line of its own, which is the distinction worth matching on. */
const jsonFrom = (output: string): Record<string, Outdated> => {
  const start = output.search(/^\{/m);
  const end = output.lastIndexOf('}');

  if (start === -1 || end < start) return {};

  return JSON.parse(output.slice(start, end + 1)) as Record<string, Outdated>;
};

/* Absent and unreadable both read as zero. A version missing its minor is
   ordinary ("16" against "16.1"), and one that parses to nothing is a registry
   answer this has no business interpreting — treating both as zero means an
   odd version reads as a major bump and gets held back for a person. */
const numberFrom = (value?: string): number => {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isNaN(parsed) ? 0 : parsed;
};

const partsOf = (version: string): { major: number; minor: number } => {
  const [major, minor] = version.replace(/^[^0-9]*/, '').split('.');

  return { major: numberFrom(major), minor: numberFrom(minor) };
};

/* Prerelease and build metadata are ignored on purpose: nothing here depends
   on a prerelease, and a routine that started reasoning about them would be
   guessing at intent no version string carries. */
const changeBetween = (from: string, to: string): Change => {
  const before = partsOf(from);
  const after = partsOf(to);

  if (after.major !== before.major) return 'major';
  if (after.minor !== before.minor) return 'minor';

  return 'patch';
};

/* Sorted by name so a month's PR reads the same way as the last one, and a
   diff of two reports is about versions rather than ordering. */
const planFrom = (outdated: Record<string, Outdated>): Plan => {
  const bumps: Bump[] = Object.entries(outdated)
    .filter(
      ([, { current, latest }]) => current && latest && current !== latest,
    )
    .map(([name, { current, latest, dependencyType }]) => ({
      name,
      from: current!,
      to: latest!,
      change: changeBetween(current!, latest!),
      dependencyType: dependencyType ?? 'dependencies',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    apply: bumps.filter(({ change }) => change !== 'major'),
    hold: bumps.filter(({ change }) => change === 'major'),
  };
};

/* Rewrites the manifest rather than running `pnpm add` per package: one
   install settles the lockfile, and the version is written exactly, with no
   range prefix. A caret that slipped in by hand becomes exact at its next
   bump, so the policy repairs itself rather than preserving the accident. */
const applied = (
  manifest: Record<string, unknown>,
  bumps: Bump[],
): Record<string, unknown> => {
  const next = structuredClone(manifest);

  for (const { name, to, dependencyType } of bumps) {
    const section = next[dependencyType];

    if (section && typeof section === 'object' && name in section)
      (section as Record<string, string>)[name] = to;
  }

  return next;
};

/* One line per bump, for a PR body a person skims rather than parses. */
const summarise = (bumps: Bump[]): string[] =>
  bumps.map(
    ({ name, from, to, change }) => `${name} ${from} → ${to} (${change})`,
  );

export { planFrom, changeBetween, applied, jsonFrom, summarise };
export type { Plan, Bump, Change, Outdated };
