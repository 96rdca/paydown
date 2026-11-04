/**
 * Minimal ambient types for `bun:test`.
 *
 * The project intentionally has no `@types/bun` dependency (package.json is
 * owned by another lane), but `bunx tsc --noEmit` still needs to understand
 * the test files. Only the matchers the suite actually uses are declared.
 */
declare module "bun:test" {
  type TestFn = () => void | Promise<void>;

  export function test(name: string, fn: TestFn): void;
  export function it(name: string, fn: TestFn): void;
  export function describe(name: string, fn: () => void): void;
  export function beforeEach(fn: TestFn): void;
  export function afterEach(fn: TestFn): void;

  interface Matchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toBeDefined(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeCloseTo(expected: number, precision?: number): void;
    toHaveLength(expected: number): void;
    toContain(expected: unknown): void;
    toThrow(expected?: string | RegExp): void;
    not: Matchers;
  }

  export function expect(actual: unknown): Matchers;
}
