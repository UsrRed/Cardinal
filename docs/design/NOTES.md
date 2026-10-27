# Cardinal — Système de design « La dépêche »

## Parti pris
Cardinal est conçu comme **une petite salle de rédaction personnelle**. Le vocabulaire visuel vient de la presse et du téléscripteur, ce qui colle à un outil de veille qui reçoit des dépêches, les trie et les publie en digests :
- **papier journal chaud et encre noire**, un seul accent **rouge vermillon** de correcteur (actions primaires, priorité haute, non-lus) ;
- **colonnes filetées** plutôt que des cartes ombrées. Les flux occupent les cellules d’une grille séparée par des filets d’1 px, sans ombre ni coins arrondis ;
- **ruban perforé** (motif signature) : le pipeline `fetch → dedup → triage → digest → notify` d’un run est un ruban de télex à perforations, dont l’étape courante est hachurée et défile ;
- **sources hachurées** : les URL sources sont dans un bloc à filet gauche hachuré, sous l’intitulé « Sources · N URL fournies en entrée ». Cela matérialise la règle « données non fiables / rien d’inventé » ;
- **marques de priorité typographiques** `▮▮▮ HAUTE`, `▮▮▯ MOYENNE`, `▮▯▯ BASSE`, qui portent toujours un libellé et ne reposent jamais sur la couleur seule ;
- **tampons** en monospace capitales pour les types de source et les statuts. Seul le tampon d’un bandeau est légèrement incliné (−2°) ;
- **lettrine vermillon** sur le chapeau des digests.

Interdits : dégradés décoratifs, glassmorphism, ombres portées sur les cartes, emojis, polices web.

## Palette

| Jeton | Clair « Papier » | Sombre « Nuit de rédaction » | Usage |
|---|---|---|---|
| `--paper` | `#F4F1EA` | `#14130F` | fond de page |
| `--sunken` | `#ECE7DC` | `#0F0E0B` | ruban, journal, aide, survol |
| `--card` | `#FBF9F4` | `#1C1B17` | grille des flux, champs |
| `--ink` | `#1B1A17` | `#ECE6D8` | texte, filets forts, bouton primaire |
| `--ink-2` | `#4A463F` | `#B9B2A3` | texte secondaire |
| `--ink-3` | `#7A746A` | `#8A8376` | métadonnées, libellés |
| `--rule` | `#D6CFC0` | `#2E2B25` | filets fins |
| `--rule-2` | `#BFB6A3` | `#423E36` | bordures de champ, séparateurs |
| `--red` | `#C2361F` | `#F0603F` | accent unique, priorité haute, non-lu, erreur, focus |
| `--red-2` | `#D4513B` | `#D94E2F` | 2ᵉ teinte des hachures « en cours » |
| `--red-bg` | `#F6E2DC` | `#3A1D16` | fond d’erreur |
| `--ochre` / `--ochre-bg` | `#8F620B` / `#F3E7CC` | `#E0A93A` / `#33270F` | priorité moyenne, budget dépassé |
| `--graphite` / `--graphite-bg` | `#5F636A` / `#E6E3DC` | `#A3A8B0` / `#26262A` | priorité basse |
| `--green` / `--green-bg` | `#2F6B4F` / `#DCEBE1` | `#5FB38A` / `#16291F` | réussi, connecté, « OK — N items », lu |
| `--blue` / `--blue-bg` | `#2B4C7E` / `#DDE5F0` | `#7FA3D9` / `#18233A` | reporté (`deferred`), information |
| `--on-ink` | `#F4F1EA` | `#14130F` | texte sur fond `--ink` |

Console de connexion (xterm) : toujours sombre, avec fond `#100F0C`, texte `#E8E2D3`, jaune `#E0A93A` et vert `#5FB38A`.

Le thème suit `prefers-color-scheme` par défaut. La bascule manuelle Auto / Clair / Sombre est mémorisée dans `localStorage` et appliquée par une classe `.dark` sur `<html>`.

### Correspondance des statuts de run

| Statut | Libellé UI | Style |
|---|---|---|
| `queued` | En file | tampon pointillé `--ink-2` |
| `running` | En cours | tampon plein `--red`, texte blanc |
| `succeeded` | Réussi | `--green` sur `--green-bg` |
| `failed` | Échec | `--red` sur `--red-bg` |
| `deferred` | Reporté | `--blue` sur `--blue-bg` |
| `cancelled` | Annulé | `--ink-3` barré |
| `budget_exceeded` | Budget | `--ochre` sur `--ochre-bg` |

