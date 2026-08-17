// Minimal zero-dependency test harness. The connector targets old Node (14) and
// ships no test framework, so tests are bundled with esbuild and run under node.
// Keep it tiny: test(), and a few asserts that throw on failure.

type Fn = () => void | Promise<void>;

interface Case {
  name: string;
  fn: Fn;
}

const cases: Case[] = [];

export function test(name: string, fn: Fn): void {
  cases.push({ name, fn });
}

export function assert(cond: unknown, msg = "assertion failed"): void {
  if (!cond) throw new Error(msg);
}

export function equal<T>(got: T, want: T, msg?: string): void {
  if (got !== want) {
    throw new Error(msg ?? `expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
}

export async function rejects(fn: Fn, match?: (e: Error) => boolean, msg = "expected rejection"): Promise<Error> {
  try {
    await fn();
  } catch (e) {
    if (match && !match(e as Error)) throw new Error(`${msg}: predicate failed for ${(e as Error).message}`);
    return e as Error;
  }
  throw new Error(msg);
}

export async function run(): Promise<void> {
  let passed = 0;
  const failures: string[] = [];
  for (const c of cases) {
    try {
      await c.fn();
      passed++;
      console.log(`  ok   ${c.name}`);
    } catch (e) {
      failures.push(`${c.name}: ${(e as Error).message}`);
      console.log(`  FAIL ${c.name}: ${(e as Error).message}`);
    }
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
}
