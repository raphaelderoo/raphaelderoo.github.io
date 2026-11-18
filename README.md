# Le mur — portfolio de Raphaël Deroo

Un portfolio qui se grimpe : la page s'ouvre au pied d'un mur d'escalade et se lit
en scrollant **vers le haut**. Un grimpeur monte avec toi, de prise en prise, encordé,
jusqu'au sommet (le contact).

Site statique (HTML/CSS/JS, sans framework ni build).

```
index.html            le mur (contenu écrit du sol vers le sommet, affiché en colonne inversée)
assets/css/mur.css    styles du mur
assets/js/mur.js      prises générées, grimpeur (cinématique inverse), corde, magnésie, altimètre
cv.html               redirection vers index.html#cv (ancienne adresse du CV)
assets/cv/            photo du CV et PDF générés (français et anglais)
```

## Comment ça marche
- Les prises, volumes et dégaines sont générés en SVG avec un hasard reproductible
  (même mur à chaque visite), puis regénérés si la largeur change.
- Le bassin du grimpeur suit le défilement ; chaque main et chaque pied choisit la prise
  de la voie la plus haute à sa portée, et la position des coudes et genoux est calculée
  par cinématique inverse à deux segments.
- La corde part du baudrier et passe dans les dégaines déjà dépassées.
- `prefers-reduced-motion` coupe les animations.

## Langues
Le français est écrit dans le HTML. L'anglais est à côté, dans l'attribut `data-en` pour le texte
et dans `data-en-aria-label`, `data-en-href`, etc. pour les attributs. Le choix est gardé dans `localStorage`.

## Régénérer les PDF du CV
Le CV est écrit en HTML dans la fiche `#cvSheet` de `index.html`. Après une modification :

```
chrome --headless --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf=assets/cv/CV_Raphael_Deroo.pdf "file:///CHEMIN/index.html?lang=fr#cv"
chrome --headless --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf=assets/cv/CV_Raphael_Deroo_EN.pdf "file:///CHEMIN/index.html?lang=en#cv"
```

## Voir le site en local

```
python -m http.server 8000
```

puis aller sur http://localhost:8000
