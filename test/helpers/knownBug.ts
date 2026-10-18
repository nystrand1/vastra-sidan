import { it, type TestFunction } from "vitest";

/**
 * A test describing the *intended* behaviour for a bug we know about. It's
 * expected to fail until the bug is fixed (then vitest reports it, and the
 * test should become a plain `it`).
 *
 * Run `KNOWN_BUGS=show yarn test` to run them as normal tests and see why they fail.
 */
export const itKnownBug = (name: string, fn: TestFunction) =>
  (process.env.KNOWN_BUGS === "show" ? it : it.fails)(`[known bug] ${name}`, fn);
