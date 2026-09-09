import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import {
  readWorkbook,
  readSheet,
} from "../public/src/services/excelService.js";
const context = vm.createContext({ console, Uint8Array, ArrayBuffer, Date });
vm.runInContext(
  await readFile(
    new URL("../public/vendor/xlsx.full.min.js", import.meta.url),
    "utf8",
  ),
  context,
);
const XLSX = context.XLSX;
function workbook(data) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Test");
  return wb;
}
test("Vrai aller-retour .xlsx préserve identifiants, nombres, dates Excel et cellules vides", async () => {
  const wb = workbook([
    ["Identifier", "Date", "Flag"],
    [42, 46001, true],
    ["000043", null, false],
  ]);
  wb.Sheets.Test.A2.z = "000000";
  wb.Sheets.Test.B2.z = "dd/mm/yyyy";
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const parsed = await readWorkbook(
    {
      name: "synthetic.xlsx",
      size: bytes.byteLength,
      arrayBuffer: async () => bytes,
    },
    XLSX,
  );
  const sheet = readSheet(parsed, "Test", 1, XLSX);
  assert.equal(sheet.rows[0][0], "000042");
  assert.equal(sheet.rows[0][1], 46001);
  assert.equal(sheet.rows[1][2], false);
});
test("Calendrier 1904 conservé après écriture et relecture Excel", async () => {
  const wb = workbook([["Date"], [44539]]);
  wb.Workbook = { WBProps: { date1904: true } };
  wb.Sheets.Test.A2.z = "dd/mm/yyyy";
  const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const parsed = await readWorkbook(
    {
      name: "synthetic.xlsx",
      size: bytes.byteLength,
      arrayBuffer: async () => bytes,
    },
    XLSX,
  );
  const sheet = readSheet(parsed, "Test", 1, XLSX);
  assert.equal(sheet.date1904, true);
  assert.equal(sheet.rows[0][0], 44539);
});
test("Ligne en-tête configurable et numéros Excel exacts après lignes blanches", () => {
  const wb = workbook([
    ["Titre"],
    [],
    ["Identifier", "", "Date"],
    ["A", "excluded", "10/12/2025"],
    [],
    ["B", "", "01/01/2026"],
  ]);
  const sheet = readSheet(wb, "Test", 3, XLSX);
  assert.deepEqual(sheet.headers, ["Identifier", "Date"]);
  assert.deepEqual(sheet.rowNumbers, [4, 6]);
  assert.equal(sheet.warnings.length, 1);
});
test("En-têtes dupliqués après normalisation rejetés", () =>
  assert.throws(
    () => readSheet(workbook([["Date_CDA", "date cda"]]), "Test", 1, XLSX),
    /double/,
  ));
test("Feuille vide et en-tête invalide explicités", () => {
  assert.throws(() => readSheet(workbook([]), "Test", 1, XLSX), /vide/);
  assert.throws(() => readSheet(workbook([["A"]]), "Test", 0, XLSX), /hors/);
});
test("Formule Excel sans résultat et cellules en erreur rejetées", () => {
  const wb = workbook([["A"], [1]]);
  wb.Sheets.Test.A2 = { t: "n", f: "1+1" };
  assert.throws(() => readSheet(wb, "Test", 1, XLSX), /sans résultat/);
  wb.Sheets.Test.A2 = { t: "e", v: 7 };
  assert.throws(() => readSheet(wb, "Test", 1, XLSX), /Erreur Excel/);
});
test("Fichiers incorrects et trop volumineux rejetés avant parsing", async () => {
  await assert.rejects(readWorkbook({ name: "file.txt" }, XLSX), /Choisir/);
  await assert.rejects(
    readWorkbook({ name: "file.xlsx", size: 40 * 1024 * 1024 }, XLSX),
    /30 Mo/,
  );
});
