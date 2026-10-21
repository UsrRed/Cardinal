## Domaine
Lecteurs de flux / veille auto-hébergés (RSS, digests, notifications). Note: la recherche web a donné peu de valeurs de palette exactes; ce qui suit est factuel quand sourcé, sinon marqué « observé / connaissance générale ».

### Miniflux ([source](https://github.com/miniflux/miniflux))
- Minimaliste, lecture sans distraction. Thèmes Light / Dark / System (suit l'OS), chacun en variante Sans-serif ou Serif.
- Layout: liste mono-colonne d'articles non lus, navigation par catégories; écran de lecture centré, colonne étroite.
- Interaction: raccourcis clavier, marquer lu/non lu en un clic, compteurs de non-lus dans la nav.
- Typo: police système, interligne généreux, serif en option pour la lecture longue.
- Thèmes communautaires: GitHub-dark, Catppuccin ([exemple](https://github.com/andymason/miniflux-css-theme)).

### FreshRSS ([source](https://sumguy.com/freshrss-vs-miniflux-vs-ttrss/))
- Plusieurs modes d'affichage (lecture, normal, tableau), thèmes Origine et Default-Dark, volet d'aperçu, mode lecture plein texte, raccourcis clavier.
- Sidebar de flux avec badges de non-lus, filtres lu/non lu/favoris dans l'en-tête.

### Feedbin ([source](https://feedbin.com/))
- Trois colonnes (flux | liste | article), thèmes et typographie personnalisables; clair net et sombre pour faible lumière.
- Colonne article étroite (~65 caractères), titres grands, métadonnées discrètes.

### Inoreader ([source](https://www.inoreader.com/blog/2024/10/the-new-inoreader-experience-is-here.html))
- Refonte 2024: barre d'onglets à gauche, sidebar dynamique, panneau de lecture à droite. Thèmes Aqua, Light, Sepia, Dark.
- Filtres et règles de priorité, badges de compteur.

## Synthèse: ce que font visuellement les bons produits
- Sobriété: fond neutre (gris très clair ou gris-bleu sombre), un seul accent (bleu/orange) pour les actions et les non-lus; pas d'images décoratives.
- Thème clair/sombre/système avec bascule manuelle, parfois variante serif pour la lecture.
- Lecture: colonne centrée de 60 à 75 caractères, corps 16–18 px, interligne ~1,6–1,7, titres hiérarchisés, polices système (aucune police externe, ce qui convient à la contrainte « zéro ressource externe »).
- Navigation: sidebar des flux avec badges de non-lus, liste dense, compteurs visibles.
- État et priorité: pastilles/badges colorés sobres (rouge/ambre/gris pour haute/moyenne/basse), toujours doublés d'un libellé pour l'accessibilité; non-lu en gras ou avec un point.
- Interaction: raccourcis clavier, marquer lu en un clic, « tout marquer lu », filtres en barre d'onglets ou segmentés, états vides explicites.
- Mobile: layout mono-colonne, cibles tactiles larges (utile pour le lien ntfy ouvert sur téléphone).