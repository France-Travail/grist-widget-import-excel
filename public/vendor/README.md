# Dépendances navigateur

Ces fichiers proviennent des distributions officielles et sont servis avec le widget,
pour éviter les dépendances à un CDN pendant l’utilisation dans Grist.

- `xlsx.full.min.js` : SheetJS CE **0.20.3**, distribution
  <https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js>.
  Licence Apache-2.0 dans `LICENSE-SheetJS.txt`.
- `grist-plugin-api.js` : SDK des widgets Grist, copie de
  <https://docs.getgrist.com/grist-plugin-api.js> récupérée le 2026-09-09.
  Licence Apache-2.0 dans `LICENSE-Grist.txt`.
  La distribution officielle utilise le mode webpack `eval` ; le widget reprend
  ce fichier sans modification. Une politique CSP qui interdit `eval` le bloque.

Les empreintes SHA-256 sont dans `checksums.json` et vérifiées par les tests.
Toute mise à jour est explicite : remplacer la distribution, vérifier sa licence,
mettre à jour l’empreinte et exécuter la suite de tests avant de publier.
