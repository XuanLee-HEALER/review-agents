"""Execute the real translator with in-process stand-ins for its four dependencies."""

import ast
import asyncio
import subprocess
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

MODULE = "roster/health/tools/wellness_ingest.py"
ENVELOPE = {
    "sender": {"identity": "owner@example.test"},
    "event": {"external_event_id": "google_health:resting_hr:2026-04-24"},
    "payload": {"raw": {"value": 62, "date": "2026-04-24"}},
}


async def probe(repo, sha, scenario, expected_statuses, expected_queries, envelope=ENVELOPE):
    source = subprocess.check_output(["git", "-C", repo, "show", f"{sha}:{MODULE}"], text=True)
    tree = ast.parse(source, filename=MODULE)
    tree.body = [
        node
        for node in tree.body
        if not (isinstance(node, ast.ImportFrom) and node.module.startswith("butlers."))
    ]
    account = SimpleNamespace(email="owner@example.test")
    first_result = [] if scenario == "empty" else RuntimeError("registry temporarily unavailable")
    lookup = AsyncMock(side_effect=[first_result, [account]])
    pool = SimpleNamespace(
        fetchrow=AsyncMock(side_effect=[RuntimeError("database temporarily unavailable"), {"email": account.email}])
    )
    store = AsyncMock(return_value={"id": "fixture-fact"})
    namespace = {
        "__name__": "wellness_fixture",
        "health_wellness_ingest_total": Mock(),
        "list_health_scoped_accounts": lookup,
        "resolve_owner_entity_info": AsyncMock(return_value="fixture-owner"),
        "memory_store_fact": store,
    }
    exec(compile(tree, MODULE, "exec"), namespace)
    translate = namespace["translate_wellness_envelope"]
    outcomes = [(await translate(pool, None, envelope))["status"] for _ in range(2)]
    query_count = lookup.await_count + pool.fetchrow.await_count
    assert outcomes == expected_statuses, (sha, scenario, outcomes)
    assert query_count == expected_queries, (sha, scenario, query_count)
    assert store.await_count == outcomes.count("ok"), (sha, scenario, store.await_count)
    print(f"{sha} {scenario}: {' -> '.join(outcomes)}; directory queries={query_count}; writes={store.await_count}")


async def verify(repo, base, head, repaired):
    old_rejected = "rejected_non_primary_sender"
    new_rejected = "rejected_non_owner_sender"
    await probe(repo, base, "outage", [old_rejected, "ok"], 2)
    await probe(repo, head, "outage", [new_rejected, new_rejected], 1)
    await probe(repo, repaired, "outage", [new_rejected, "ok"], 2)
    await probe(repo, repaired, "empty", [new_rejected, new_rejected], 1)
    # The pinned connector prefixes the resource with the sender email.
    current_envelope = {
        **ENVELOPE,
        "event": {"external_event_id": "google_health:owner@example.test:sleep_session:fixture"},
    }
    for sha, rejected, queries in ((base, old_rejected, 2), (head, new_rejected, 1), (repaired, new_rejected, 2)):
        second = "skipped_unknown_predicate" if queries == 2 else rejected
        await probe(repo, sha, "connector format outage", [rejected, second], queries, current_envelope)


if __name__ == "__main__":
    import sys

    asyncio.run(verify(*sys.argv[1:]))
