import "dotenv/config";
import { db } from "./db/index.js";
import { barberos, servicios, horarios } from "./db/schema.js";

// Horario del local (mismo para todos los barberos como punto de partida).
// diaSemana: 0=domingo ... 6=sábado. Domingo cerrado (no se carga).
const HORARIO_LOCAL: { dia: number; inicio: string; fin: string }[] = [
  { dia: 1, inicio: "10:00", fin: "20:00" }, // Lunes
  { dia: 2, inicio: "06:30", fin: "21:30" }, // Martes
  { dia: 3, inicio: "06:30", fin: "21:00" }, // Miércoles
  { dia: 4, inicio: "06:30", fin: "21:00" }, // Jueves
  { dia: 5, inicio: "05:00", fin: "21:00" }, // Viernes
  { dia: 6, inicio: "06:00", fin: "20:00" }, // Sábado
];

async function seed() {
  console.log("⟳ Limpiando tablas de catálogo...");
  await db.delete(horarios);
  await db.delete(servicios);
  await db.delete(barberos);

  console.log("⟳ Insertando barberos...");
  const barberosInsertados = await db
    .insert(barberos)
    .values([
      { nombre: "Luis Campos", nivel: "premium" },
      { nombre: "Emiliano Asencio", nivel: "premium" },
      { nombre: "Adriel Baigorria", nivel: "estandar" },
      { nombre: "Javier Vara", nivel: "estandar" },
      { nombre: "Exequiel Ruiz", nivel: "estandar" },
    ])
    .returning();

  console.log("⟳ Insertando servicios...");
  await db.insert(servicios).values([
    // Premium (Luis & Emiliano)
    {
      nombre: "Corte + Barba",
      descripcion:
        "La combinación perfecta. Corte a medida con diseño y perfilado de barba de precisión.",
      nivel: "premium",
      duracionMin: 90,
      precio: 38000,
    },
    {
      nombre: "Solo Corte",
      descripcion:
        "Corte personalizado con degradé, perfilado y acabado profesional impecable.",
      nivel: "premium",
      duracionMin: 90,
      precio: 32000,
    },
    {
      nombre: "Solo Barba",
      descripcion:
        "Diseño, perfilado y arreglo completo de barba con toalla caliente y aceite hidratante.",
      nivel: "premium",
      duracionMin: 60,
      precio: 30000,
    },
    {
      nombre: "Corte + Barba + Alisado",
      descripcion:
        "Servicio completo premium: corte, barba y alisado para un look impecable.",
      nivel: "premium",
      duracionMin: 105,
      precio: 40000,
    },
    // Estándar (Adriel, Javier & Exequiel)
    {
      nombre: "Corte + Barba",
      descripcion:
        "Corte a medida más diseño completo de barba. Resultado profesional garantizado.",
      nivel: "estandar",
      duracionMin: 80,
      precio: 30000,
    },
    {
      nombre: "Solo Corte",
      descripcion: "Corte con degradé, perfilado y repaso de cuello y patillas.",
      nivel: "estandar",
      duracionMin: 60,
      precio: 24000,
    },
    {
      nombre: "Solo Barba",
      descripcion:
        "Arreglo y perfilado de barba con máquina y navaja para un look definido.",
      nivel: "estandar",
      duracionMin: 60,
      precio: 20000,
    },
    {
      nombre: "Corte Infantil",
      descripcion:
        "Para los más chicos. Corte amigable, rápido y prolijo. Mayores de 4 años.",
      nivel: "estandar",
      duracionMin: 30,
      precio: 20000,
    },
  ]);

  console.log("⟳ Insertando horarios...");
  const filasHorario = barberosInsertados.flatMap((b) =>
    HORARIO_LOCAL.map((h) => ({
      barberoId: b.id,
      diaSemana: h.dia,
      horaInicio: h.inicio,
      horaFin: h.fin,
    }))
  );
  await db.insert(horarios).values(filasHorario);

  console.log(
    `✓ Listo: ${barberosInsertados.length} barberos, 8 servicios, ${filasHorario.length} franjas horarias.`
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error("✗ Error en el seed:", err);
  process.exit(1);
});
