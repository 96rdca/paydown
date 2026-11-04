# Paydown

Panel personal de finanzas sobre la hoja de cálculo **"Payments"** (Google
Sheets): quincenas, tarjetas de crédito, préstamos, ahorro y calendario de
pagos — presentados como dashboard.

**v1 es de solo lectura**: la app lee la hoja pública en vivo y la muestra con
mucho mejor presentación. La edición con escritura de regreso a la hoja llega
en la Fase 2.

## Stack

- [Next.js 16](https://nextjs.org) (App Router) + TypeScript strict
- Tailwind CSS v4 + shadcn/ui (radix · preset nova)
- Recharts (gráficas)
- [Bun](https://bun.sh) como package manager y test runner

## Uso

```bash
bun install
cp .env.example .env   # y pon tu SPREADSHEET_ID
bun run dev            # http://localhost:3000
```

`.env`:

```
SPREADSHEET_ID=<id-de-tu-hoja-compartida-con-enlace>
```

La hoja debe estar compartida como **"Cualquiera con el enlace → ver"**. Se lee
vía el endpoint público de exportación CSV — sin credenciales ni Google Cloud.

## Rutas

| Ruta | Contenido |
|---|---|
| `/` | Dashboard: KPIs, próximos pagos, utilización, progreso |
| `/quincenas` | Presupuesto quincenal Q 15 / Q 30 |
| `/tarjetas` | Tarjetas: límites, balances, corte/vencimiento, mínimo |
| `/prestamos` | Préstamos: cronogramas, estado de cuotas, abonos |
| `/ahorro` | Ahorro 100: reto de 52 semanas |
| `/calendario` | Línea de tiempo de pagos próximos |
| `/calculadora` | Calculadora de amortización interactiva |
| `/configuracion` | Tasa del día, fuente y actualización de datos |

## Desarrollo

```bash
bun test                    # tests del parser (bun:test)
bun run scripts/check-snapshot.ts   # paridad en vivo contra la hoja real
bun run lint
bun run build
```

- `src/lib/types.ts` + `src/lib/sheets/` — contrato de datos y lector en vivo
  (parsers anclados por etiquetas; si la hoja cambia de estructura, falla con
  un error claro en vez de mostrar datos incorrectos).
- Los datos se cachean 60 s en memoria; `/api/snapshot?force=1` fuerza re-lectura.

## Hoja de ruta

1. ✅ Fase 0–1: espejo de solo lectura en vivo
2. ⏳ Fase 2: edición + escritura de regreso a la hoja (service account)
3. Fase 3: motor de tarjetas (tasas por tarjeta, proyección de intereses,
   gestión de corte/vencimiento)
4. Fase 4: motor de préstamos (simulador de abonos) + pulido
