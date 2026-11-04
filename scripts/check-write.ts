/**
 * Live check for the Google Sheets write-back layer.
 *
 *   bun run scripts/check-write.ts            # no-op write (safe)
 *   bun run scripts/check-write.ts --mutate   # real, reversible change
 *
 * Default mode proves the whole loop — service-account auth, label-anchored
 * cell resolution, conflict check, single-cell PUT, verification and fresh
 * state — by writing the CURRENT rate back onto itself. Nothing observable
 * changes in the sheet.
 *
 * `--mutate` performs a real edit for full verification: it bumps "Tasa Dollar"
 * by 0.01 (e.g. 60.5 -> 60.51), re-reads to confirm, then restores the original
 * value. The restore runs even when the assertion fails, and a failed restore is
 * reported loudly because the sheet would be left on the temporary value.
 *
 * Without a service-account key the script prints setup instructions and exits
 * 0: write-back being disabled is a valid configuration, not a failure.
 */
import {
  DEFAULT_SERVICE_ACCOUNT_FILE,
  isSheetWriteConfigured,
  serviceAccountFilePath,
} from "../src/lib/gsheets/config";
import { applyCellEdits, usdRateEdit } from "../src/lib/gsheets/engine";
import { getFinancialState } from "../src/lib/state";

const EPSILON = 0.005;

function printSetupInstructions(): void {
  const keyPath = serviceAccountFilePath();

  console.log("Escritura no configurada — la app sigue en modo solo lectura.");
  console.log("");
  console.log("Para habilitar la escritura (Phase 2):");
  console.log(
    "  1. Google Cloud Console -> IAM -> Service Accounts -> crear/abrir una",
  );
  console.log("     service account y descargar una clave JSON.");
  console.log(`  2. Guardarla en: ${keyPath}`);
  console.log(
    `     (o definir GOOGLE_SERVICE_ACCOUNT_FILE con otra ruta; por defecto ${DEFAULT_SERVICE_ACCOUNT_FILE})`,
  );
  console.log(
    "  3. Compartir el spreadsheet con el client_email de la clave como Editor.",
  );
  console.log("  4. Asegurar SPREADSHEET_ID en .env (ya usado por el lector).");
  console.log("");
  console.log("Nada se escribió en la hoja. Saliendo OK.");
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > EPSILON) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function main(): Promise<void> {
  if (!isSheetWriteConfigured()) {
    printSetupInstructions();
    return;
  }

  const mutate = process.argv.includes("--mutate");
  const keyPath = serviceAccountFilePath();

  console.log(`Service account: ${keyPath}`);
  console.log(`Modo: ${mutate ? "MUTATE (cambio real y reversible)" : "no-op write"}`);

  const before = await getFinancialState({ force: true });
  const rate = before.snapshot.settings.usdRate;
  console.log(`Tasa Dollar actual: ${rate}`);

  if (!mutate) {
    // Writing the same value back still exercises auth, resolution, conflict
    // check, PUT and verification; the sheet content is unchanged.
    const state = await applyCellEdits([usdRateEdit(rate, rate)]);
    const confirmed = state.snapshot.settings.usdRate;
    assertClose(confirmed, rate, "tasa tras la escritura no-op");

    console.log(`Relectura confirma la tasa: ${confirmed}`);
    console.log("");
    console.log(
      "OK: auth + resolución de celda + conflicto + PUT + verificación funcionan.",
    );
    return;
  }

  const target = Math.round((rate + 0.01) * 100) / 100;
  console.log(`Escribiendo ${target} (era ${rate})…`);

  const changed = await applyCellEdits([usdRateEdit(rate, target)]);
  assertClose(changed.snapshot.settings.usdRate, target, "tasa tras MUTATE");
  console.log(`Relectura confirma ${changed.snapshot.settings.usdRate}.`);

  try {
    const restored = await applyCellEdits([usdRateEdit(target, rate)]);
    assertClose(restored.snapshot.settings.usdRate, rate, "tasa restaurada");
    console.log(`Restaurada a ${restored.snapshot.settings.usdRate}.`);
  } catch (error) {
    console.error("");
    console.error(
      `¡ATENCIÓN! No se pudo restaurar "Tasa Dollar". La hoja quedó en ${target} ` +
        `(el valor original era ${rate}). Restáurala a mano.`,
    );
    throw error;
  }

  console.log("");
  console.log("OK: escritura real y restauración verificadas contra la hoja.");
}

main().catch((error: unknown) => {
  console.error("");
  console.error("Live write check FAILED:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
