/* eslint-disable @susisu/safe-typescript/no-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */

// #region Types

/**
 * @since 0.4.0
 */
export type Cast<X, Y> = X extends Y ? X : Y;

/**
 * @since 0.0.1
 * @template T The type to get the union from
 * @example
 * type Result = UnionFromTuple<['foo', 'bar', 1]>
 * Result = 'foo' | 'bar' | 1
 */
export type UnionFromTuple<T> = T extends (infer U)[] ? U : never;

/**
 * @since 0.0.1
 * @template T The type to get the intersection from
 * @example
 * type Result = IntersectionFromTuple<['foo', 'bar', 1]>
 * Result = 'foo' & 'bar' & 1
 */
export type UnionToIntersection<U> = (
  U extends unknown ? (k: U) => void : never
) extends (k: infer I) => void
  // dprint-ignore
  ? I
  : never;

/**
 * @since 0.0.1
 */
export type Remap<T> = {
  [P in keyof T]: T[P];
};

/**
 * @since 0.0.1
 */
export type Pretty<T> =
  & {
    [P in keyof T]: T[P];
  }
  & {};

/**
 * This should only be used for defining generics which extend any kind of JS
 * array under the hood, this includes arrays *AND* tuples (of the form [x, y],
 * and of the form [x, ...y[]], etc...), and their readonly equivalent. This
 * allows us to be more inclusive to what functions can process.
 * @example map<T extends ArrayLike>(items: T) { ... }
 *
 * We would've named this `ArrayLike`, but that's already used by typescript...
 * @see This was inspired by the type-definition of Promise.all (https://github.com/microsoft/TypeScript/blob/1df5717b120cddd325deab8b0f2b2c3eecaf2b01/src/lib/es2015.promise.d.ts#L21)
 */
export type IterableContainer<T = unknown> = readonly [] | ReadonlyArray<T>;

/**
 * Returns the element type of an array.
 * @since 0.4.0
 * @template T type of the array elements.
 * @param arr The array to get the element type from.
 * @returns The element type of the array.
 */
export type ArrayElement<A> = A extends readonly (infer T)[] ? T : never;

/**
 * A record with loose keys.
 * @template T The type of the values.
 * @since 0.4.0
 */
export type LooseRecord<T> = Record<PropertyKey, T>;

/**
 * Infers embedded primitive type of any type
 * @since 0.0.1
 * @param T Type to infer
 * @returns Embedded type of {@link TType}
 * @example
 * type Result = Narrow<['foo', 'bar', 1]>
 * @see https://twitter.com/hd_nvim/status/1578567206190780417
 */
export type Narrow<TType> =
  | (TType extends [] ? [] : never)
  | (TType extends bigint | boolean | number | string ? TType : never)
  | (TType extends Function ? TType : never)
  | { [K in keyof TType]: Narrow<TType[K]> };

// #endregion

// #region Type Helpers

/**
 * Infers embedded primitive type of any type
 * Same as `as const` but without setting the object as readonly and without needing the user to use it.
 * @since 0.0.1
 * @param a Value to infer
 * @returns Value with embedded type inferred
 * @example
 * const result = narrow(['foo', 'bar', 1])
 */
export const narrow = <TType>(a: Narrow<TType>) => a;

/**
 * @param a The value to infer.
 * @since 0.0.1
 * @returns The value with the type inferred.
 */
export const asConst = <const T>(a: T) => a;

/**
 * This is an enhanced version of the typeof operator to check the type of more complex values.
 * In this case we just mind about arrays and objects. We can add more on demand.
 * @param t the value to be checked
 * @returns the type of the value
 */
export function typeOf(t: unknown) {
  return Object.prototype.toString
    .call(t)
    .replace(/^\[object (.+)\]$/, "$1")
    .toLowerCase() as "array" | "object" | (string & {});
}

// #endregion

// #region Object Helpers

// Ported from: https://github.com/remeda/remeda/blob/9d742036f6c9cdc216e2c771805051855e7e7ac4/src/entries.ts
type EntriesEntryForKey<T, Key extends keyof T> = Key extends number | string ? [key: `${Key}`, value: Required<T>[Key]]
  : never;
