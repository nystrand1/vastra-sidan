import { it, type TestContext, type TestFunction } from "vitest";

const isAssertionError = (error: unknown) =>
  error instanceof Error && error.name === "AssertionError";

/**
 * A test describing the *intended* behaviour for a bug we know about. It's
 * expected to fail until the bug is fixed (then vitest reports it, and the
 * test should become a plain `it`).
 *
 * Only a failed assertion counts as the expected failure. Any other error
 * (a broken factory, a crash before the `expect`) is logged and makes the
 * test go red, so a broken test can't hide behind the known bug.
 *
 * Run `KNOWN_BUGS=show yarn test` to run them as normal tests and see why they fail.
 */
export const itKnownBug = (name: string, fn: TestFunction) => {
  if (process.env.KNOWN_BUGS === "show") {
    return it(`[known bug] ${name}`, fn);
  }
  return it.fails(`[known bug] ${name}`, async (context: TestContext) => {
    try {
      await fn(context);
    } catch (error) {
      if (isAssertionError(error)) throw error;
      // Returning normally makes `it.fails` report the test as failing.
      console.error(`[known bug] "${name}" crashed before reaching its assertion:`, error);
    }
  });
};
