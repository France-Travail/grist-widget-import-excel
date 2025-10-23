# 🚀 Déploiement GitHub Pages

## Structure requise

Pour que le widget fonctionne sur GitHub Pages, la structure doit être :

```
public/
├── index.html          # Page principale
├── styles/
│   └── style.css       # Styles
├── src/                # Code source copié
│   ├── app.js
│   ├── config.js
│   └── services/
│       ├── adminService.js
│       ├── excelService.js
│       ├── gristService.js
│       ├── logServices.js
│       ├── rulesService.js
│       ├── rulesSetupService.js
│       ├── uiService.js
│       └── utils.js
└── .nojekyll           # Fichier pour GitHub Pages
```

## Déploiement automatique

Le workflow GitHub Actions est configuré pour :
1. Se déclencher sur push vers `main`
2. Utiliser le dossier `./public` comme source
3. Déployer automatiquement sur GitHub Pages

## Déploiement manuel

Si vous voulez déployer manuellement :

```bash
# 1. Préparer les fichiers
./deploy.sh

# 2. Commiter et pousser
git add .
git commit -m "Deploy to GitHub Pages"
git push origin main
```

## URL de déploiement

Le widget sera disponible à : `https://france-travail.github.io/grist-widget-import-excel/`

## Dépannage

Si vous avez des erreurs 404 :
1. Vérifiez que le dossier `public/src/` existe
2. Vérifiez que le fichier `.nojekyll` est présent
3. Vérifiez que les chemins dans `index.html` sont corrects
