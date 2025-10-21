# Guide d'utilisation du Widget d'Import Excel dans Grist

Ce guide vous explique comment configurer et utiliser le widget d'import Excel dans votre document Grist.

## Vue d'ensemble

Le widget d'import Excel permet d'importer des données depuis des fichiers Excel (.xlsx) vers vos tables Grist en appliquant des règles de gestion des doublons configurables. Il automatise le processus d'import en mappant intelligemment les colonnes Excel vers les colonnes Grist.

## Installation et configuration

### 1. Prérequis

- Un document Grist avec accès administrateur
- Le widget hébergé sur un serveur accessible (local ou distant)
- Un navigateur moderne supportant les modules ES6

### 2. Configuration du widget dans Grist

#### Étape 1 : Créer une vue avec widget personnalisé

1. **Ouvrir votre document Grist**
2. **Naviguer vers la table** où vous souhaitez importer les données
3. **Créer une nouvelle vue** :
   - Cliquer sur l'icône "+" à côté des vues existantes
   - Choisir "Widget personnalisé"
   - Nommer la vue (ex: "Import Excel")

#### Étape 2 : Configurer le widget

1. **Dans la vue widget personnalisé** :
   - **URL du widget** : `http://localhost:8000` (développement local) ou l'URL de votre hébergement
   - **Accès requis** : Sélectionner **"Entier"** (full access)
   - Cliquer sur "Créer"

#### Étape 3 : Autoriser l'accès complet

**Important** : Le widget nécessite un accès complet au document pour :
- Lire les données de la table cible
- Créer et modifier la table `RULES_CONFIG`
- Appliquer les imports et mises à jour

### 3. Configuration de la table RULES_CONFIG

Le widget utilise une table spéciale `RULES_CONFIG` pour persister les paramètres d'importation.

#### Création automatique

La table `RULES_CONFIG` sera créée automatiquement lors du premier usage en mode admin. Elle contient :

| Colonne | Type | Description |
|---------|------|-------------|
| `col_name` | Text | Nom de la colonne dans la table cible |
| `rule` | Text | Règle d'import appliquée |
| `is_key` | Bool | Indique si cette colonne est la clé unique |

#### Création manuelle (optionnel)

Si vous préférez créer la table manuellement :

1. **Créer une nouvelle table** nommée `RULES_CONFIG`
2. **Ajouter les colonnes** :
   - `col_name` (Text)
   - `rule` (Text) 
   - `is_key` (Bool)
3. **Configurer les règles** (voir section suivante)

## Configuration des règles d'import

### Types de règles disponibles

Le système propose 6 types de règles configurables par colonne :

| Règle | Description | Cas d'usage |
|-------|-------------|-------------|
| `ignore` | Ne jamais modifier | Champs calculés ou validés manuellement |
| `overwrite` | Écraser systématiquement | Données de référence provenant d'Excel |
| `update_if_newer` | Mettre à jour si plus récent | Horodatages, dates de modification |
| `fill_if_empty` | Remplir uniquement si vide | Valeurs par défaut |
| `preserve_if_not_empty` | Ne modifier que si vide | Alias pour `fill_if_empty` |
| `append_if_different` | Ajouter si différent | Champs de commentaires, historique |

### Configuration des règles

#### Via l'interface du widget (recommandé)

1. **Ouvrir le widget** dans la vue créée
2. **Sélectionner le mode "Admin"** dans le sélecteur de mode
3. **Configurer les règles** pour chaque colonne :
   - Choisir la règle appropriée dans le menu déroulant
   - Marquer une colonne comme clé unique (une seule possible)
4. **Sauvegarder** les règles

#### Via la table RULES_CONFIG directement

1. **Ouvrir la table RULES_CONFIG**
2. **Ajouter une ligne** pour chaque colonne à configurer :
   - `col_name` : Nom exact de la colonne dans votre table cible
   - `rule` : Règle à appliquer (voir tableau ci-dessus)
   - `is_key` : `true` pour la colonne clé unique, `false` pour les autres

### Exemple de configuration

Supposons une table "Employés" avec les colonnes :
- `Nom` (clé unique)
- `Prénom`
- `Email`
- `Date_embauche`
- `Salaire`

Configuration dans `RULES_CONFIG` :

| col_name | rule | is_key |
|----------|------|--------|
| Nom | overwrite | true |
| Prénom | overwrite | false |
| Email | update_if_newer | false |
| Date_embauche | fill_if_empty | false |
| Salaire | ignore | false |

## Utilisation du widget

### Modes d'utilisation

Le widget propose trois modes selon vos besoins :

