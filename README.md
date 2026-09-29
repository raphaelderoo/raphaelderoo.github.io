# Portfolio — Raphaël Deroo

Site statique (HTML/CSS/JS, sans framework ni build).

```
index.html            page principale (qui suis-je, projets, compétences, contact)
cv.html               visionneuse du CV
assets/css/style.css  styles (thème clair/sombre automatique)
assets/js/main.js     boutons copier + animations au scroll
assets/cv/            CV en PDF + aperçu PNG (affiché sur mobile)
```

## Voir le site en local

Ouvrir `index.html` dans le navigateur, ou lancer un petit serveur :

```
python -m http.server 8000
```

puis aller sur http://localhost:8000

## Mettre à jour le CV

Remplacer `assets/cv/CV_Raphael_Deroo.pdf` par la nouvelle version (même nom de fichier),
et régénérer l'aperçu `assets/cv/CV_Raphael_Deroo.png` (export en image de la page 1).

## Mise en ligne

Le site fonctionne tel quel sur n'importe quel hébergeur statique
(GitHub Pages, Vercel, Netlify…) : il suffit de publier le dossier à la racine.
