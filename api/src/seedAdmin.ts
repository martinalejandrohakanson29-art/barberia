import "dotenv/config";
import { eq } from "drizzle-orm";
import { auth } from "./auth.js";
import { db } from "./db/index.js";
import { user } from "./db/schema.js";

// Crea (o re-asegura) el usuario administrador del panel.
// Credenciales por variables de entorno, con valores por defecto para desarrollo.
const EMAIL = process.env.ADMIN_EMAIL ?? "admin@arcanus.com";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "arcanus123";
const NOMBRE = process.env.ADMIN_NAME ?? "Administrador Arcanus";

async function seedAdmin() {
  const [existente] = await db.select().from(user).where(eq(user.email, EMAIL));

  if (!existente) {
    console.log(`⟳ Creando admin ${EMAIL} ...`);
    // signUpEmail aplica el hashing propio de Better Auth.
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: NOMBRE },
    });
  } else {
    console.log(`⟳ El usuario ${EMAIL} ya existe, sólo se asegura el rol admin.`);
  }

  await db.update(user).set({ rol: "admin" }).where(eq(user.email, EMAIL));

  console.log(`✓ Admin listo: ${EMAIL}`);
  console.log(`  Contraseña: ${PASSWORD} (cambiala en producción con ADMIN_PASSWORD)`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("✗ Error creando el admin:", err);
  process.exit(1);
});
