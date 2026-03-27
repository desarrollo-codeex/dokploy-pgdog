import { AppDataSource, initDatabase, closeDatabase } from './database/database.service';

async function main(): Promise<void> {
  // Inicializar la conexión a PgDog / PostgreSQL
  await initDatabase();

  // ── Prueba de conexión ────────────────────────────────────────────────────
  const result = await AppDataSource.query(
    `SELECT
       current_database()  AS database,
       inet_server_addr()  AS server_ip,
       pg_is_in_recovery() AS is_replica,
       now()               AS ts`
  );
  console.log('[DB] Query de prueba OK:', result[0]);

  // ── Aquí iría el resto de la app (HTTP server, workers, etc.) ────────────
  // server.listen(3000);

  // Cierre limpio ante señales del sistema
  process.on('SIGTERM', closeDatabase);
  process.on('SIGINT',  closeDatabase);
}

main().catch((err) => {
  console.error('[DB] Error al inicializar:', err);
  process.exit(1);
});