### Priorités

| Priorité | Marque | Style | Filet gauche d’un élément |
|---|---|---|---|
| high | `▮▮▮ HAUTE` | fond `--red`, texte blanc | 3 px `--red` |
| medium | `▮▮▯ MOYENNE` | `--ochre` sur `--ochre-bg`, contour 1 px | 3 px `--ochre` |
| low | `▮▯▯ BASSE` | contour 1 px `--graphite`, fond transparent | 1 px pointillé `--graphite` |

## Typographie
Polices **système uniquement**, aucune ressource externe.
- **Serif (titres, lecture, consignes)** : `"Iowan Old Style","Charter","Bitstream Charter","Sitka Text",Cambria,Georgia,serif`
- **Sans (contrôles UI)** : `system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif`
- **Mono (métadonnées, tampons, journal, libellés de champ)** : `ui-monospace,"SF Mono","Cascadia Mono","JetBrains Mono",Menlo,Consolas,monospace`

| Rôle | Police | Taille / interligne | Graisse | Remarques |
|---|---|---|---|---|
| Titre de digest | serif | 42/1.08 (mobile 29–32) | 600 | tracking −0.02em |
| Titre de page (masthead) | serif | 34/1.05 | 600 | |
| Nom de flux | serif | 22/1.15 | 600 | |
| Titre d’élément | serif | 22/1.25 (fil : 16.5) | 600 (lu : 400) | |
| Chapeau | serif | 20/1.55 | 400 | lettrine 64 px `--red` |
| Corps de lecture | serif | 17/1.68 | 400 | colonne max 700 px (~68 caractères) |
| Consigne / justification | serif italique | 15/1.45–1.5 | 400 | consigne entre « » |
| UI / boutons | sans | 13.5–15 | 500 | |
| Kicker / dateline / libellés | mono capitales | 10–12 | 600–700 | tracking 0.12–0.16em |
| Journal | mono | 12.5/1.65 | 400 | colonnes 76 px heure / 58 px niveau / message |
| Gros compteur non-lus | serif | 40/1 | 600 | `--red` |

Les nombres suivent la notation française : `0,14 $`, `48 210`, `1,94 M`.

## Espacements et grille
- Base **4 px** ; échelle 4 · 6 · 8 · 10 · 12 · 14 · 18 · 22 · 28 · 32 · 44.
- Shell : sidebar de 232 px plus contenu, avec un padding de 28/32 px (mobile : 20/16).
- Grille des flux : 2 colonnes séparées par des filets (1 colonne sous 860 px), padding de cellule 20/22 px.
- Run : contenu plus colonne d’historique de 300 px (empilés sous 1060 px).
- Formulaire : champs plus aide contextuelle de 320 px (empilés sous 1060 px).
- Réglages : lignes `220 px libellé | contenu`, séparées par un filet.
- Lecture : colonne de 700 px centrée.

## Bordures, rayons, ombres
- **Rayons** : 0 partout. Boutons : 2 px. Seule exception : les éléments « système » (téléphone, notification ntfy), qui ne font pas partie de l’UI produit.
- **Filets** : 1 px `--rule` pour les séparateurs fins, 1 px `--ink` sous les en-têtes de section, **double 3 px `--ink`** sous la marque et au-dessus des sections de digest.
- **Champs** : bordure de 1 px `--rule-2` et **filet bas de 2 px `--ink`** (ligne d’écriture). En erreur : bordures `--red` et fond `--red-bg`.
- **Ombres** : aucune sur les cartes. Seules les surfaces flottantes (menu ⋯, modale de confirmation de suppression, carte de login) portent une ombre décalée pleine `6px 6px 0 var(--ink)`, comme un papier posé.
- **Flux en pause** : hachures diagonales à 45° (`--sunken`, pas de 10 px) sur la cellule, gros compteur en `--ink-3`.

