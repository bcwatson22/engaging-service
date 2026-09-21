import { execFileSync } from 'child_process';
import { readFile, writeFile } from 'fs/promises';

import {
  applied,
  jsonFrom,
  planFrom,
  summarise,
  type Outdated,
} from '../src/dependencies/plan.ts';

/* Entry point for the monthly routine in .github/workflows/dependencies.yml.
   Outside src on purpose: nest build compiles all of src with SWC, which would
   emit this file's .ts-extension import into dist, broken.
   Everything decidable lives in src/dependencies, where it is tested; this runs pnpm,
   writes the manifest and leaves a summary for the workflow's Claude step to
   verify, prune and describe.

   It deliberately does not run verify itself. Deciding what to do when a bump
   breaks the build is the part worth a model: this only gets the tree into the
   state that decision is made about. */

const indent = 2;
const out = process.env.DEPENDENCIES_OUT ?? 'dependencies.json';

/* pnpm exits non-zero when anything is outdated, which is the normal case
   here rather than a failure. */
const outdated = (): Record<string, Outdated> => {
  try {
    const json = execFileSync('pnpm', ['outdated', '--format', 'json'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });

    return jsonFrom(json);
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout;

    if (!stdout) throw error;

    return jsonFrom(stdout);
  }
};

const plan = planFrom(outdated());

const manifest = JSON.parse(await readFile('package.json', 'utf8')) as Record<
  string,
  unknown
>;

if (plan.apply.length) {
  await writeFile(
    'package.json',
    `${JSON.stringify(applied(manifest, plan.apply), null, indent)}\n`,
  );

  /* One install for the lot: the lockfile settles once, and a failure here is
     a resolution problem rather than anything a verify run would explain. */
  execFileSync('pnpm', ['install', '--no-frozen-lockfile'], {
    stdio: 'inherit',
  });
}

await writeFile(out, `${JSON.stringify(plan, null, indent)}\n`);

console.log(`Applied ${plan.apply.length}, held back ${plan.hold.length}`);
for (const line of summarise(plan.apply)) console.log(`  + ${line}`);
for (const line of summarise(plan.hold)) console.log(`  · ${line}`);
