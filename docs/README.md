# Guide d’import

## Dates et identifiants

Le type de destination vient des métadonnées Grist, jamais du nom de colonne ni de
la première ligne de données. Ainsi, une colonne Date dont la première cellule est
vide est traitée exactement comme une colonne Date renseignée.

Les cellules Excel sont lues avec leur valeur brute. Un nombre Excel tel que `46001`
représente le **10 décembre 2025**, mais n’est pas un timestamp Grist. Le moteur le
convertit une seule fois en secondes depuis l’époque Unix. Les valeurs déjà présentes
dans Grist sont comparées directement, sans les interpréter comme des numéros Excel.

Formats acceptés : `10/12/2025`, `10.12.2025`, `10-12-2025`, `2025-12-10`, jours/mois
sur un ou deux chiffres et numéros Excel. Les années sur deux chiffres sont refusées.
Le calendrier 1904 du classeur est pris en compte ; le faux `29/02/1900` d’Excel est
refusé. Une colonne Date ignore l’heure. Une colonne DateTime utilise son fuseau Grist ;
les heures inexistantes ou ambiguës aux changements d’heure exigent un décalage UTC
explicite, par exemple `2025-10-26T02:30:00+02:00`.

Un identifiant doit être stocké en **Texte** dans Grist pour conserver ses zéros.
Le widget préserve les zéros présents dans le texte Excel ou dans un format tel que
`000000`. Il ne peut pas retrouver des zéros déjà perdus dans le fichier source.

