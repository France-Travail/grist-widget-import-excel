#!/bin/bash

# Script de déploiement pour GitHub Pages
echo "🚀 Préparation du déploiement GitHub Pages..."

# Copier les fichiers source dans public/
echo "📁 Copie des fichiers source..."
cp -r src public/

# Créer le fichier .nojekyll
echo "📄 Création du fichier .nojekyll..."
touch public/.nojekyll

# Vérifier la structure
echo "📋 Structure finale:"
ls -la public/

echo "✅ Déploiement prêt ! Commitez et poussez vers GitHub."
