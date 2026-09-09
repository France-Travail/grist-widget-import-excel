export const normalizeName = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
export const cleanLabel = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
export const isEmpty = (value) =>
  value == null || (typeof value === "string" && !value.trim());
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function tableRecords(data) {
  return (data.id ?? []).map((id, i) =>
    Object.fromEntries([
      ["id", id],
      ...Object.entries(data)
        .filter(([key]) => key !== "id")
        .map(([key, values]) => [key, values[i]]),
    ]),
  );
}