Références techniques : [format des valeurs Grist](https://support.getgrist.com/code/modules/grist_plugin_api/)
et [dates dans SheetJS](https://docs.sheetjs.com/docs/csf/features/dates/).

## Règles

| Règle | Ligne existante | Nouvelle ligne |
|---|---|---|
| `ignore` | Conserve Grist | Importe la valeur, comme dans le widget historique |
| `overwrite` | Remplace si Excel est renseigné | Importe la valeur |
| `fill_if_empty` | Complète si Grist est vide | Importe la valeur |
| `update_if_newer` | Garde la date la plus récente | Importe la date |
| `append_if_different` | Ajoute au texte ou à la liste sans répéter | Importe la valeur |
| `match` | Identification seulement | Importe la valeur configurée |

Les règles décrivent le traitement des lignes existantes. À la création, les champs
explicitement configurés et associés sont renseignés, y compris avec `ignore` ou
`match`, conformément au comportement historique. Les colonnes calculées restent
protégées. Les clés sont toujours renseignées à la création.
Elles ne sont jamais modifiées sur une ligne existante. Une cellule Excel vide
n’efface pas une valeur Grist. Si `fill_if_empty` ou `update_if_newer` conserve une
valeur différente d’Excel, le diagnostic explique la règle appliquée. Une date
anciennement importée avec une mauvaise valeur n’est donc pas réparée par
`fill_if_empty` : choisir explicitement `overwrite` pour la corriger. Les booléens `false` et les nombres `0` ne sont pas vides.
Pour un booléen, utiliser `overwrite` pour répercuter aussi les changements vrai → faux.
La règle `update_if_newer` n’est pas une règle de comparaison de lignes complètes :
elle ne concerne que la date de la colonne sur laquelle elle est définie.

Les listes Excel utilisent le séparateur `;`. Les références cherchent une valeur
exacte dans la colonne visible de la référence ; une valeur absente ou ambiguë bloque
l’import. Sans colonne visible, un identifiant de ligne numérique existant est requis.
Aucune référence n’est créée automatiquement. Les pièces jointes ne sont pas importées.

## Reconnaître les lignes

**Clé complète** : toutes les colonnes clés doivent être présentes et non vides.
L’ensemble de leurs valeurs identifie une ligne. Les valeurs sont sensibles à la casse ;
les espaces extérieurs des clés texte sont ignorés, les zéros sont conservés.

**Clés de secours** : une clé renseignée peut suffire, mais les clés présentes doivent
désigner la même ligne. Une clé qui contredit un identifiant existant bloque la ligne.
Une clé absente d’une ligne existante n’est pas renseignée automatiquement.

Les doublons du fichier et entre feuilles peuvent être résolus dans l’aperçu : choix
explicite d’une ligne, date la plus récente sans égalité, ou exclusion du groupe.
Les exclusions sont détaillées dans le rapport ; aucun choix n’est automatique.

Les doublons à l’intérieur d’un fichier, entre les feuilles sélectionnées, ou parmi
les lignes Grist correspondantes sont signalés. Le widget examine toute la table
accessible, indépendamment des filtres visuels du widget. Les permissions Grist restent
applicables ; une vue partielle imposée par les permissions ne permet pas de garantir
l’unicité dans les lignes auxquelles l’utilisateur n’a pas accès.

## Configuration existante

`RULES_CONFIG` reste compatible avec les colonnes historiques : `col_name`, `rule`,
`is_key`. `key_mode` et `key_priority` sont facultatifs. Le texte `false` ne compte pas
comme une clé. Des règles dupliquées ou contradictoires doivent être corrigées.

La configuration est chargée lors de la connexion ou via **Actualiser la table**.
Changer une règle dans le widget n’affecte que la session. Le bouton **Enregistrer
les règles dans Grist** écrit explicitement la configuration et ajoute les colonnes
facultatives manquantes. Si la table n’existe pas, il la crée. Le chargement du widget
ne crée, ne migre et ne supprime aucune table. `RULES_CONFIG` est partagé par le document ;
utiliser une configuration cohérente lorsque plusieurs widgets l’emploient.

## Vérification, écriture et annulation

La vérification est sans écriture. Une seule erreur bloque l’ensemble de l’import.
L’aperçu montre les 50 premières lignes modifiées et le rapport CSV contient les
statuts de toutes les lignes ainsi que toutes les erreurs, sans recopier les valeurs
métier. Les noms de feuille/colonne provenant du fichier restent présents dans ce rapport.

Avant d’écrire, le widget relit la table, son schéma et les références pour vérifier
que l’aperçu est toujours d’actualité. Une seule transaction Grist applique les actions.
Si une action est refusée, Grist annule cette transaction. Une double activation du
bouton est bloquée pendant l’opération.

L’annulation locale concerne le dernier import réussi de la session, sur la table
correspondante. Elle refuse d’écraser des modifications ultérieures détectées sur les
lignes concernées. Un rechargement, une fermeture ou un changement de table perd cette
possibilité ; utiliser alors l’historique natif Grist.

Ces vérifications sont **optimistes** : l’API du widget ne fournit pas de verrou couvrant
la lecture et l’écriture. Une modification concurrente dans cet intervalle reste
possible. Sur un document activement modifié par plusieurs personnes, coordonner les
imports et consulter l’historique Grist en cas de conflit. Les modifications déclenchées
par des automatismes externes au document ne sont pas annulées par le widget.

Limites de lecture : 30 Mo par fichier, 100 000 lignes par import, 500 colonnes et 2 millions de cellules par feuille.
Les classeurs chiffrés, les erreurs Excel et les formules dépourvues de résultat mis en
cache sont refusés. L’import utilise les résultats enregistrés des formules, sans les
recalculer. Le temps de lecture dépend de la taille décompressée du classeur et du navigateur.

## Vérification avant publication

`npm run check` couvre les formats de dates, les calendriers, les changements d’heure,
les règles, les doublons, les références, les classeurs réels générés en mémoire,
les transactions simulées, l’annulation et le build.

Pour compléter sur une copie de document autorisée :

1. Ajouter des tables temporaires avec des colonnes Texte, Date, DateTime, Booléen,
   Entier, Liste de choix et Référence, exclusivement avec des valeurs fictives.
2. Vérifier un fichier, importer, relire les types et valeurs via Grist, réimporter
   le même fichier : aucun changement ne doit être proposé.
3. Annuler des ajouts puis des mises à jour ; vérifier les valeurs d’origine.
4. Modifier une ligne entre aperçu et import, puis entre import et annulation :
   ces opérations doivent être bloquées avec un message explicite.
5. Vérifier les correspondances manuelles, les règles incompatibles, une feuille
   vide, les en-têtes décalés et les doublons entre feuilles.
6. Supprimer les tables et lignes temporaires, sans sauvegarder de données métier
   dans le dépôt. Les actions de test restent dans l’historique de la copie Grist.

Le SDK Grist vendored est la distribution officielle ; voir les détails et licences
[dans vendor](../public/vendor/README.md).
