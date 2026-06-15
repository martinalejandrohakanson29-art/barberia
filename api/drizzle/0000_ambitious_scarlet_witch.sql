CREATE TYPE "public"."estado_turno" AS ENUM('pendiente', 'confirmado', 'cancelado', 'completado');--> statement-breakpoint
CREATE TYPE "public"."nivel" AS ENUM('premium', 'estandar');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('cliente', 'barbero', 'admin');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "barberos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"nivel" "nivel" NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"user_id" text
);
--> statement-breakpoint
CREATE TABLE "bloqueos" (
	"id" serial PRIMARY KEY NOT NULL,
	"barbero_id" integer NOT NULL,
	"desde" timestamp with time zone NOT NULL,
	"hasta" timestamp with time zone NOT NULL,
	"motivo" text
);
--> statement-breakpoint
CREATE TABLE "horarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"barbero_id" integer NOT NULL,
	"dia_semana" integer NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fin" time NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servicios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"nivel" "nivel" NOT NULL,
	"duracion_min" integer NOT NULL,
	"precio" integer NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" serial PRIMARY KEY NOT NULL,
	"cliente_id" text NOT NULL,
	"barbero_id" integer NOT NULL,
	"servicio_id" integer NOT NULL,
	"inicio" timestamp with time zone NOT NULL,
	"fin" timestamp with time zone NOT NULL,
	"estado" "estado_turno" DEFAULT 'confirmado' NOT NULL,
	"precio" integer NOT NULL,
	"notas" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"phone" text,
	"rol" "rol" DEFAULT 'cliente' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "barberos" ADD CONSTRAINT "barberos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueos" ADD CONSTRAINT "bloqueos_barbero_id_barberos_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."barberos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_barbero_id_barberos_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."barberos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_cliente_id_user_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_barbero_id_barberos_id_fk" FOREIGN KEY ("barbero_id") REFERENCES "public"."barberos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "public"."servicios"("id") ON DELETE restrict ON UPDATE no action;