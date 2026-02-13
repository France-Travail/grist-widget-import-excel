# Mode operatoire d'import de donnees dans GRIST via le plugin

## Mode Proprietaire / Administrateur

---

## 1. Ajouter le plugin au document

Pour ajouter le plugin a votre document, vous devez faire les etapes suivantes :

### Etape 1 - Ajouter une vue personnalisee

a) Cliquer sur **Nouveau**
b) **Ajouter une page ou une vue**
c) Choisir la **Vue personnalisee**
d) Choisir la table qui devra etre mise a jour
e) Cliquer sur **Ajouter**

### Etape 2 - Configurer l'URL du widget

f) Entrer l'URL indiquee :

```
https://france-travail.github.io/grist-widget-import-excel/
```

g) Cliquer sur **Ajouter un widget**

### Etape 3 - Autoriser l'acces

h) Cocher la case d'accord
i) Cliquer sur **Confirmer**

> **Important :** Le plugin necessite l'acces complet au document pour fonctionner correctement (lecture et ecriture des donnees).

---

## 2. Creer la table de configuration (RULES_CONFIG)

Pour fonctionner, les regles d'import doivent etre stockees dans une table **RULES_CONFIG**. Deux methodes sont possibles :

### Methode A : Creation automatique (Recommandee) *(Nouveau)*

Si la table RULES_CONFIG n'existe pas dans votre document, le plugin peut la creer automatiquement :

- Le plugin detecte l'absence de la table RULES_CONFIG au chargement
- Il genere automatiquement la table avec toutes les colonnes necessaires (col_name, action, is_key, key_priority, key_mode)
- La premiere colonne de votre table est definie comme cle unique par defaut
- **Aucune manipulation manuelle n'est necessaire**

> **Avantage :** Cette methode evite les etapes de telechargement, import et nettoyage du template.

### Methode B : Template manuel

Si la creation automatique echoue ou si vous preferez controler la structure :

**Etape 4** - Verifier les colonnes visibles

j) Verifier que toutes les colonnes que vous allez utiliser soient visibles dans la table

> Pensez a verifier les colonnes cachees dans le panneau lateral droit de Grist (section "Colonnes visibles" / "Colonnes cachees").

**Etape 5** - Telecharger le modele

k) Cliquer sur **Telecharger le modele RULES_CONFIG**
l) Cliquer sur **OK** pour confirmer

Le fichier **RULES_CONFIG.xlsx** est telecharge. Il contient la liste de toutes les colonnes visibles de votre table.

**Etape 6** - Importer le fichier de configuration dans Grist

m) Cliquer sur **Nouveau** puis **Importer depuis un fichier**
n) Selectionner le fichier **RULES_CONFIG.xlsx** telecharge et cliquer sur **Ouvrir**

**Etape 7** - Creer la table

o) Importer le fichier dans une **Nouvelle table**
p) Cliquer sur **Importer**

**Etape 8** - Nettoyer la vue

q) Cliquer sur les **3 points** de la page RULES_CONFIG creee
r) Choisir **Supprimer**
s) Cocher **Conserver les donnees et supprimer la page**
t) Cliquer sur **Supprimer**

> **Important :** Supprimer uniquement la page et la vue. Cochez bien "Conserver les donnees" pour garder la table de configuration.

---

## 3. Acceder au mode administration

L'acces au mode administration se fait via **l'icone engrenage** du widget dans le panneau lateral de Grist.

> **Note :** Seuls les editeurs du document ont acces a l'engrenage. Le selecteur de mode "Utilisateur / Administration" n'est plus visible en mode normal.

- Cliquer sur l'**engrenage** du widget (panneau lateral droit)
- Le mode administration s'affiche directement avec un bandeau explicatif et les sections de configuration

Pour quitter le mode administration, cliquer sur le bouton **"Retour a l'import"** en haut de la page.

---

## 4. Configurer les regles d'import

### Section "Configuration des regles d'import"

Pour chaque colonne de votre table, choisissez le comportement lors de l'import :

