import { AppDataSource, initDatabase, closeDatabase } from './database/database.service';

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';

function ok(msg: string)   { console.log(`${GREEN}  ✔ ${msg}${RESET}`); }
function fail(msg: string) { console.log(`${RED}  ✘ ${msg}${RESET}`); }
function info(msg: string) { console.log(`${YELLOW}  → ${msg}${RESET}`); }

async function runTests(): Promise<void> {
  console.log('\n======================================');
  console.log('  PgDog → PostgreSQL  —  Test de conexión');
  console.log('======================================\n');

  info(`Host : ${process.env.PGDOG_HOST}:${process.env.PGDOG_PORT}`);
  info(`DB   : ${process.env.PGDOG_DATABASE}`);
  info(`User : ${process.env.PGDOG_USERNAME}`);
  console.log('');

  // ── 1. Conectar ────────────────────────────────────────────────────────────
  await initDatabase();
  ok('Conexión establecida con PgDog');

  // ── 2. Info del servidor ───────────────────────────────────────────────────
  const [server] = await AppDataSource.query<{ database: string; version: string; is_replica: boolean; ts: string }[]>(
    `SELECT
       current_database()          AS database,
       split_part(version(), ' ', 2) AS version,
       pg_is_in_recovery()         AS is_replica,
       now()::text                 AS ts`
  );
  ok(`Base de datos : ${server.database}`);
  ok(`PostgreSQL    : v${server.version}`);
  ok(`Nodo actual   : ${server.is_replica ? 'RÉPLICA (read-only)' : 'PRIMARY (read-write)'}`);
  ok(`Timestamp     : ${server.ts}`);

  // ── 3. Tabla de prueba ─────────────────────────────────────────────────────
  console.log('');
  info('Creando tabla temporal de prueba...');
  await AppDataSource.query(`
    CREATE TABLE IF NOT EXISTS _pgdog_test (
      id    SERIAL PRIMARY KEY,
      value TEXT NOT NULL,
      ts    TIMESTAMPTZ DEFAULT now()
    )
  `);
  ok('Tabla _pgdog_test creada / ya existía');

  // ── 4. INSERT ──────────────────────────────────────────────────────────────
  const testValue = `test_${Date.now()}`;
  await AppDataSource.query(`INSERT INTO _pgdog_test (value) VALUES ($1)`, [testValue]);
  ok(`INSERT OK → value="${testValue}"`);

  // ── 5. SELECT ──────────────────────────────────────────────────────────────
  const rows = await AppDataSource.query<{ id: number; value: string }[]>(
    `SELECT id, value FROM _pgdog_test ORDER BY id DESC LIMIT 3`
  );
  ok(`SELECT OK → ${rows.length} fila(s) recientes:`);
  rows.forEach(r => console.log(`       id=${r.id}  value=${r.value}`));

  // ── 6. Limpiar ─────────────────────────────────────────────────────────────
  await AppDataSource.query(`DROP TABLE IF EXISTS _pgdog_test`);
  ok('Tabla de prueba eliminada');

  console.log(`\n${GREEN}======================================`);
  console.log('  TODAS LAS PRUEBAS PASARON ✔');
  console.log(`======================================${RESET}\n`);
}

runTests()
  .catch((err) => {
    fail(`Error: ${err.message}`);
    if (process.env.NODE_ENV === 'development') console.error(err);
    process.exit(1);
  })
  .finally(closeDatabase);
