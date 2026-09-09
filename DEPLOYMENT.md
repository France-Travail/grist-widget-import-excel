# Publication GitHub Pages

`npm run check` produit le site dans `dist/`. Le workflow teste chaque pull request
et ne déploie que `main`, après réussite des tests. Dans les réglages GitHub Pages,
la source doit être **GitHub Actions**. `./deploy.sh` prépare et vérifie le site,
sans commit ni push.

## Cache et URL stable

`index.html` charge un petit `bootstrap.js` stable. Ce dernier récupère `version.json`
avec `cache: no-store` et un paramètre temporel, puis charge JS, CSS et dépendances
dans `releases/<empreinte>/`. Toute modification de contenu produit une nouvelle
empreinte et de nouvelles URL pour l’ensemble du graphe de modules.

Une iframe ouverte conserve sa version cohérente. Le manifeste est vérifié toutes les
minutes et au retour sur l’onglet ; si une version différente existe, un bouton propose
de recharger. Aucune mise à jour n’interrompt automatiquement un import en cours.
Le rechargement efface le fichier et les possibilités d’annulation propres à la session.

GitHub Pages ne permet pas de configurer librement les en-têtes de cache. Lors du
**premier passage de l’ancien widget à cette architecture**, l’ancienne page en cache
ne connaît pas ce mécanisme : un rechargement forcé ou un paramètre d’URL ponctuel
peut encore être nécessaire. Ensuite, l’URL du widget reste stable ; inutile de la
renommer en `v1`, `v2`, etc. Les proxies qui ignorent les paramètres/cache restent
hors du contrôle d’une application statique.

Le build local conserve les dossiers de versions précédents dans `dist/`. Un build CI
part d’un checkout propre ; un ancien onglet qui n’avait pas fini de charger ses
ressources au moment de la publication doit être rechargé. L’application ne charge
pas de modules supplémentaires à la demande après son démarrage.

## Hébergement alternatif

Servir le contenu de `dist/` en HTTPS. Si l’hébergement le permet :

- `index.html`, `bootstrap.js`, `version.json` : `Cache-Control: no-cache` ;
- `releases/*` : `Cache-Control: public, max-age=31536000, immutable` ;
- autoriser l’intégration iframe depuis votre instance Grist.

Ne pas copier les fichiers bruts de `public/` seuls : le manifeste et les dossiers de
version sont générés par le build. Les routes fonctionnent aussi sous un sous-chemin.

## Retour à une version précédente

Redéployer un commit connu après exécution de ses tests. Le manifeste pointera vers
son empreinte et le widget proposera un rechargement. La configuration et les données
Grist ne sont pas modifiées par le déploiement. L’historique du document Grist reste
la référence pour annuler des modifications de données.
