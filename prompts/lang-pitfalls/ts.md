## Language-specific pitfalls to check (TypeScript / JavaScript)

`tsc --noEmit` only validates compile-time types and is erased at runtime. For changed TS/JS code, specifically inspect:
- **Type-erasure runtime boundaries**: `as T` assertions, `JSON.parse()`, `req.json()`, or external API payloads consumed without runtime validation, allowing malformed fields or `undefined` to propagate.
- **Async & Promise hazards**: unawaited/floating Promises, missing error handling in fire-and-forget callbacks, unhandled rejections, and out-of-order async completions overwriting newer state.
- **Falsy & coercion traps**: using `||` instead of `??` when `0`, `""`, or `false` are valid values; `NaN` propagation; `typeof null === "object"` or implicit string/number coercion.
- **Shared mutable state**: mutating input arrays/objects in place (`.sort()`, `.splice()`, shared default objects) or unsafe dynamic object key indexing (`__proto__` / `constructor`).
- **Resource & lifecycle cleanup**: timers, event listeners, streams, AbortControllers, or DB handles not released in `finally` / error paths.
- **Numeric precision**: IEEE-754 float math on currency/credits/billing, or parsing 64-bit integer IDs into JS `Number` above `Number.MAX_SAFE_INTEGER`.
