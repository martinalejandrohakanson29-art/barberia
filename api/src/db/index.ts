import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Falta DATABASE_URL en el entorno");
}

// Una sola conexión reutilizable. Railway maneja el pool del lado de Postgres.
const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
