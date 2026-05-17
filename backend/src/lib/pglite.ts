/**
 * db.ts — SQL singleton that boots postgres.js against DATABASE_URL,
 * or falls back to an in-process PGlite instance for local dev.
 *
 * The returned object is typed as `postgres.Sql<{}>` so PostgresPersistor
 * (and everything else that accepts that type) works without any casting.
 *
 * Tricky postgres.js features that must be shimmed for PGlite:
 *   sql`tagged template`               — parameterised query
 *   sql(arrayOfObjects, ...cols)        — bulk-insert helper (recordContextEvents)
 *   sql.json(value)                     — JSONB wrapper (returns value as-is for PGlite)
 *   sql.begin(async tx => { … })        — transaction
 *   this.sql.json() called inside begin — json() must live on both outer + tx shim
 */

import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

// ─── Logger ──────────────────────────────────────────────────────────────────
//
// Set DB_LOG=1 (or DB_LOG=verbose) to enable.
// DB_LOG=verbose also prints the resolved SQL + params for every query.
//
//   DB_LOG=1        → lifecycle events only
//   DB_LOG=verbose  → lifecycle + every query with params + timings

type LogLevel = 'info' | 'query' | 'error';

const LOG_ENABLED = !!process.env.DB_LOG;
const LOG_VERBOSE = process.env.DB_LOG === 'verbose';

const COLOURS = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  cyan:   '\x1b[36m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  blue:   '\x1b[34m',
  bold:   '\x1b[1m',
};

// Collapse whitespace so multi-line SQL fits on one log line
function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  if (!LOG_ENABLED) return;
  if (level === 'query' && !LOG_VERBOSE) return;

  const colour =
    level === 'error' ? COLOURS.red :
    level === 'query' ? COLOURS.blue :
    COLOURS.cyan;

  const prefix = `${colour}${COLOURS.bold}[db:${level}]${COLOURS.reset}`;
  const ts     = `${COLOURS.dim}${new Date().toISOString()}${COLOURS.reset}`;

  if (meta && Object.keys(meta).length) {
    console.log(`${ts} ${prefix} ${msg}`, meta);
  } else {
    console.log(`${ts} ${prefix} ${msg}`);
  }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const SCHEMA_DDL = `
  DO $$ BEGIN
    CREATE TYPE "CascadeStatus"  AS ENUM ('RUNNING', 'COMPLETED', 'ERROR');
    CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
  EXCEPTION WHEN duplicate_object THEN null; END $$;

  CREATE TABLE IF NOT EXISTS "cascades" (
    "id"         TEXT PRIMARY KEY,
    "status"     "CascadeStatus"  NOT NULL DEFAULT 'RUNNING',
    "fn_id"      INTEGER          NOT NULL DEFAULT 0,
    "user_id"    TEXT             NOT NULL,
    "created_at" TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3)     NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "node_executions" (
    "id"               TEXT PRIMARY KEY,
    "node_instance_id" TEXT    UNIQUE  NOT NULL,
    "cascade_id"       TEXT    NOT NULL REFERENCES "cascades"("id") ON DELETE CASCADE,
    "node_name"        TEXT    NOT NULL,
    "function_id"      INTEGER NOT NULL,
    "input_context"    JSONB   NOT NULL,
    "full_output"      JSONB,
    "location"         TEXT    NOT NULL,
    "status"           "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "error"            TEXT,
    "started_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at"     TIMESTAMP(3),
    UNIQUE("cascade_id", "function_id")
  );

  CREATE TABLE IF NOT EXISTS "context_events" (
    "id"          SERIAL PRIMARY KEY,
    "key"         TEXT         NOT NULL,
    "value"       JSONB        NOT NULL,
    "ui_value"    JSONB,         -- Added: Nullable JSONB to match uiValue Json?
    "function_id" INTEGER      NOT NULL,
    "cascade_id"  TEXT         NOT NULL REFERENCES "cascades"("id") ON DELETE CASCADE,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

  CREATE INDEX IF NOT EXISTS "cascades_user_id_status_idx"
    ON "cascades"("user_id", "status");
  CREATE INDEX IF NOT EXISTS "context_events_cascade_id_function_id_idx"
    ON "context_events"("cascade_id", "function_id");
`;

// ─── PGlite shim ─────────────────────────────────────────────────────────────
//
// We need to satisfy the postgres.Sql<{}> interface well enough for
// PostgresPersistor. The three call signatures actually used are:
//
//   1. sql`...template...`                   → tagged template query
//   2. sql(arrayOfObjects, col1, col2, …)    → bulk-insert values fragment
//   3. sql.json(value)                       → JSONB literal wrapper
//   4. sql.begin(async tx => { … })          → transaction block
//
// For (2), postgres.js normally returns a "fragment" that is embedded inside
// another tagged template.  The only place this is used is:
//
//   await this.sql`
//     INSERT INTO context_events ${this.sql(events, 'key', 'value', ...)}
//   `
//
// We handle this by detecting when the helper is called inside a template
// (the template slot receives a special sentinel object) and expanding the
// rows into individual parameterised INSERT rows at that point.

