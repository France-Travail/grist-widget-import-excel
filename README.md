# Import Excel pour Grist

Widget open source pour importer et mettre à jour une table Grist depuis Excel.
Les fichiers sont lus dans le navigateur ; seules les modifications validées sont
transmises au document Grist. Aucun service d’IA ni serveur de traitement de fichiers.

## Utilisation

1. Ajouter un widget personnalisé dans Grist, le relier à la table cible et lui
   accorder **l’accès complet**.
2. Charger un fichier `.xlsx`, `.xls` ou `.xlsm`, sélectionner les feuilles et la
   ligne d’en-tête de chacune.
3. Vérifier les correspondances et choisir les colonnes clés ainsi que les règles.
4. Cliquer sur **Vérifier l’import**. Corriger les erreurs, examiner les valeurs
   avant/après, puis cliquer sur **Importer les changements**.

L’URL de publication est `https://france-travail.github.io/grist-widget-import-excel/`.
Le code présent dans ce dépôt peut être plus récent que la version publiée : le numéro
et l’empreinte affichés dans le widget permettent de les distinguer.

## Fonctionnalités

- Métadonnées Grist réelles, y compris pour une table vide ; formules protégées.
- Dates françaises, ISO et numéros Excel (calendriers 1900 et 1904), dates avec heure
  et fuseau Grist. Les dates impossibles sont signalées avant l’écriture.
- Identifiants texte conservés, y compris les zéros d’un format Excel `000000`.
- Correspondance par identifiant ou libellé de colonne, correction manuelle.
- Plusieurs feuilles vers une même table, clés composites ou clés de secours.
- Détection des doublons et des références ambiguës ; aucun choix arbitraire de ligne.
- Simulation, rapport CSV, écriture en une transaction et annulation du dernier
  import de la session si les lignes concernées n’ont pas changé.
- Ancienne table `RULES_CONFIG` reconnue sans migration automatique au chargement.
- Interface responsive, navigation clavier et adaptation au thème système.
- Ressources servies localement avec le widget, versions identifiées par leur contenu.

## Développement

Node.js 22 ou plus récent. Le serveur et les tests unitaires utilisent les modules intégrés à Node ; les deux
bibliothèques navigateur sont dans `public/vendor/`. Playwright est une dépendance
de développement réservée aux tests d’interface.

```sh
npm ci
npm test
npm start
```

Le serveur écoute sur `http://localhost:8003`. `PORT=8005 npm start` change le port.
Après une modification, `npm run build` reconstruit les ressources ; recharger ensuite
le widget. Le serveur sert `dist/` sans cache et peut rester lancé pendant les builds.

```sh
npm run check   # tests + build de publication
npx playwright install chromium
npm run test:browser   # interface avec API simulée et données fictives
```

Les tests fabriquent leurs propres données, y compris de vrais classeurs Excel.
Ne pas ajouter de documents métier, captures, traces réseau ou identifiants de session
au dépôt. Les tests sur un document distant doivent utiliser une copie autorisée et
des lignes fictives, puis nettoyer les tables temporaires.

## Structure

```text
public/
  bootstrap.js                # chargement de version et détection des mises à jour
  src/app.js                  # état de session et interactions
  src/services/
    excelService.js           # lecture du classeur et des feuilles
    dateService.js            # conversion stricte dates / fuseaux
    importEngine.js           # préparation pure et règles d’import
    gristService.js            # métadonnées, transactions et annulation
    uiService.js              # rendu et export du rapport
  styles/style.css
  vendor/                     # distributions tierces, licences et empreintes
scripts/                      # build reproductible et serveur local
tests/                        # régressions, classeurs et API simulée
docs/README.md                # règles, limites et essais d’intégration
```

Voir [le guide](docs/README.md) et [le déploiement](DEPLOYMENT.md).
Licence MIT pour le widget ; licences tierces dans `public/vendor/`.
