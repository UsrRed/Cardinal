# Cardinal

Veille personnelle automatisée. Vous décrivez un sujet en langage naturel ; Cardinal récupère les sources (RSS/Atom, OSV, NVD), supprime les doublons, fait trier et résumer le tout par Claude, puis publie un digest lisible et, au choix, envoie une notification [ntfy](https://ntfy.sh).

- Application **mono-utilisateur** : une interface web, une base SQLite, aucun service externe obligatoire hors Claude.
- Par défaut, l'interface n'écoute que sur la boucle locale (`127.0.0.1`).
- Le détail des données envoyées à Claude figure dans [`docs/DONNEES-ENVOYEES.md`](docs/DONNEES-ENVOYEES.md).

## Prérequis

- **Node.js 22 ou plus récent** (`engines` : `>=22`).
- **npm** (fourni avec Node.js).
- `python3`, `make` et `g++` : nécessaires à la compilation des modules natifs `better-sqlite3` et `node-pty` si aucun binaire précompilé n'est disponible pour votre plateforme.
- Un accès à Claude : soit un **compte Claude** (connexion `claude /login` depuis l'interface), soit une **clé API Anthropic**.
- Pour les tests e2e : Chromium géré par Playwright (installé à l'étape suivante).

Pour un déploiement Docker, seuls Docker et Docker Compose sont requis. Voir [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Installation

```bash
git clone <url-du-dépôt> cardinal && cd cardinal
npm ci && npx playwright install chromium
```

`npm ci` installe les dépendances exactes de `package-lock.json`, dont le CLI `@anthropic-ai/claude-code` (binaire `node_modules/.bin/claude`). `npx playwright install chromium` télécharge le navigateur utilisé par les tests e2e.

## Lancement

```bash
npm run build                      # compile le serveur (dist/) et l'interface (dist/web/)
PFLUX_DATA_DIR=./data npm start    # démarre sur http://127.0.0.1:8787
```

- `npm start` exécute `node dist/index.js` : il faut donc avoir lancé `npm run build` au préalable (le dossier `dist/` n'est pas versionné).
- `npm start` ne lit pas le fichier `.env` : exportez les variables ou préfixez la commande (ex. `PFLUX_PORT=9000 npm start`). `.env` n'est lu que par Docker Compose.
- Pour le développement (rechargement du serveur) : `npm run dev` (serveur) et `npm run dev:web` (interface Vite, port 5173, proxy vers `/api`).

## Connecter Claude

Deux possibilités :

1. **Compte Claude (console intégrée)** : ouvrez *Réglages → Connexion Claude*, lancez la console, exécutez `claude /login` et suivez le lien affiché. Les identifiants sont stockés dans le répertoire de données.
2. **Clé API** : définissez `PFLUX_ANTHROPIC_API_KEY` dans l'environnement (ou dans `.env` avec Docker), ou saisissez-la dans *Réglages → Secrets*. Elle n'est jamais réaffichée.

La pastille « Claude » de la barre latérale indique l'état (connecté, clé API, non connecté).

## Premiers flux

*Flux → Nouveau flux* : renseignez un nom, des **instructions** (ce qui vous intéresse, en français ou en anglais), une source, la fréquence et la fraîcheur maximale. Cliquez sur *Lancer* pour un premier run et suivez-le en direct.

| Type | À utiliser pour | Paramètres |
|---|---|---|
| **RSS** | Blogs, médias, annonces de versions (Atom ou RSS 2.0) | 1 à 20 URLs http(s) de flux |
| **OSV** | Vulnérabilités touchant vos dépendances (PyPI, npm, Go, crates.io, Maven, NuGet, RubyGems, Packagist) | 1 à 50 paquets (nom + écosystème) |
| **NVD** | Failles CVE par mots-clés (produit, éditeur) | 1 à 20 mots-clés, sévérité minimale optionnelle ; `PFLUX_NVD_API_KEY` conseillée |

Exemples : RSS `https://hnrss.org/frontpage` ; OSV `lodash` / `npm` ; NVD `openssl`.

## Fil et résumé du jour

- **Fil** : tous les éléments retenus, filtrables par priorité et lecture. Le sélecteur *Vue* bascule entre la *Liste* compacte et la vue *Détaillée* en cartes (priorité, titre, résumé, lien vers l'article) ; le choix est mémorisé dans le navigateur.
- **Résumé du jour** : une synthèse globale de tous les flux pour un jour (fuseau des Réglages) — une passe d'ensemble, puis les éléments *À retenir*, *À surveiller* et *En bref*, regroupés par Claude en catégories, avec un lien vers chaque article cité. Celui de la veille est généré automatiquement chaque matin après 6 h ; *Générer* / *Régénérer* le lance à la demande (un appel Claude, modèle `PFLUX_DEFAULT_MODEL`). Seuls les titres, URL, noms de flux, priorités et résumés déjà produits sont envoyés.

## Notifications ntfy

- **ntfy.sh** : dans *Réglages*, serveur `https://ntfy.sh`, choisissez un sujet difficile à deviner, puis activez *Notifier* sur le flux avec un seuil de priorité. Pour un serveur protégé, ajoutez `PFLUX_NTFY_TOKEN`.
- **ntfy sur le réseau local** : les adresses privées sont bloquées par défaut (protection SSRF). Autorisez explicitement l'hôte, par exemple `PFLUX_SSRF_ALLOWLIST=192.168.1.20:8080`, puis indiquez le serveur `http://192.168.1.20:8080`.
- `PFLUX_PUBLIC_URL` ajoute un lien de retour vers le digest dans la notification.

## Ajouter des flux par MCP

Cardinal expose un serveur MCP (HTTP « streamable », sans état) sur `/mcp`, pour qu'un assistant comme Claude Code gère les flux sans passer par l'interface. Il est **désactivé** tant que `PFLUX_MCP_TOKEN` n'est pas défini.

1. Générez un jeton (`openssl rand -hex 32`) et placez-le dans `PFLUX_MCP_TOKEN`, puis redémarrez.
2. Côté client :

   ```sh
   claude mcp add --transport http cardinal https://<votre-instance>/mcp \
     --header "Authorization: Bearer <jeton>"
   ```

Outils : `list_feeds`, `get_feed`, `test_feed_url`, `create_feed`, `update_feed`, `set_feed_enabled`, `run_feed`. Pas de suppression (à faire dans l'interface), pas de lecture des digests. Le jeton est indépendant du mot de passe et de la session : seul l'en-tête `Authorization` est accepté, et une requête portant un `Origin` étranger est refusée. Les notifications d'un flux créé par MCP utilisent le serveur et le sujet des *Réglages*.

## Tests

```bash
npm test
```

`npm test` enchaîne :

1. `vitest run` : tests unitaires et d'intégration (`tests/unit`, `tests/integration`), sans réseau.
2. `npm run build` : compilation nécessaire aux tests e2e.
3. `playwright test` : parcours e2e dans `tests/e2e` (créer un flux RSS, lancer un run, lire le digest, marquer lu), contre un serveur fixture local et le runner Claude factice.

Autres commandes : `npm run lint`, `npm run typecheck`, `npm run test:unit`, et `npm run ci` (lint + typecheck + tests).

## Structure du projet

```
.
├── src/             # serveur Node (Fastify) : config, db, net, sources, claude, pipeline, scheduler, auth, http…
├── web/             # interface React + Vite (pages, composants, styles repris de docs/design/)
├── migrations/      # migrations SQL numérotées (appliquées au démarrage)
├── tests/           # unit/, integration/, e2e/, fixtures/, helpers/
├── docs/            # SPEC, ARCHITECTURE (carte du dépôt), INTERFACES, DEPLOY, DONNEES-ENVOYEES…
├── Dockerfile       # image multi-étapes non-root
├── docker-compose.yml
├── .env.example     # variables d'environnement commentées
└── package.json     # scripts npm
```

La carte détaillée des modules est dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) ; les contrats (signatures, schémas API/WS) sont dans [`docs/INTERFACES.md`](docs/INTERFACES.md).

## Déploiement

Installation Docker recommandée, accès réseau via reverse proxy HTTPS, sauvegarde : voir [`docs/DEPLOY.md`](docs/DEPLOY.md).

Démarrage rapide avec Docker :

```bash
cp .env.example .env        # optionnel : ajustez PFLUX_TZ, etc.
docker compose up -d --build
```

L'interface est alors sur <http://127.0.0.1:8787>. Les données vivent dans le volume `pflux-data` (monté sur `/data`). Le conteneur tourne en utilisateur non-root (uid 10001), avec système de fichiers en lecture seule et sans capabilities.

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PFLUX_PORT` | `8787` | Port d'écoute |
| `PFLUX_HOST` | `127.0.0.1` (`0.0.0.0` si exposé) | Adresse d'écoute |
| `PFLUX_EXPOSE` | `0` | `1` : accès réseau, impose `PFLUX_PASSWORD` |
| `PFLUX_PASSWORD` | — | Mot de passe d'accès (≥ 12 car.) |
| `PFLUX_SESSION_SECRET` | généré (`session.key`) | Secret de session (≥ 32 octets) |
| `PFLUX_TRUST_PROXY` | `0` | Fait confiance aux en-têtes `X-Forwarded-*` |
| `PFLUX_PUBLIC_URL` | — | URL publique (liens de notification) |
| `PFLUX_DATA_DIR` | `/data` (`./data` hors production) | Répertoire des données |
| `PFLUX_SSRF_ALLOWLIST` | vide | Hôtes/IP privés autorisés (`hôte:port`, séparés par des virgules) |
| `PFLUX_FETCH_MAX_BYTES` | `5242880` | Taille max d'une réponse |
| `PFLUX_FETCH_TIMEOUT_MS` | `15000` | Délai max d'une requête |
| `PFLUX_MAX_CONCURRENT_RUNS` | `1` | Runs simultanés (1–8) |
| `PFLUX_SCHEDULER_TICK_S` | `60` | Période du planificateur (1–3600 s) |
| `PFLUX_DEFER_MINUTES` | `60` | Report d'un run quand Claude est indisponible |
| `PFLUX_RETENTION_DAYS` | `0` | Purge des anciens digests (0 = conserver) |
| `PFLUX_TZ` | `UTC` | Fuseau horaire IANA |
| `PFLUX_DEFAULT_MODEL` | `sonnet` | Modèle par défaut des nouveaux flux |
| `PFLUX_ANTHROPIC_API_KEY` | — | Clé API Anthropic (secret) |
| `PFLUX_NVD_API_KEY` | — | Clé API NVD (secret) |
| `PFLUX_NTFY_TOKEN` | — | Jeton d'accès ntfy (secret) |
| `PFLUX_MCP_TOKEN` | — | Active le serveur MCP `/mcp` ; jeton Bearer des clients (≥ 32 car., secret) |
| `PFLUX_CLAUDE_BIN` | `node_modules/.bin/claude` | Binaire Claude Code |
| `PFLUX_CLAUDE_RUNNER` | `cli` | `cli` ou `fake` (tests) |
| `PFLUX_LOG_LEVEL` | `info` | Niveau de logs |
| `PFLUX_IN_CONTAINER` | auto | Posé par l'image Docker |

Une variable d'environnement prime sur le réglage équivalent de l'interface (signalé comme « imposé par l'environnement »).

## Modèle de menaces et limites

- **Usage prévu** : un seul utilisateur, sur sa machine ou derrière un proxy HTTPS. Pas de comptes multiples ni de rôles.
- **Par défaut** : écoute sur la boucle locale uniquement. En mode exposé, mot de passe obligatoire, cookies de session signés, protection CSRF, limitation des tentatives de connexion.
- **SSRF** : les requêtes sortantes (flux, ntfy) refusent les adresses privées, loopback et métadonnées cloud, avec vérification de l'IP de connexion (anti-rebinding), sauf entrées explicites de `PFLUX_SSRF_ALLOWLIST`.
- **Contenu non fiable** : les articles sont traités comme des données ; le XML est analysé sans entités ni DTD ; la sortie de Claude est validée par schéma ; l'interface n'affiche que du texte échappé.
- **Limites** : les résumés de Claude peuvent être inexacts, vérifiez les sources avant d'agir ; une injection de prompt dans un article peut fausser un résumé ou une priorité (sans accès à des outils ni à vos secrets) ; les identifiants Claude et les secrets résident dans le répertoire de données **non chiffré** : protégez le volume et ses sauvegardes ; pas de TLS intégré.
