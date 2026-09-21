import {
  applied,
  changeBetween,
  jsonFrom,
  planFrom,
  summarise,
  type Outdated,
} from './plan';

/* Shaped like `pnpm outdated --format json`, which reports wanted alongside
   current — always equal here, because the versions are pinned exactly. */
const setup = (over: Record<string, Partial<Outdated>> = {}) => {
  const outdated: Record<string, Outdated> = {
    next: {
      current: '16.3.0',
      latest: '16.3.5',
      dependencyType: 'dependencies',
    },
    vitest: {
      current: '4.1.10',
      latest: '4.2.0',
      dependencyType: 'devDependencies',
    },
    typescript: {
      current: '7.0.2',
      latest: '8.0.0',
      dependencyType: 'devDependencies',
    },
  };

  for (const [name, fields] of Object.entries(over))
    outdated[name] = { ...outdated[name], ...fields } as Outdated;

  return { outdated };
};

describe('changeBetween', () => {
  it.each([
    ['16.3.0', '16.3.5', 'patch'],
    ['4.1.10', '4.2.0', 'minor'],
    ['7.0.2', '8.0.0', 'major'],
    ['0.63.0', '0.64.0', 'minor'],
  ])('reads %s → %s as %s', (from, to, expected) => {
    expect(changeBetween(from, to)).toBe(expected);
  });

  /* Versions in the wild carry prefixes even when the pin does not. */
  it('ignores a range prefix', () => {
    expect(changeBetween('^16.3.0', '16.3.5')).toBe('patch');
  });

  /* Not every registry entry is three numbers. A version missing its minor,
     or unreadable altogether, has to land somewhere defined rather than on
     NaN — and the safe landing is the bump that gets held back. */
  it.each([
    ['16', '17', 'major'],
    ['16', '16.1', 'minor'],
    ['', '1.0.0', 'major'],
  ])('copes with %s → %s', (from, to, expected) => {
    expect(changeBetween(from, to)).toBe(expected);
  });
});

describe('jsonFrom', () => {
  /* Observed on the first real run: pnpm put an unsupported-engine warning on
     stdout above the JSON, and the script died parsing its own output. */
  it('reads the JSON out of output a warning came first in', () => {
    /* Verbatim from the first run: the warning carries braces of its own, so
       taking the first brace in the output finds the wrong one. */
    const output =
      ' WARN  Unsupported engine: wanted: {"node":"^24.0.0"} (current: {"node":"v22.21.0"})\n{\n  "next": {"current":"16.3.0","latest":"16.3.5"}\n}';

    expect(jsonFrom(output).next?.latest).toBe('16.3.5');
  });

  it('reads plain JSON', () => {
    expect(jsonFrom('{"next":{"current":"1.0.0"}}').next?.current).toBe(
      '1.0.0',
    );
  });

  /* Nothing outdated is a quiet, ordinary month, not a parse error. */
  it('treats output with no object as nothing outdated', () => {
    expect(jsonFrom(' WARN  something\n')).toEqual({});
  });

  it('treats a stray closing brace as nothing outdated', () => {
    expect(jsonFrom('} nonsense')).toEqual({});
  });
});

describe('planFrom', () => {
  it('applies patch and minor bumps', () => {
    const { outdated } = setup();

    expect(summarise(planFrom(outdated).apply)).toEqual([
      'next 16.3.0 → 16.3.5 (patch)',
      'vitest 4.1.10 → 4.2.0 (minor)',
    ]);
  });

  /* A major is a promise the author has broken something, which is a
     changelog to read rather than a number to raise. */
  it('holds a major back for a person', () => {
    const { outdated } = setup();

    expect(summarise(planFrom(outdated).hold)).toEqual([
      'typescript 7.0.2 → 8.0.0 (major)',
    ]);
  });

  it('ignores a package already at its latest', () => {
    const { outdated } = setup({ next: { latest: '16.3.0' } });

    expect(planFrom(outdated).apply.map(({ name }) => name)).toEqual([
      'vitest',
    ]);
  });

  /* pnpm omits fields for a package it cannot resolve, and a bump to
     undefined would write "undefined" into the manifest. */
  it('skips an entry missing a version', () => {
    const { outdated } = setup({ next: { latest: undefined } });

    expect(planFrom(outdated).apply.map(({ name }) => name)).toEqual([
      'vitest',
    ]);
  });

  it('defaults a missing dependency type to dependencies', () => {
    const { outdated } = setup({ next: { dependencyType: undefined } });

    expect(planFrom(outdated).apply[0]?.dependencyType).toBe('dependencies');
  });

  /* Same order every month, so a diff between two reports is about versions
     rather than whatever order pnpm happened to answer in. */
  it('sorts by name', () => {
    const { outdated } = setup();

    expect(planFrom(outdated).apply.map(({ name }) => name)).toEqual([
      'next',
      'vitest',
    ]);
  });
});

describe('applied', () => {
  const manifest = () => ({
    name: 'engaging',
    dependencies: { next: '16.3.0', react: '19.2.8' },
    devDependencies: { vitest: '4.1.10' },
  });

  it('writes the exact version, with no range prefix', () => {
    const { outdated } = setup();

    const next = applied(manifest(), planFrom(outdated).apply);

    expect(next.dependencies).toEqual({ next: '16.3.5', react: '19.2.8' });
    expect(next.devDependencies).toEqual({ vitest: '4.2.0' });
  });

  /* Versions are pinned exactly on purpose, and a caret that slipped in with a
     forgotten flag is an accident. Writing the bump exact repairs it rather
     than preserving it. */
  it('makes a stray range exact at its next bump', () => {
    const next = applied({ devDependencies: { vitest: '^4.1.10' } }, [
      {
        name: 'vitest',
        from: '4.1.10',
        to: '4.2.0',
        change: 'minor',
        dependencyType: 'devDependencies',
      },
    ]);

    expect(next.devDependencies).toEqual({ vitest: '4.2.0' });
  });

  it('leaves the original manifest alone', () => {
    const original = manifest();
    const { outdated } = setup();

    applied(original, planFrom(outdated).apply);

    expect(original.dependencies.next).toBe('16.3.0');
  });

  /* A package pnpm reports under one section while package.json keeps it in
     another must not be invented into the wrong one. */
  it('ignores a package that is not in the section it claims', () => {
    const next = applied(manifest(), [
      {
        name: 'sharp',
        from: '0.35.4',
        to: '0.35.5',
        change: 'patch',
        dependencyType: 'dependencies',
      },
    ]);

    expect(next.dependencies).toEqual({ next: '16.3.0', react: '19.2.8' });
  });

  it('ignores a section the manifest does not have', () => {
    const next = applied(manifest(), [
      {
        name: 'anything',
        from: '1.0.0',
        to: '1.0.1',
        change: 'patch',
        dependencyType: 'peerDependencies',
      },
    ]);

    expect(next).toEqual(manifest());
  });
});