type EntriesEntry<T> = Pretty<{ [P in keyof T]-?: EntriesEntryForKey<T, P> }[keyof T]>;
export function entries<T extends {}>(data: T): Array<EntriesEntry<T>>;
export function entries(): <T extends {}>(data: T) => Array<EntriesEntry<T>>;
export function entries(...args: ReadonlyArray<unknown>): unknown {
  return Object.entries(args);
}

// Ported from: https://github.com/remeda/remeda/blob/9d742036f6c9cdc216e2c771805051855e7e7ac4/src/fromEntries.ts
type FromEntriesEntry<Key extends PropertyKey = PropertyKey, Value = unknown> = readonly [
  key: Key,
  value: Value,
];
type FromEntries<Entries> = Entries extends readonly [
  infer First,
  ...infer Tail,
] ? FromEntriesTuple<First, Tail>
  : Entries extends readonly [...infer Head, infer Last] ? FromEntriesTuple<Last, Head>
  : Entries extends IterableContainer<FromEntriesEntry> ? FromEntriesArray<Entries>
  : "ERROR: Entries array-like could not be inferred";
type FromEntriesTuple<E, Rest> = E extends FromEntriesEntry ? FromEntries<Rest> & Record<E[0], E[1]>
  : "ERROR: Array-like contains a non-entry element";
type FromEntriesArray<Entries extends IterableContainer<FromEntriesEntry>> = string extends AllKeys<Entries>
  ? Record<string, Entries[number][1]>
  : number extends AllKeys<Entries> ? Record<number, Entries[number][1]>
  : symbol extends AllKeys<Entries> ? Record<symbol, Entries[number][1]>
  : FromEntriesArrayWithLiteralKeys<Entries>;
type FromEntriesArrayWithLiteralKeys<Entries extends IterableContainer<FromEntriesEntry>> = {
  [P in AllKeys<Entries>]?: ValueForKey<Entries, P>;
};
type AllKeys<Entries extends IterableContainer<FromEntriesEntry>> = Extract<
  Entries[number],
  FromEntriesEntry
>[0];
type ValueForKey<
  Entries extends IterableContainer<FromEntriesEntry>,
  K extends PropertyKey,
> = (Extract<Entries[number], FromEntriesEntry<K>> extends never ? Entries[number]
  : Extract<Entries[number], FromEntriesEntry<K>>)[1];
export function fromEntries<Entries extends IterableContainer<FromEntriesEntry>>(
  entries: Entries,
): Pretty<FromEntries<Entries>>;
export function fromEntries(): <Entries extends IterableContainer<FromEntriesEntry>>(
  entries: Entries,
) => Pretty<FromEntries<Entries>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromEntries(...args: ReadonlyArray<any>): unknown {
  return Object.fromEntries(args);
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */
type Reverse<T extends Record<any, any>> = { [U in keyof T as T[U]]: U };

function reverse<T extends Record<any, any>>(record: T): Reverse<T> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [value, key]),
  );
}

export function birecord<const T extends Record<any, any>>(
  original: T,
): BiRecord<T> {
  return new BiRecord(original);
}

export class BiRecord<const T extends Record<any, any>> {
  constructor(public original: T, public reversed = reverse(original)) {
  }
  get<U extends keyof T | T[keyof T]>(
    key: U,
  ): U extends keyof T ? T[U] : U extends T[keyof T] ? Reverse<T>[U] : unknown {
    return this.original[key] ?? this.reversed[key as T[keyof T]];
  }
  has(key: any): key is keyof T | T[keyof T] {
    return key in this.original || key in this.reversed;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return */

// #endregion

// #region Array Helpers

export function zip<T>(arr1: readonly T[]): Array<[T]>;
export function zip<T, U>(arr1: readonly T[], arr2: readonly U[]): Array<[T, U]>;
export function zip<T, U, V>(arr1: readonly T[], arr2: readonly U[], arr3: readonly V[]): Array<[T, U, V]>;
export function zip<T, U, V, W>(
  arr1: readonly T[],
  arr2: readonly U[],
  arr3: readonly V[],
  arr4: readonly W[],
): Array<[T, U, V, W]>;
export function zip<T>(...arrs: Array<readonly T[]>): T[][] {
  const result: T[][] = [];

  const maxIndex = Math.max(...arrs.map(x => x.length));

  for (let i = 0; i < maxIndex; i++) {
    const element: T[] = [];

    for (const arr of arrs) {
      element.push(arr[i] as T);
    }

    result.push(element);
  }

  return result;
}

// #endregion