interface PGliteExecutor {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  transaction<T>(cb: (tx: PGliteExecutor) => Promise<T>): Promise<T>;
}

/** Sentinel that carries bulk-insert data through a template slot. */
class BulkFragment {
  constructor(
    public readonly rows: Record<string, unknown>[],
    public readonly columns: string[],
  ) {}
}

/**
 * Build the full  (col1, col2, …) VALUES ($1, $2, …), ($3, $4, …)  fragment
 * that postgres.js injects when you write:
 *
 *   sql`INSERT INTO t ${sql(rows, 'col1', 'col2')}`
 *
 * `startIndex` is the $N offset for the first placeholder.
 */
function buildBulkValues(
  rows: Record<string, unknown>[],
  columns: string[],
  startIndex: number,
): { clause: string; params: unknown[] } {
  const params: unknown[] = [];
  const colList = columns.map((c) => `"${c}"`).join(', ');
  const valueClauses = rows.map((row) => {
    const placeholders = columns.map((col) => {
      params.push(row[col]);
      return `$${startIndex + params.length - 1}`;
    });
    return `(${placeholders.join(', ')})`;
  });
  return { clause: `(${colList}) VALUES ${valueClauses.join(', ')}`, params };
}

/**
 * Resolve a tagged template + interpolated values into {query, params}.
 * Handles BulkFragment sentinels embedded in template slots.
 */
function resolveTemplate(
  strings: TemplateStringsArray | readonly string[],
  values: unknown[],
): { query: string; params: unknown[] } {
  let query = '';
  const params: unknown[] = [];

  for (let i = 0; i < strings.length; i++) {
    query += strings[i];
    if (i < values.length) {
      const val = values[i];
      if (val instanceof BulkFragment) {
        const { clause, params: bulkParams } = buildBulkValues(
          val.rows,
          val.columns,
          params.length + 1,
        );
        query += clause;
        params.push(...bulkParams);
      } else {
        params.push(val);
        query += `$${params.length}`;
      }
    }
  }

  return { query, params };
}

// Incrementing counter so each query gets a short ID in the logs
let _querySeq = 0;

async function runQuery(
  executor: PGliteExecutor,
  query: string,
  params: unknown[],
  context: string,           // 'query' | 'tx#N' | 'unsafe'
): Promise<Record<string, unknown>[]> {
  const id  = ++_querySeq;
  const sql = compactSql(query);

  log('query', `#${id} [${context}] ${sql}`, LOG_VERBOSE ? { params } : {});

  const t0 = performance.now();
  try {
    const result = await executor.query(query, params);
    const ms = (performance.now() - t0).toFixed(2);
    log('query', `#${id} ✓ ${result.rows.length} row(s) in ${ms}ms`);
    return result.rows;
  } catch (err: any) {
    const ms = (performance.now() - t0).toFixed(2);
    log('error', `#${id} ✗ failed in ${ms}ms — ${err?.message ?? err}`);
    throw err;
  }
}

let _txSeq = 0;

function makePGliteShim(
  executor: PGliteExecutor,
  context = 'query',   // label used in log lines ('query' or 'tx#N')
): postgres.Sql<{}> {
  /**
   * The shim handles two distinct call forms:
   *
   *   (a) sql`tagged template`
   *       stringsOrRows has a `.raw` property (TemplateStringsArray)
   *
   *   (b) sql(arrayOfObjects, col1, col2, …)
   *       stringsOrRows is a plain array without `.raw`
   *       Returns a BulkFragment sentinel; no DB call yet.
   */
  function shim(
    stringsOrRows: TemplateStringsArray | Record<string, unknown>[],
    ...rest: unknown[]
  ): any {
    // ── (b) bulk-insert helper ─────────────────────────────────────────────
    if (Array.isArray(stringsOrRows) && !(stringsOrRows as any).raw) {
      const rows = stringsOrRows as Record<string, unknown>[];
      const columns = rest as string[];
      log('query', `bulk fragment: ${rows.length} row(s) × [${columns.join(', ')}]`);
      return new BulkFragment(rows, columns);
    }

    // ── (a) tagged template ────────────────────────────────────────────────
    const strings = stringsOrRows as TemplateStringsArray;
    const { query, params } = resolveTemplate(strings, rest);
    return runQuery(executor, query, params, context);
  }

  // json(): PGlite accepts plain JS objects for JSONB — no serialisation needed.
  // We still expose it so call-sites using this.sql.json(value) work unchanged,
  // including when called on `this.sql` (outer) inside a .begin() callback.
  (shim as any).json = (value: unknown) => value;

  // begin(): PGlite transaction; expose a fresh shim wrapping the tx executor.
  (shim as any).begin = <T>(
    cb: (tx: postgres.Sql<{}>) => Promise<T>,
  ): Promise<T> => {
    const txId = ++_txSeq;
    log('info', `tx#${txId} begin`);
    const t0 = performance.now();

    return executor.transaction((tx) => {
      const txShim = makePGliteShim(tx, `tx#${txId}`);
      return cb(txShim);
    }).then((result) => {
      const ms = (performance.now() - t0).toFixed(2);
      log('info', `tx#${txId} commit (${ms}ms)`);
      return result;
    }).catch((err) => {
      const ms = (performance.now() - t0).toFixed(2);
      log('error', `tx#${txId} rollback (${ms}ms) — ${err?.message ?? err}`);
      throw err;
    });
  };

  // unsafe(): raw string query — used for dynamic DDL / migrations
  (shim as any).unsafe = (query: string, params: unknown[] = []) =>
    runQuery(executor, query, params, 'unsafe');

  // end(): close the underlying PGlite store
  (shim as any).end = async () => {
    log('info', 'closing PGlite instance');
    if ('close' in executor && typeof (executor as any).close === 'function') {
      await (executor as any).close();
      log('info', 'PGlite closed');
    }
  };

  return shim as unknown as postgres.Sql<{}>;
}

