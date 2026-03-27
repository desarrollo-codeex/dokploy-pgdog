import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as dotenv from 'dotenv';

// Carga variables desde .env (si existe)
dotenv.config();

// Opciones de conexión TypeORM → PgDog (único endpoint)
// PgDog enruta internamente: escrituras al primary, lecturas a las réplicas
const databaseConfig: PostgresConnectionOptions = {
  type: 'postgres',

  // Apunta SIEMPRE a PgDog, nunca directamente a PostgreSQL
  host:     process.env.PGDOG_HOST     ?? 'localhost',
  port:     parseInt(process.env.PGDOG_PORT ?? '6432', 10),
  username: process.env.PGDOG_USERNAME ?? 'app_user',
  password: process.env.PGDOG_PASSWORD ?? 'app_password123',
  database: process.env.PGDOG_DATABASE ?? 'app_db',

  entities:   [__dirname + '/../../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../../migrations/**/*{.ts,.js}'],

  // false en producción — usar `npx typeorm migration:run`
  synchronize:   false,
  migrationsRun: process.env.NODE_ENV !== 'production',
  logging:       process.env.NODE_ENV === 'development'
                   ? ['error', 'warn', 'migration']
                   : ['error'],

  // Pool de TypeORM → PgDog
  // Mantener bajo: PgDog ya gestiona el pool real hacia PostgreSQL
  extra: {
    max: parseInt(process.env.DB_POOL_MAX  ?? '10', 10),
    min: parseInt(process.env.DB_POOL_MIN  ?? '2',  10),
    idleTimeoutMillis:      parseInt(process.env.DB_POOL_IDLE_TIMEOUT        ?? '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT ?? '5000',  10),
    application_name: 'pgdog_test_app',
    // Si ves "prepared statement X does not exist" con pool_mode=transaction, activa:
    // prepare: false,
  },

  cache: false,
};

export default databaseConfig;