| Regle | Description | Usage |
|-------|------------|-------|
| **Ne jamais modifier** | La valeur Grist est toujours conservee, meme si differente d'Excel | Champs calcules ou valides manuellement |
| **Ecraser systematiquement** | La valeur Excel remplace celle de Grist a chaque import | Donnees de reference provenant d'Excel |
| **Mettre a jour si plus recent** | La valeur Excel remplace celle de Grist uniquement si plus recente | Champs de type Date (horodatages, dates de modification) |
| **Remplir uniquement si vide** | La valeur Excel est utilisee uniquement si la cellule Grist est vide | Valeurs par defaut, completion automatique |
| **Ajouter si different** | La valeur Excel est ajoutee a la suite si differente | Champs de type Choix/Liste (commentaires, historique, tags) |

### Colonnes formule *(Nouveau)*

Les colonnes calculees (formules Grist) sont **automatiquement detectees** et exclues de l'import :
- Elles apparaissent avec la mention **(formule)** dans l'interface
- Leur selecteur de regle est **desactive**
- Elles sont toujours en mode "Ne jamais modifier"

> **Note :** Les modifications de regles sont enregistrees **instantanement**. Aucun bouton de sauvegarde n'est necessaire.

---

## 5. Configurer les cles uniques pour les doublons

### Section "Cle(s) unique(s) pour les doublons"

Cochez une ou plusieurs colonnes pour identifier les doublons lors de l'import. La cle unique permet de determiner si une ligne Excel correspond a une ligne existante dans Grist (mise a jour) ou s'il s'agit d'une nouvelle ligne (ajout).

### Mode Composite *(Nouveau)*

- Toutes les cles cochees sont **combinees** pour former un identifiant unique
- Exemple : Si "Nom" + "Prenom" sont cles, la combinaison "Dupont + Jean" identifie une ligne unique
- **Utilisation :** Quand aucune colonne seule ne suffit a identifier une ligne

### Mode Fallback *(Nouveau)*

- Les cles sont utilisees par **ordre de priorite** (badges numerotes)
- Si la cle 1 est vide, le plugin utilise la cle 2, etc.
- Exemple : Cle 1 = "Email", Cle 2 = "Telephone". Si l'email est vide pour une ligne, le telephone est utilise
- **Utilisation :** Quand les donnees sources sont heterogenes et certaines colonnes peuvent etre vides

### Selectionner le mode

v) Choisir entre **Composite** et **Fallback** via les boutons radio
w) Cocher les colonnes servant de cle unique

> **Note :** Les colonnes formule ne peuvent pas etre selectionnees comme cle unique.

---

## 6. Table IMPORT_LOG *(Nouveau)*

Le plugin cree automatiquement une table **IMPORT_LOG** qui enregistre l'historique de tous les imports :

| Colonne | Description |
|---------|------------|
| timestamp | Date et heure de l'import (format ISO) |
| file_name | Nom du fichier importe |
| sheet_name | Nom de l'onglet importe |
| rows_added | Nombre de lignes ajoutees |
| rows_updated | Nombre de lignes mises a jour |
| rows_skipped | Nombre de lignes ignorees |
| rows_errors | Nombre de lignes en erreur |
| dry_run | True si simulation, False si import reel |
| rolled_back | True si l'import a ete annule |
| session_id | Identifiant de session (pour le rollback) |

> Cette table est creee automatiquement au premier import. Aucune action manuelle n'est necessaire.

---

## Resume du flux administrateur

```
1. Ajouter le widget (vue personnalisee + URL)
2. Autoriser l'acces complet
3. La table RULES_CONFIG se cree automatiquement (ou via template manuel)
4. Ouvrir le mode admin via l'engrenage du widget
5. Configurer les regles d'import pour chaque colonne (sauvegarde automatique)
6. Configurer les cles uniques (composite ou fallback)
7. Revenir en mode utilisateur via "Retour a l'import"
```

Revenez maintenant en mode utilisateur via le bouton **"Retour a l'import"** et au besoin, transmettez le guide utilisateur a vos equipes.
