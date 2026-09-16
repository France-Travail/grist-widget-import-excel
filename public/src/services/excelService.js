import { formatValue, parseDate } from "./dateService.js";
import { normalizeName, isEmpty } from "./utils.js";

export async function readWorkbook(file, xlsx = globalThis.XLSX) {
  if (!file || !/\.(xlsx|xls|xlsm)$/i.test(file.name))
    throw new Error("Choisir un fichier .xlsx, .xls ou .xlsm.");
  if (file.size > 30 * 1024 * 1024)
    throw new Error("Le fichier dépasse la limite de 30 Mo.");
  if (!xlsx)
    throw new Error(
      "Le lecteur Excel n’a pas pu être chargé. Actualiser le widget.",
    );
  let workbook;
  try {
    workbook = xlsx.read(await file.arrayBuffer(), {
      type: "array",
      cellNF: true,
      cellDates: false,
    });
  } catch {
    throw new Error(
      "Fichier illisible, corrompu ou protégé par un mot de passe.",
    );
  }
  if (!workbook.SheetNames.length)
    throw new Error("Le classeur ne contient aucune feuille.");
  return workbook;
}

export function readSheet(
  workbook,
  name,
  headerRow = 1,
  xlsx = globalThis.XLSX,
) {
  const worksheet = workbook.Sheets[name];
  if (!worksheet?.["!ref"]) throw new Error(`La feuille « ${name} » est vide.`);
  const range = xlsx.utils.decode_range(worksheet["!ref"]);
  if (
    !Number.isInteger(headerRow) ||
    headerRow < 1 ||
    headerRow > range.e.r + 1
  )
    throw new Error("Ligne d’en-tête hors de la feuille.");
  const rowCount = Math.max(0, range.e.r - headerRow + 1),
    colCount = range.e.c - range.s.c + 1;
  if (rowCount > 100000 || colCount > 500 || rowCount * colCount > 2000000)
    throw new Error(
      "Feuille trop grande (100 000 lignes, 500 colonnes et 2 millions de cellules maximum).",
    );
  const allHeaders = Array.from(
    { length: range.e.c - range.s.c + 1 },
    (_, index) => {
      const cell =
        worksheet[
          xlsx.utils.encode_cell({ r: headerRow - 1, c: range.s.c + index })
        ];
      return String(cell?.v ?? "").trim();
    },
  );
  const indexes = allHeaders.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
  const headers = indexes.map((i) => allHeaders[i]);
  if (!headers.length) throw new Error("Aucun en-tête sur cette ligne.");
  if (new Set(headers.map(normalizeName)).size !== headers.length)
    throw new Error(
      "En-têtes identiques après normalisation : renommer les colonnes en double.",
    );
  const rows = [],
    previewRows = [],
    rowNumbers = [],
    warnings = [];
  if (indexes.length !== allHeaders.length)
    warnings.push("Les colonnes sans en-tête sont exclues.");
  const date1904 = [true, 1, "1"].includes(
    workbook.Workbook?.WBProps?.date1904,
  );
  for (let r = headerRow; r <= range.e.r; r++) {
    const row = indexes.map((index) => {
      const cell =
        worksheet[xlsx.utils.encode_cell({ r, c: range.s.c + index })];
      if (!cell) return null;
      if (cell.t === "e")
        throw new Error(
          `Erreur Excel à la ligne ${r + 1}, colonne ${allHeaders[index]}.`,
        );
      if (cell.f && cell.v == null)
        throw new Error(
          `Formule sans résultat à la ligne ${r + 1} : recalculer puis enregistrer le fichier dans Excel.`,
        );
      // Identifiers formatted as 00000000 must keep their leading zeroes.
      if (cell.t === "n" && /^0{2,}$/.test(cell.z ?? ""))
        return xlsx.utils.format_cell(cell);
      return cell.v ?? null;
    });
    if (!row.every(isEmpty)) {
      rows.push(row);
      rowNumbers.push(r + 1);
      if (previewRows.length < 20) {
        previewRows.push(
          indexes.map((index, position) => {
            const cell =
              worksheet[xlsx.utils.encode_cell({ r, c: range.s.c + index })];
            const value = row[position];
            if (cell?.t === "n" && xlsx.SSF.is_date(cell.z ?? "")) {
              try {
                // Only the preview is formatted. The import keeps the original Excel value.
                const seconds = parseDate(value, { date1904, dateTime: true });
                return formatValue(
                  seconds,
                  Number.isInteger(value) ? "Date" : "DateTime:UTC",
                );
              } catch {
                // Keep malformed values visible; validation reports the actual error.
              }
            }
            return formatValue(value);
          }),
        );
      }
    }
  }
  return {
    name,
    headers,
    rows,
    previewRows,
    rowNumbers,
    date1904,
    warnings,
    mapping: {},
  };
}