## Composants clés
- **Boutons** : `.btn` contour encre ; `.primary` en encre pleine qui passe au vermillon au survol ; `.danger` en vermillon ; `.ghost` sans bordure ; `.sm` pour les actions de carte. Une seule action primaire par vue.
- **Segmenté** (filtres, thème) : cadre encre, segment actif en encre pleine, libellés en mono capitales.
- **Ruban de run** : 5 cases jointives (une par étape). Fait : encre pleine. En cours : hachures vermillon qui défilent. À venir : pointillé. Erreur : `--red-bg`. Une ligne de détail en mono (« 118 déjà vus · 31 neufs »). La version miniature (barre de 6 px) apparaît sur la carte du flux pendant un run.
- **Stats de run** : 4 cellules filetées (Nouveaux, Tokens in/out, Durée, Budget avec jauge encre et `coût / budget`).
- **Bloc Sources** : filet gauche hachuré de 4 px et en-tête « Sources · N URL fournies en entrée ». Liens en mono soulignés vermillon, `↗`, `rel="noopener noreferrer"`, `target="_blank"`.
- **Secret** : tampon « Configurée » ou « Non configuré », masque `••••`, mention de la source (`variable d’environnement (prioritaire)` / `saisie UI`) et actions Remplacer / Effacer, désactivées si la valeur vient de l’environnement. La valeur n’est **jamais** affichée.
- **Console de connexion** : panneau terminal sombre avec une barre (`● pty actif`, commande, compte à rebours de fermeture automatique, Fermer).
- **Bandeaux de run** : « Reporté » en bleu (avec l’heure de reprise) et « Budget » en ocre (digest partiel), tampon incliné à −2°.
- **Notification ntfy** : titre `[Cardinal] <flux> — <élément>`, corps ≤ 300 caractères.

## États obligatoires (toutes les vues)
- **Vide** : marque typographique `¶ ¶ ¶` en `--rule-2`, une phrase serif et une action primaire.
- **Chargement** : pas de squelettes gris arrondis. Des lignes « en composition » (hachures verticales de 2 px en `--rule-2`, pulsation d’opacité 1,4 s), avec la légende mono « Composition en cours… » et `aria-busy="true"`.
- **Erreur** : encadré `--red` sur `--red-bg` avec un titre générique en mono capitales et un message sans détail technique, puis « Référence : req-xxxx » (id de corrélation) et un bouton « Réessayer ».
- **Champ invalide** : message par champ sous l’entrée, en mono 12 px `--red` préfixé `✕`, avec le chemin du champ si utile (`packages[2].ecosystem`). Les succès (« OK — 50 items », « Message de test envoyé. ») apparaissent en `--green` préfixés `✓`.

## Interaction et motion
- Transitions : **120 ms** (couleurs des boutons, survols), **200 ms** au maximum pour les ouvertures de menus. `ease-out`, jamais de rebond.
- Animations : défilement des hachures de l’étape en cours (`crawl`, 0,9–1,1 s, linéaire, infini), curseur clignotant sur la dernière ligne du journal et pulsation du chargement. **Tout est coupé sous `prefers-reduced-motion: reduce`.**
- Journal en direct : `aria-live="polite"`, auto-scroll seulement si l’utilisateur est déjà en bas.
- Focus visible : contour 2 px `--red` décalé de 2 px sur tous les contrôles.
- Marquer comme lu : bascule immédiate (« ✓ Lu » vert, élément à 62 % d’opacité dans le digest, titre en graisse 400 dans le fil). Le point non-lu vermillon devient un cercle vide.
- Suppression : confirmation par modale. Duplication : crée « Copie de … » en pause.
- Raccourcis (fil et digest) : `j`/`k` élément suivant ou précédent, `m` marquer lu, `Maj+M` tout marquer lu, `t` changer de thème.
- Cibles tactiles ≥ 40 px sur mobile. Sous 860 px, la sidebar devient une barre d’onglets horizontale (onglet actif souligné en vermillon), le ruban s’empile verticalement et la colonne priorité du fil est masquée (le libellé reste dans la ligne de méta).

## Accessibilité
- Contraste ≥ 4,5:1 pour le texte courant dans les deux thèmes. Le vermillon ne sert jamais de couleur de texte long.
- La priorité et le statut portent toujours un libellé texte en plus de la couleur et de la marque `▮`.
- Langue `fr` ; dates au format long dans le fuseau configuré ; heures 24 h.
