# HA PostgreSQL + PgDog + NestJS/TypeORM

Entorno local de Alta Disponibilidad (HA) para PostgreSQL con enrutamiento inteligente de queries vía PgDog, listo para consumirse desde NestJS + TypeORM.

## Arquitectura

```
NestJS App (:3000)
      │
      │  PostgreSQL protocol
      ▼
PgDog (:6432) ← Único endpoint para la app
  │  ├─ SQL parsing + Read/Write routing
  │  ├─ Transaction pooling
  │  └─ Health checks automáticos
  │
  ├──► postgres-primary (:5432)   — Escritura + Lectura en transacciones
  ├──► postgres-replica-1 (:5433) — Solo lectura (round-robin)
  └──► postgres-replica-2 (:5434) — Solo lectura (round-robin)
```

## Archivos generados

| Archivo | Descripción |
|---|---|
| `docker-compose.yml` | Clúster PostgreSQL HA + PgDog |
| `pgdog.toml` | Configuración de PgDog (pooling, routing, backends) |
| `users.toml` | Credenciales de usuarios para PgDog |
| `.env.example` | Variables de entorno (copiar a `.env`) |
| `nestjs/src/database/database.config.ts` | Fábrica de configuración TypeORM |
| `nestjs/src/database/database.module.ts` | Módulo NestJS con TypeORM |
| `nestjs/src/app.module.ts` | Ejemplo de AppModule raíz |

## Inicio rápido

```bash
# 1. Copiar variables de entorno
cp .env.example .env

# 2. Levantar la infraestructura
docker compose up -d

# 3. Verificar que todo está sano
docker compose ps
docker compose logs pgdog --tail=20

# 4. Conectar al primary directamente (verificación)
psql -h localhost -p 5432 -U app_user -d app_db

# 5. Conectar a través de PgDog (esto es lo que usa la app)
psql -h localhost -p 6432 -U app_user -d app_db
```

## Integración NestJS

### Dependencias requeridas

```bash
npm install @nestjs/typeorm typeorm pg @nestjs/config
```

### Configuración mínima en `package.json` scripts

```json
{
  "scripts": {
    "migration:generate": "typeorm migration:generate -d src/database/data-source.ts",
    "migration:run": "typeorm migration:run -d src/database/data-source.ts",
    "migration:revert": "typeorm migration:revert -d src/database/data-source.ts"
  }
}
```

## ¿Por qué un único endpoint a PgDog? (y no `replication` de TypeORM)

### Opción A — Único endpoint PgDog ✅ **Recomendada**

```
TypeORM → PgDog(:6432) → [Primary | Replica1 | Replica2]
```

- PgDog parsea el SQL y enruta automáticamente (write → primary, read → réplica)
- Health checks automáticos: si una réplica cae, PgDog la retira del pool sin afectar la app
- Configuración mínima en TypeORM (solo un host/port)
- Métricas y observabilidad centralizadas en PgDog

### Opción B — `replication` de TypeORM ❌ No recomendada con PgDog

```typescript
// NO hagas esto cuando ya tienes PgDog
TypeOrmModule.forRoot({
  type: 'postgres',
  replication: {
    master: { host: 'localhost', port: 5432 },
    slaves: [
      { host: 'localhost', port: 5433 },
      { host: 'localhost', port: 5434 },
    ],
  },
})
```

**Problemas:**
- TypeORM no detecta si las réplicas están disponibles o con lag
- Duplicas pools: TypeORM tiene 3 pools + PgDog tiene los suyos → explosión de conexiones
- Las transacciones mixtas (SELECT + INSERT) pueden enrutarse mal si no usas `QueryRunner` manualmente
- Cuando una réplica cae, TypeORM falla las queries que le toca sin circuit-breaker

## Ajustes críticos de TypeORM para funcionar con poolers

### 1. Tamaño del pool (`extra.max`)

```typescript
extra: { max: 10 }  // NUNCA pongas 100 o el default de pg (10 está bien)
```

El número real de conexiones a PostgreSQL = `max` × `instancias_app`.
Con 3 instancias y `max: 10` → 30 conexiones llegarán a PgDog.
PgDog limitará al `default_pool_size` de `pgdog.toml`.

### 2. Prepared Statements con `pool_mode = "transaction"`

En modo transacción, cada query puede ir a una conexión diferente del pool real.
Los **named prepared statements** (creados con `PREPARE nombre AS ...`) son
específicos de la conexión y fallarían.

La librería `pg` usa **unnamed prepared statements** (protocol-level) para queries
parametrizadas por defecto — estos **sí son compatibles** con transaction pooling.

Si ves el error `prepared statement "X" does not exist`, añade en `extra`:
```typescript
extra: { prepare: false }  // Deshabilita prepared statements completamente
```

### 3. Migraciones con TypeORM

Las migraciones siempre deben correr conectando **directamente al primary**,
nunca a través de PgDog en modo transacción (las DDL largas necesitan session pooling).

```typescript
// data-source.ts (solo para CLI de migraciones)
export const MigrationDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',  // ← Directo al primary
  port: 5432,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  migrations: ['src/migrations/**/*.ts'],
});
```

O usar el usuario `migrations_user` de `users.toml` que tiene `pool_mode = "session"`.

## Verificar replicación

```bash
# En el primary: ver réplicas conectadas
psql -h localhost -p 5432 -U app_user -d app_db \
  -c "SELECT client_addr, state, sent_lsn, replay_lsn FROM pg_stat_replication;"

# En una réplica: verificar que es standby
psql -h localhost -p 5433 -U app_user -d app_db \
  -c "SELECT pg_is_in_recovery();"
# → debe retornar: t (true)
```

## Variables de entorno de producción

En producción (Kubernetes, ECS, etc.) reemplaza `localhost` por el service name:

```env
PGDOG_HOST=pgdog-service   # nombre del service en K8s/Docker Compose
PGDOG_PORT=6432
```