#### Mode Public (Utilisateur final)
- Interface simplifiée pour l'import quotidien
- Upload de fichier Excel
- Lancement de l'import avec les règles pré-configurées
- Visualisation du résumé d'import

#### Mode Admin (Configuration)
- Gestion des règles par colonne
- Configuration de la clé unique
- Sauvegarde des paramètres dans Grist

#### Mode Dev (Développement)
- Prévisualisation des données Excel
- Inspection du mapping des colonnes
- Logs détaillés des opérations

### Processus d'import

#### 1. Préparation du fichier Excel

- **Format** : Fichier .xlsx uniquement
- **Structure** : Première feuille utilisée automatiquement
- **En-têtes** : Première ligne doit contenir les noms des colonnes
- **Données** : À partir de la deuxième ligne

#### 2. Import des données

1. **Sélectionner le mode** approprié dans le widget
2. **Charger le fichier Excel** via le bouton "Charger un fichier Excel"
3. **Faire correspondre les colonnes** (automatique) :
   - Cliquer sur "Faire correspondre les colonnes Excel ↔ Grist"
   - Vérifier les correspondances proposées
4. **Lancer l'import** :
   - Cliquer sur "Lancer l'import"
   - Attendre le traitement
   - Consulter le résumé détaillé

#### 3. Résultat de l'import

Le widget affiche un résumé ligne par ligne :
- **Nouvelles lignes** : Ajoutées à la table
- **Mises à jour** : Lignes existantes modifiées selon les règles
- **Ignorées** : Aucun changement nécessaire
- **Rejetées** : Clé unique vide ou erreur

## Gestion des clés uniques

### Configuration

- **Une seule colonne** peut être définie comme clé unique
- **Configurée** via la colonne `is_key` dans `RULES_CONFIG`
- **Changeable** dynamiquement en mode admin

### Comportement

- **Lignes avec clé vide** : Ignorées automatiquement
- **Clé existante** : Application des règles de duplication
- **Nouvelle clé** : Création d'un nouveau record

## Résolution des problèmes

### Problèmes courants

#### Widget ne se charge pas
- Vérifier que l'URL est accessible
- S'assurer que l'accès est défini sur "Entier"
- Vérifier la console du navigateur pour les erreurs

#### Erreur "Aucune clé unique définie"
- Configurer une colonne comme clé unique dans `RULES_CONFIG`
- Vérifier que `is_key = true` pour une colonne

#### Mapping incorrect des colonnes
- Vérifier les noms des colonnes dans Excel et Grist
- Utiliser le mode Dev pour inspecter le mapping
- Normaliser les noms (suppression accents, espaces)

#### Import échoue
- Vérifier les permissions du widget
- S'assurer que la table cible existe
- Consulter les logs détaillés en mode Dev

### Logs et débogage

Le widget inclut un système de logging complet :

```
Grist → Données reçues : [array of records]
Types de colonnes (déduits) : {column: type}
Mapping détecté : {excelCol: gristCol}
Règles actuelles : {column: rule}
Import vers Grist lancé
Résumé de l'import : [detailed line-by-line summary]
```

## Bonnes pratiques

### Préparation des données Excel

- **Noms de colonnes clairs** : Éviter les caractères spéciaux
- **Format cohérent** : Dates au format standard
- **Pas de lignes vides** : Supprimer les lignes vides
- **En-têtes uniques** : Éviter les doublons de noms de colonnes

### Configuration des règles

- **Clé unique stable** : Choisir une colonne qui ne change jamais
- **Règles cohérentes** : Adapter les règles au type de données
- **Tests préalables** : Tester avec un petit échantillon

### Sécurité

- **Accès contrôlé** : Limiter l'accès au widget aux utilisateurs autorisés
- **Sauvegarde** : Effectuer des sauvegardes avant les gros imports
- **Validation** : Vérifier les résultats après import

## Workflow recommandé

### Configuration initiale

1. **Créer la vue widget** dans votre table cible
2. **Configurer les règles** en mode Admin
3. **Tester** avec un petit fichier Excel
4. **Ajuster** les règles si nécessaire

### Import régulier

1. **Préparer** le fichier Excel selon les bonnes pratiques
2. **Ouvrir** le widget en mode Public
3. **Charger** le fichier Excel
4. **Vérifier** le mapping automatique
5. **Lancer** l'import
6. **Consulter** le résumé pour validation

### Maintenance

1. **Réviser** les règles périodiquement
2. **Mettre à jour** la clé unique si nécessaire
3. **Archiver** les fichiers Excel importés
4. **Documenter** les changements de configuration

---

**Widget open source pour la communauté Grist**

Pour plus d'informations techniques, consultez la [documentation complète](README.md).
