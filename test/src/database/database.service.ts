import { DataSource } from 'typeorm';
import databaseConfig from './database.config';

// Instancia única de DataSource (patrón singleton)
// Usar AppDataSource.getRepository(Entity) para acceder a los repositorios
export const AppDataSource = new DataSource(databaseConfig);

// Conecta al iniciar la app y devuelve el DataSource listo
export async function initDatabase(): Promise<DataSource> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    console.log('[DB] Conectado a PgDog →', databaseConfig.host, ':', databaseConfig.port);
  }
  return AppDataSource;
}

// Cierra la conexión limpiamente (usar en señales SIGTERM/SIGINT)
export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('[DB] Conexión cerrada.');
  }
}
