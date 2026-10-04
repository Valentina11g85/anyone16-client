/**
 * AnyOne AI — natural language interpretation layer (Stage 2).
 *
 * It never publishes anything and never invents data: fields the user did not
 * mention come back as null and are reported through `missingFields`.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";

const locationSchema = z
  .object({
    label: z.string().describe("Lugar tal como lo dijo el usuario, vacío si no lo dijo"),
    details: z.string(),
  })
  .nullable();

const interpretationSchema = z.object({
  summary: z.string().describe("Una frase corta que describe el favor, en el idioma del usuario"),
  description: z.string().describe("Descripción limpia del favor, en el idioma del usuario"),
  category: z.enum([
    "laundry",
    "packages",
    "shopping",
    "documents",
    "waiting",
    "flowers",
    "gifts",
    "pets",
    "other",
    "uncategorized",
  ]),
  pickup: locationSchema,
  destination: locationSchema,
  stops: z.array(z.object({ label: z.string(), details: z.string() })),
  schedulePreset: z.enum(["now", "today", "afternoon", "tonight", "tomorrow", "custom"]).nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD solo si el usuario lo dijo"),
  time: z.string().nullable().describe("HH:mm solo si el usuario lo dijo"),
  timeWindow: z.string().nullable(),
  urgency: z.enum(["low", "normal", "high"]),
  waitingRequired: z.boolean(),
  waitingDuration: z.string().nullable(),
  itemCount: z.number().int().nullable(),
  budgetAmount: z.number().nullable().describe("Solo el número, sin símbolos"),
  budgetCurrency: z.string().nullable().describe("Código ISO, ej COP"),
  specialInstructions: z.string(),
  missingFields: z.array(z.enum(["pickup", "destination", "schedule", "budget", "description"])),
  confidence: z.number().min(0).max(1),
  notes: z.array(z.string()),
});

export type FavorInterpretation = z.infer<typeof interpretationSchema>;

const inputSchema = z.object({
  text: z.string().min(1).max(4000),
  languageCode: z.string().default("es"),
  countryCode: z.string().default("CO"),
  currencyCode: z.string().default("COP"),
});

const systemPrompt = `Eres AnyOne AI, el intérprete de la plataforma de favores AnyOne16.
Conviertes una petición escrita en lenguaje natural en datos estructurados.

Reglas estrictas:
- NUNCA inventes información. Si el usuario no mencionó un dato, devuélvelo como null o vacío.
- No asumas direcciones, precios, horarios ni cantidades.
- Si falta un dato esencial (dónde recoger, a dónde llevar, cuándo o cuánto paga), inclúyelo en missingFields. Si el favor no requiere recogida o entrega, no lo marques como faltante.
- Interpreta cifras locales: "35.000" en Colombia son 35000, no 35.
- Usa la moneda por defecto del usuario solo si el monto no indica otra moneda.
- Redacta summary y description en el idioma del usuario, con lenguaje natural y humano.
- No publiques nada ni tomes decisiones por el usuario.`;

export const interpretFavor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<FavorInterpretation> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const today = new Date().toISOString().slice(0, 10);

    const { object } = await generateObject({
      model: lovable.responses("openai/gpt-6-astra"),
      schema: interpretationSchema,
      system: systemPrompt,
      prompt: `Idioma del usuario: ${data.languageCode}
País: ${data.countryCode}
Moneda por defecto: ${data.currencyCode}
Fecha de hoy: ${today}

Petición del usuario:
"""
${data.text}
"""`,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          store: false,
        },
      },
    });

    return object;
  });