async function createPGliteInstance(): Promise<postgres.Sql<{}>> {
  log('info', 'booting PGlite at ./.cascaide_db …');
  const t0 = performance.now();
  const db = new PGlite('./.cascaide_db', { extensions: { pgcrypto } });
  await db.waitReady;
  log('info', `PGlite engine ready (${(performance.now() - t0).toFixed(0)}ms), applying schema …`);
  const t1 = performance.now();
  await db.exec(SCHEMA_DDL);
  log('info', `schema applied (${(performance.now() - t1).toFixed(0)}ms) — PGlite ready ✓`);
  return makePGliteShim(db as unknown as PGliteExecutor);
}

// ─── postgres.js instance ────────────────────────────────────────────────────

function createPostgresInstance(connectionString: string): postgres.Sql<{}> {
  // Redact credentials from the URL for safe logging
  const safeUrl = connectionString.replace(/:\/\/[^@]+@/, '://<credentials>@');
  log('info', `connecting via postgres.js → ${safeUrl}`);
  const pg = postgres(connectionString, {
    max: process.env.NODE_ENV === 'production' ? 10 : 1,
    idle_timeout: 20,
    onnotice: (notice) => log('info', `notice: ${notice.message}`),
    debug: LOG_VERBOSE
      ? (_conn, query, params) => {
          log('query', `[pg.js] ${compactSql(query)}`, { params });
        }
      : undefined,
  });
  log('info', 'postgres.js pool created ✓');
  return pg;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

async function createSqlInstance(): Promise<postgres.Sql<{}>> {
  const connectionString = process.env.DATABASE_URL;
  if (!LOG_ENABLED) {
    console.log(
      '[db] Logging is off. Set DB_LOG=1 for lifecycle events, DB_LOG=verbose for query tracing.',
    );
  }
  if (connectionString) {
    return createPostgresInstance(connectionString);
  }
  log('info', 'no DATABASE_URL found — falling back to PGlite for local dev');
  return createPGliteInstance();
}

// ─── Singleton ───────────────────────────────────────────────────────────────
//
// Store the Promise (not the resolved value) on the global so that Next.js
// hot-reload and concurrent module evaluations all await the same
// initialisation — never two PGlite instances pointing at the same directory.

declare global {
  // eslint-disable-next-line no-var
  var __sqlInstance: Promise<postgres.Sql<{}>> | undefined;
}

function getSqlPromise(): Promise<postgres.Sql<{}>> {
  if (!global.__sqlInstance) {
    global.__sqlInstance = createSqlInstance();
  }
  return global.__sqlInstance;
}

/**
 * `getDb()` — safe for every runtime (CJS, edge, older Node).
 *
 * @example
 * // Express / Fastify / Hono
 * import { getDb } from './db';
 *
 * app.get('/cascades', async (req, res) => {
 *   const sql = await getDb();
 *   const persistor = new PostgresPersistor(sql);
 *   // …
 * });
 *
 * // Graceful shutdown
 * process.on('SIGTERM', async () => {
 *   const sql = await getDb();
 *   await sql.end();
 *   process.exit(0);
 * });
 */
export async function getDb(): Promise<postgres.Sql<{}>> {
  return getSqlPromise();
}

/**
 * `sql` — top-level-await singleton for runtimes that support it:
 *   - Next.js App Router server components / route handlers
 *   - Hono on Bun
 *   - Fastify with ESM
 *
 * The module won't finish loading until the DB is ready.
 *
 * @example
 * // Next.js App Router route handler
 * import { sql } from './db';
 * const persistor = new PostgresPersistor(sql);
 *
 * export async function POST(req: NextRequest) {
 *   return NextResponse.json(await persistor.claimNodeExecution(…));
 * }
 */
//export const sql: postgres.Sql<{}> = await getSqlPromise();