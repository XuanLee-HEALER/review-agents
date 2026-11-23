## Language-specific pitfalls to check (Python)

Static checks (`ruff`, `pyright`, `mypy`) do not catch all dynamic runtime hazards. For changed Python code, specifically inspect:
- **Mutable defaults & late-binding closures**: default arguments like `def f(items=[])`, shared class-level mutable attributes across instances, or loop variables captured by lambdas/closures.
- **Async & concurrency pitfalls**: synchronous blocking I/O (HTTP, DB, disk, `time.sleep`) inside `async def`, unawaited coroutines, or sharing a single DB/ORM session concurrently across tasks.
- **Exception & transaction hygiene**: broad `except Exception:` masking real failures or skipping transaction rollback; missing context managers (`with` / `async with`) leaking sockets, files, or DB connections.
- **Dynamic attribute & shallow-copy bugs**: typoed attribute assignments silently creating fields, or shallow `.copy()` sharing nested dicts/lists across requests or caches.
- **Type & numeric boundaries**: float arithmetic for billing/credits instead of `Decimal`/integer minor units; mixing timezone-naive and timezone-aware `datetime` objects; truthiness checks confusing `0`/`""`/`[]` with `None`.
- **Pydantic / serialization drift**: schema field defaults, aliases, `exclude_none`, or validator coercion diverging from wire contract or DB persistence.
