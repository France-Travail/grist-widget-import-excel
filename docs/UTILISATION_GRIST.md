# Installer et utiliser le widget dans Grist

1. Dans votre document Grist, ajouter un **widget personnalisé** et choisir la table
   à mettre à jour comme source de données.
2. Renseigner l’URL de votre hébergement, ou
   `https://france-travail.github.io/grist-widget-import-excel/` pour la version publiée.
   Pour le développement, lancer `npm start` puis utiliser `http://localhost:8003`.
3. Accorder au widget **l’accès complet**. Il doit lire les métadonnées et écrire les
   modifications validées ; les permissions de votre compte Grist restent applicables.
4. Vérifier que le nom de la table cible apparaît en haut du widget.
5. Charger un fichier Excel, sélectionner les feuilles et leur ligne d’en-tête.
6. Vérifier les correspondances. Les identifiants et libellés sont reconnus ; une
   correspondance manquante peut être sélectionnée manuellement.
7. Ouvrir **Identification des lignes et configuration** pour choisir les clés.
   Ajuster les règles des colonnes. **Enregistrer les règles dans Grist** est facultatif
   pour l’import courant et persiste la configuration partagée dans `RULES_CONFIG`.
8. Cliquer sur **Vérifier l’import**. Aucune donnée n’est écrite à ce stade. Les erreurs
   doivent être corrigées ; l’aperçu montre les valeurs avant et après.
9. Si des **Doublons du fichier** sont signalés, comparer les lignes du groupe et
   choisir une ligne complète, la ligne avec la date la plus récente, ou écarter le
   groupe. Le bouton commun applique le choix de date à tous les groupes ; les dates
   égales, vides ou invalides restent à traiter manuellement. Rien n’est écrit lors
   de ces choix : le widget recalcule l’aperçu.
10. Confirmer l’import, puis contrôler le résultat dans Grist. Le rapport indique
    les lignes écartées et la ligne retenue à leur place.

Les choix de doublons concernent uniquement cet import et sont réinitialisés lors
d’un changement de fichier, de correspondance, de règle ou de clé. Ils ne modifient
pas `RULES_CONFIG`. La ligne retenue est traitée selon les règles de mise à jour
habituelles ; le widget ne fusionne pas les champs de plusieurs lignes Excel.
Si plusieurs décisions doivent être conservées, utiliser une clé composée adaptée
(par exemple dossier et numéro de décision), en vérifiant son effet sur les lignes
existantes. Plusieurs lignes Grist pour une même clé restent une ambiguïté bloquante.

Pour remplacer des cases à cocher, choisir **Remplacer si renseigné**, pas **Garder la
date la plus récente**. Pour préserver les zéros d’un identifiant, sa colonne Grist
doit être de type Texte.

L’annulation du dernier import est disponible dans la même session, tant que les
lignes concernées n’ont pas changé. Après rechargement du widget, utiliser l’historique
Grist. Une nouvelle version est signalée par un bandeau ; le fichier courant et
l’annulation de session sont perdus lors d’un rechargement.

Voir [le guide détaillé](README.md) pour les règles, formats et limites, et
[le guide de publication](../DEPLOYMENT.md) pour le cache et les mises à jour.
