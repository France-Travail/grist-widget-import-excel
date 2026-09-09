# Validation de la reprise v2

## Historique retrouvé

La base `main` était au commit `faf3ad2`. L’historique GitHub Actions montre que
`ad22cd3`, puis `1ac9ca0`, avaient été déployés depuis `main` le 13 février 2026, avant
un retour à `faf3ad2` quelques minutes plus tard. Le HTML public correspond exactement
à ce dernier commit. La branche `feat/rollback-fallback-keys` conserve l’évolution
antérieure au retour arrière. La reprise conserve les fonctionnalités utiles de cette piste (plusieurs feuilles,
clés de secours, aperçu et annulation) dans un moteur testable séparé de l’interface.

## Régression reproduite

En exécutant l’ancien service avec une première cellule Date vide et un numéro Excel
`46001`, le type détecté était `Unknown` et l’action envoyait `46001` sans conversion.
Sur une table Grist de test, cette valeur brute devient un timestamp du 1er janvier 1970.
Le nouveau moteur envoie `1765324800`, soit le 10 décembre 2025 à minuit UTC.

Une chaîne ISO était, elle, convertie par l’instance Grist utilisée pour les essais.
L’erreur reproduite porte donc sur la détection de type et le numéro Excel laissé brut,
pas sur une incapacité générale de Grist à interpréter les chaînes ISO.

## Contrôles effectués

- **78 tests Node** : conversion des dates, calendriers 1900/1904, fuseaux et changements
  d’heure, identifiants, règles, doublons, références, lecture de vrais classeurs générés,
  transactions et annulations avec API simulée, empreintes des dépendances, build.
- **11 tests navigateur** : simulation sans écriture, import et réimport, double clic,
  annulation, erreurs avec numéros de ligne, correspondances manuelles, règles
  incompatibles, plusieurs feuilles, en-tête décalé, rendu HTML sûr, largeur mobile,
  enregistrement explicite des règles, aperçu périmé, notification de mise à jour et
  chargement de nouvelles ressources à la même URL, mise à jour d’une ligne existante
  après association manuelle d’un en-tête différent, noms de champs lisibles, valeurs
  Oui/Non et distinction entre aperçu et import enregistré.
- **Essais sur une copie Grist autorisée** : lecture du schéma réel et simulation ;
  dans deux tables temporaires entièrement fictives, ajout de dates, DateTime,
  booléens, nombres, listes et références, réimport sans changement, annulation des
  créations, restauration après mise à jour, conflits avant import et annulation.
  Les tables temporaires ont été supprimées après les essais.
- Revue visuelle en largeur bureau et mobile ; fichiers de capture conservés hors dépôt.

Les résultats de la copie Grist ne sont pas des tests automatiques de la CI.
Aucune donnée métier, URL de document privé, capture, cookie ou transcription n’est
nécessaire pour relancer les tests versionnés.

## Mise à jour partielle de dossiers existants

Les régressions couvrent aussi un fichier dont l’en-tête identifiant diffère du
libellé Grist, une première cellule Date Grist vide et un numéro Excel brut. Sans
association de la clé, le diagnostic demande de relier la colonne ; après association,
le test vérifie une modification de la ligne existante, aucun ajout et la conservation
des champs absents du fichier.

Une cellule clé vide donne un diagnostic distinct d’une colonne non associée.
Si une règle conserve une ancienne valeur différente d’Excel, l’aperçu le signale.
En particulier, `fill_if_empty` ne répare pas une ancienne date erronée déjà renseignée :
une correction explicite via `overwrite` est nécessaire. Le message de fin de
simulation ne prétend plus que des données conservées par une règle sont identiques.

## Points à connaître avant publication

- Le premier passage depuis une ancienne page en cache peut encore exiger un
  rechargement forcé ; les versions suivantes utilisent le manifeste et des URL de
  ressources identifiées par contenu. Voir [DEPLOYMENT.md](../DEPLOYMENT.md).
- Les vérifications de concurrence sont optimistes, sans verrou entre lecture et
  écriture ; l’historique Grist reste nécessaire pour les situations plus complexes.
- Le comportement historique de `ignore` à la création est conservé : il protège
  les valeurs existantes, mais renseigne les nouvelles lignes. Un test couvre aussi
  les références avec cette règle. Le chargement de l’ancienne configuration est testé
  sans écriture, et sa sauvegarde explicite préserve les lignes existantes.
- Il n’y a pas de migration automatique de `RULES_CONFIG` au chargement ni de journal
  contenant les données importées dans une table supplémentaire.
