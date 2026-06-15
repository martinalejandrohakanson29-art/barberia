import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/index.js";
import * as schema from "./db/schema.js";

const clientOrigin = process.env.CLIENT_ORIGIN ?? "http://localhost:8080";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  // Login con email + contraseña
  emailAndPassword: {
    enabled: true,
    // TODO Fase 2: enviar mail de verificación con Resend.
    requireEmailVerification: false,
  },
  // Login con Google (se activa cuando estén las credenciales)
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,
  // Campos propios expuestos en el modelo de usuario
  user: {
    additionalFields: {
      phone: { type: "string", required: false, input: true },
      rol: { type: "string", required: false, input: false },
    },
  },
  // El frontend (sitio estático) corre en otro origen
  trustedOrigins: [clientOrigin],
  advanced: {
    defaultCookieAttributes: {
      // En producción el panel admin se sirve desde un dominio distinto al de la
      // API (cross-site), por lo que la cookie de sesión necesita SameSite=None
      // + Secure para viajar en los fetch del panel. En local seguimos con lax.
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
});

export type Session = typeof auth.$Infer.Session;
