# 📥 Grist Import Widget

Un widget d'importation Excel → Grist intelligent avec gestion des règles de duplication et mapping automatique des colonnes.

## 🚀 Démarrage rapide

### 1. Lancer le serveur de développement
```bash
cd server
npm install
npm start
```

### 2. Intégrer dans Grist
- URL : `http://localhost:8000`
- Accès requis : "full"

## 📁 Structure du projet

```
grist-import-widget/
├── src/                     # Code source
│   ├── app.js              # Point d'entrée principal
│   ├── config.js           # Configuration des règles
│   └── services/           # Services métier
│       ├── gristService.js    # Communication Grist
│       ├── excelService.js    # Traitement Excel
│       ├── uiService.js       # Interface utilisateur  
│       ├── rulesService.js    # Gestion des règles
│       └── adminService.js    # Outils d'administration
├── public/                 # Interface utilisateur
│   ├── index.html         # Page principale
│   ├── styles/            # Styles CSS
│   └── assets/            # Ressources (images, etc.)
├── server/                # Serveur de développement
├── docs/                  # Documentation détaillée
└── tests/                 # Tests (futur)
```

## ✨ Fonctionnalités

- **📊 Import Excel** : Support des fichiers .xlsx
- **🔄 Mapping automatique** : Correspondance intelligente des colonnes
- **⚙️ Règles configurables** : 6 types de règles d'import par colonne
- **🔑 Gestion des doublons** : Détection via clé unique
- **🎮 Interface multi-mode** : Public, admin et développement

## 📖 Documentation complète

Pour la documentation détaillée, voir [`docs/README.md`](docs/README.md).

## 🔧 Développement

### Scripts disponibles
- `cd server && npm start` : Lance le serveur de développement
- Le widget sera accessible sur `http://localhost:8000`

### Tests
- Tests à implémenter dans le dossier `tests/`

---

**Widget open source pour la communauté Grist** 💪