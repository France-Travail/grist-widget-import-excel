# Mode operatoire d'import de donnees dans GRIST via le plugin

## Mode Utilisateur

---

## Prerequis

### Verifier les autorisations

Dans la vue de l'import, verifier que le niveau d'acces soit **Acces complet au document**.

Si vous voyez le message "Le widget a besoin de **full access** a ce document" :
- Cliquer sur **Accepter**

> **Important :** Sans acces complet, le plugin ne pourra pas lire ni ecrire dans vos tables Grist.

### Utiliser les bons modeles d'import

Vos donnees exportees doivent respecter le format attendu :

- L'import se base sur les **en-tetes** des colonnes pour appliquer les regles mises en place
- L'import se base sur la ou les colonnes definies comme **cle unique** pour detecter les doublons
- Les formats de fichier acceptes sont : **.xlsx**, **.xls** et **.csv**
- Vos en-tetes doivent correspondre aux noms des colonnes Grist (la correspondance est insensible a la casse et aux accents)

---

## Realiser l'import

### Etape 1 - Selectionner le fichier

a) Cliquer sur **Choisir un fichier** dans la zone de selection
b) Selectionner votre fichier Excel (.xlsx, .xls) ou CSV (.csv)
c) Le nom du fichier s'affiche sur la bande verte une fois pris en compte

> Formats acceptes : .xlsx, .xls, .csv

### Etape 2 - Selectionner les onglets *(Nouveau)*

Si votre fichier Excel contient **plusieurs onglets**, un selecteur apparait automatiquement :

d) Le nombre d'onglets detectes est affiche (ex: "3 onglets detectes")
e) Tous les onglets sont **coches par defaut**
f) Decocher les onglets que vous ne souhaitez pas importer
g) Utiliser les boutons **Tout selectionner** / **Tout deselectionner** pour aller plus vite

> **Note :** Si votre fichier ne contient qu'un seul onglet, cette etape est automatiquement ignoree. L'import traitera chaque onglet selectionne de maniere sequentielle.

### Etape 3 - Verifier les correspondances de colonnes

h) Cliquer sur le bouton **Faire correspondre les colonnes**

Le plugin affiche les correspondances detectees automatiquement :
- **Colonnes matchees :** "NomExcel" -> NomGrist
- **Colonnes non matchees :** "NomExcel" -> Aucun match

Les noms en **gras** sont les champs de votre fichier. Les noms plus clairs sont ceux en correspondance dans la base Grist.

Si "Aucun match" apparait, cela signifie que les en-tetes de votre fichier ne correspondent pas aux colonnes Grist. Verifiez l'orthographe de vos en-tetes.

### Rapport de validation *(Nouveau)*

Apres le matching, un rapport de validation s'affiche automatiquement :

- **Erreurs bloquantes** (en rouge) : empechent l'import (ex: fichier vide, aucune correspondance)
- **Avertissements** (en orange) : n'empechent pas l'import mais signalent des points d'attention (ex: colonnes formule exclues, formats non reconnus)
- **Validation OK** : "Pret pour l'import" - tout est bon

### Etape 4 - Simuler l'import (optionnel) *(Nouveau)*

Avant de modifier vos donnees, vous pouvez tester l'import :

i) Cliquer sur **Simuler l'import**
j) Le plugin execute une simulation complete sans modifier aucune donnee
k) Le rapport affiche ce qui **serait** effectue :
   - Nombre de lignes qui seraient ajoutees
   - Nombre de lignes qui seraient mises a jour
   - Nombre de lignes qui seraient ignorees
   - Detail ligne par ligne (depliable)

> **Conseil :** Utilisez la simulation lors de vos premiers imports ou quand vous importez un nouveau fichier pour verifier que tout est correct.

### Etape 5 - Lancer l'import

l) Si les correspondances et la simulation sont satisfaisantes, cliquer sur **Lancer l'import**
m) Une **barre de progression** s'affiche en temps reel (ex: "45 / 1000 lignes (4%)")
n) A la fin, le recapitulatif affiche :
   - Nombre de lignes **ajoutees** (nouvelles dans Grist)
   - Nombre de lignes **mises a jour** (existantes, modifiees selon les regles)
   - Nombre de lignes **ignorees** (existantes sans modification necessaire)
   - Nombre de lignes **sans cle** (donnees presentes mais cle d'identification manquante)
   - Nombre de **lignes vides** en fin de fichier (exclues automatiquement)
   - Nombre d'**erreurs** (le cas echeant)
   - Detail ligne par ligne (depliable via "Details")

> **Note :** Les lignes vides en fin de fichier Excel sont automatiquement exclues du compteur "ignorees" pour plus de clarte. Seules les lignes contenant des donnees mais sans cle sont signalees separement.

> **Multi-onglets :** Si plusieurs onglets ont ete selectionnes, le recapitulatif combine les resultats de tous les onglets.

### Etape 6 - Annuler le dernier import (optionnel) *(Nouveau)*

Si vous constatez un probleme apres l'import, vous pouvez l'annuler :

o) Le bouton **Annuler le dernier import** apparait apres un import reussi
p) Cliquer sur le bouton
q) Confirmer l'annulation dans la boite de dialogue
r) Le plugin restaure les donnees :
   - Les lignes **ajoutees** sont supprimees
   - Les lignes **modifiees** sont restaurees a leur etat precedent

> **Important :**
> - Le rollback couvre **tous les onglets** importes dans la meme operation
> - Le rollback n'est disponible que pour le **dernier import** de la session en cours
> - Si vous **fermez** ou **rechargez** le widget, le rollback n'est plus possible
> - L'annulation est **irreversible** (pas de "re-rollback")

---

## Resume du flux utilisateur

```
1. Selectionner le fichier (.xlsx, .xls ou .csv)
2. Si multi-onglets : choisir les onglets a importer
3. Cliquer sur "Faire correspondre les colonnes"
4. Verifier le rapport de validation
5. (Optionnel) Cliquer sur "Simuler l'import" pour tester
6. Cliquer sur "Lancer l'import"
7. Consulter le recapitulatif
8. (Si besoin) Cliquer sur "Annuler le dernier import"
```

---

## Glossaire

| Terme | Definition |
|-------|-----------|
| **Correspondance (matching)** | Association automatique entre les en-tetes Excel et les colonnes Grist |
| **Cle unique** | Colonne(s) permettant d'identifier chaque ligne de maniere unique pour eviter les doublons |
| **Dry-run (simulation)** | Import de test qui n'ecrit aucune donnee, uniquement un rapport |
| **Rollback (annulation)** | Restauration des donnees a leur etat avant le dernier import |
| **Multi-onglets** | Import de plusieurs feuilles d'un meme fichier Excel en une seule operation |
