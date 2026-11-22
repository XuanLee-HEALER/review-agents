import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contextTool } from "../src/context-tools";

// Private Unix socket only: no network listener, existing cluster, or real data.
const root = mkdtempSync("/tmp/review-pg-");
const data = join(root, "data");
const socket = join(root, "socket");
mkdirSync(socket, { mode: 0o700 });
const previous = process.env.REVIEW_DATABASE_URL;
let started = false;
function command(argv: string[]) {
  const result = Bun.spawnSync(argv, {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30000,
  });
  if (result.exitCode !== 0)
    throw Error(`${argv[0]} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
}
function connection(user: string, database = "review_reader") {
  return `postgresql://${user}@/${database}?host=${encodeURIComponent(socket)}&port=5432`;
}
const checks: string[] = [];
function assert(condition: boolean, message: string) {
  if (!condition) throw Error(message);
  checks.push(message);
}
try {
  command([
    "initdb",
    "-D",
    data,
    "-U",
    "review_admin",
    "--auth=trust",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  command([
    "pg_ctl",
    "-D",
    data,
    "-l",
    join(root, "server.log"),
    "-o",
    `-k ${socket} -h '' -p 5432`,
    "-w",
    "start",
  ]);
  started = true;
  command([
    "psql",
    connection("review_admin", "postgres"),
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "CREATE DATABASE review_reader",
  ]);
  command([
    "psql",
    connection("review_admin"),
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `
    CREATE TABLE review_sample(id integer PRIMARY KEY);
    INSERT INTO review_sample VALUES (1), (2);
    CREATE ROLE review_reader LOGIN;
    GRANT SELECT ON review_sample TO review_reader;
    CREATE FUNCTION review_attempt_write() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN INSERT INTO review_sample VALUES (3); RETURN 3; END $$;
  `,
  ]);
  command([
    "psql",
    connection("review_reader"),
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "BEGIN; SELECT review_attempt_write(); ROLLBACK",
  ]);
  checks.push(
    "SECURITY DEFINER write succeeds in read-write control transaction and is rolled back",
  );
  process.env.REVIEW_DATABASE_URL = `postgresql://review_reader@${socket}`;
  const query = (sql: string) =>
    contextTool("query_database", { query: sql }, root);

  const result = await query("SELECT count(*) AS row_count FROM review_sample");
  assert(/\b2\b/.test(result.text ?? ""), "SELECT returns fixture rows");
  const mode = await query(
    "SELECT current_setting('transaction_read_only') AS mode",
  );
  assert(/\bon\b/.test(mode.text ?? ""), "Transaction is actually read-only");
  const plan = await query("EXPLAIN SELECT * FROM review_sample");
  assert(/Scan/.test(plan.text ?? ""), "EXPLAIN SELECT returns a real plan");
  let blocked = false;
  try {
    await query("SELECT 1; INSERT INTO review_sample VALUES (4)");
  } catch {
    blocked = true;
  }
  assert(blocked, "Multi-statement write rejected by wrapper");
  blocked = false;
  try {
    await query("SELECT review_attempt_write()");
  } catch (error) {
    blocked = String(error).includes("connection details withheld");
  }
  assert(blocked, "Server rejects write inside SECURITY DEFINER function");
  blocked = false;
  try {
    await query("SELECT pg_sleep(16)");
  } catch {
    blocked = true;
  }
  assert(
    blocked &&
      readFileSync(join(root, "server.log"), "utf8").includes(
        "statement timeout",
      ),
    "Server cancels slow query at statement timeout",
  );
  const count = command([
    "psql",
    connection("review_admin"),
    "-X",
    "-At",
    "-c",
    "SELECT count(*) FROM review_sample",
  ]);
  assert(
    count.trim() === "2",
    "Fixture remains unchanged after rejected writes",
  );
  const active = command([
    "psql",
    connection("review_admin"),
    "-X",
    "-At",
    "-c",
    "SELECT count(*) FROM pg_stat_activity WHERE usename = 'review_reader'",
  ]);
  assert(active.trim() === "0", "No reader connections remain after queries");
  console.log(
    JSON.stringify(
      {
        status: "pass",
        postgres: command(["postgres", "--version"]).trim(),
        usql: command(["usql", "--version"]).trim(),
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  if (previous === undefined) delete process.env.REVIEW_DATABASE_URL;
  else process.env.REVIEW_DATABASE_URL = previous;
  if (started) command(["pg_ctl", "-D", data, "-m", "immediate", "-w", "stop"]);
  rmSync(root, { recursive: true, force: true });
}
