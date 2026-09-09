import test from "node:test";
import assert from "node:assert/strict";
import { parseDate } from "../public/src/services/dateService.js";
const epoch = (text) => Date.parse(text + "T00:00:00Z") / 1000;
for (const value of [
  "10/12/2025",
  "2025-12-10",
  "10.12.2025",
  "10-12-2025",
  46001,
  new Date("2025-12-10T00:00:00Z"),
]) {
  test(`Date sans ambiguïté : ${value}`, () =>
    assert.equal(parseDate(value), epoch("2025-12-10")));
}
test("Le 01/02 est le 1er février, indépendamment de la langue du navigateur", () =>
  assert.equal(parseDate("1/2/2025"), epoch("2025-02-01")));
test("Système 1904, y compris numéro zéro", () => {
  assert.equal(parseDate(0, { date1904: true }), epoch("1904-01-01"));
  assert.equal(parseDate(44539, { date1904: true }), epoch("2025-12-10"));
});
test("Calendrier 1900 avant/après le faux jour bissextile", () => {
  assert.equal(parseDate(1), epoch("1900-01-01"));
  assert.equal(parseDate(59), epoch("1900-02-28"));
  assert.equal(parseDate(61), epoch("1900-03-01"));
});
for (const value of [
  "31/02/2025",
  "29/02/2025",
  "2025-13-01",
  "2025-00-02",
  "00/12/2025",
  "1/1/25",
  "2025-02-30",
  "garbage",
  true,
  NaN,
  Infinity,
  0,
  -1,
  60,
  60.5,
  2958466,
  new Date(NaN),
]) {
  test(`Rejet explicite : ${value}`, () =>
    assert.throws(() => parseDate(value)));
}
test("Bissextile et limites de calendrier", () => {
  assert.equal(parseDate("29/02/2024"), epoch("2024-02-29"));
  assert.equal(parseDate("0001-01-01"), epoch("0001-01-01"));
  assert.equal(parseDate(2958465), epoch("9999-12-31"));
});
test("Cellules vides ne deviennent pas 1970", () => {
  for (const v of [null, undefined, "", " "]) assert.equal(parseDate(v), null);
});
test("Date à 1970 conserve le timestamp zéro", () =>
  assert.equal(parseDate("01/01/1970"), 0));
test("Date ignore la fraction horaire Excel", () =>
  assert.equal(parseDate(46001.75), epoch("2025-12-10")));
test("DateTime conserve heure, fuseau et fraction Excel", () => {
  assert.equal(
    parseDate(46001.5, { dateTime: true }),
    epoch("2025-12-10") + 43200,
  );
  assert.equal(
    parseDate("2025-12-10 12:00", { dateTime: true, timeZone: "Europe/Paris" }),
    epoch("2025-12-10") + 39600,
  );
  assert.equal(
    parseDate("2025-07-10 12:00", { dateTime: true, timeZone: "Europe/Paris" }),
    epoch("2025-07-10") + 36000,
  );
  assert.equal(
    parseDate("2025-12-10T12:00:00+02:00", { dateTime: true }),
    epoch("2025-12-10") + 36000,
  );
});
test("DateTime rejette les heures impossibles et exige un fuseau explicite aux changements d’heure", () => {
  for (const v of [
    "2025-03-30 02:30",
    "2025-10-26 02:30",
    "2025-01-01 24:00",
    "2025-01-01 12:60",
  ])
    assert.throws(() =>
      parseDate(v, { dateTime: true, timeZone: "Europe/Paris" }),
    );
  assert.equal(
    parseDate("2025-10-26T02:30:00+02:00", {
      dateTime: true,
      timeZone: "Europe/Paris",
    }),
    Date.parse("2025-10-26T00:30:00Z") / 1000,
  );
});
