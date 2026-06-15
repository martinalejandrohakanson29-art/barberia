ALTER TABLE "turnos" DROP CONSTRAINT "turnos_cliente_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "turnos" ALTER COLUMN "cliente_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "turnos" ALTER COLUMN "estado" SET DEFAULT 'pendiente';--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "cliente_nombre" text;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "cliente_telefono" text;--> statement-breakpoint
ALTER TABLE "turnos" ADD COLUMN "cliente_email" text;--> statement-breakpoint
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_cliente_id_user_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;