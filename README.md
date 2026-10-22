# Personnal Flux

Veille personnelle automatisée : vous décrivez un sujet en langage naturel, Personnal Flux récupère les sources (RSS/Atom, OSV, NVD), déduplique, fait trier et résumer par Claude, puis publie un digest lisible et, au choix, une notification ntfy. Application mono-utilisateur, une base SQLite, aucun service externe obligatoire hors Claude.

## Installation avec Docker (recommandé)

```bash
git clone <url-du-dépôt> personnal-flux && cd personnal-flux
cp .env.example .env        # optionnel : ajustez PFLUX_TZ, etc.
docker compose up -d --build
```

L'interface est alors disponible sur <http://127.0.0.1:8787> (le port n'est publié que sur la boucle locale). Les données vivent dans le volume nommé `pflux-data` (monté sur `/data`). Le conteneur tourne en utilisateur non-root (uid 10001), système de fichiers en lecture seule, toutes les capabilities retirées, sans accès à `docker.sock`. L'état de santé s'affiche avec `docker compose ps` (healthcheck Node sur `/healthz`).

## Installation sur un PC (sans Docker)

Prérequis : Node.js 22+, et `python3`, `make`, `g++` pour compiler `better-sqlite3`/`node-pty`.

```bash
npm ci
npm run build
PFLUX_DATA_DIR=./data npm start
```

## Connecter Claude

Deux possibilités :

1. **Compte Claude (console intégrée)** : ouvrez *Réglages → Connexion Claude*, lancez la console, exécutez `claude /login` et suivez le lien affiché. Les identifiants sont stockés dans `/data`.
2. **Clé API** : définissez `PFLUX_ANTHROPIC_API_KEY` dans `.env`, ou saisissez-la dans *Réglages → Secrets* (elle n'est jamais réaffichée).

Le pastille « Claude » de la barre latérale indique l'état (connecté, clé API, non connecté).

## Premiers flux

*Flux → Nouveau flux*, puis renseignez un nom, des **instructions** (ce qui vous intéresse, en français ou en anglais), une source, la fréquence et la fraîcheur maximale. Cliquez sur *Lancer* pour un premier run et suivez-le en direct.

### Guide du type de source

| Type | À utiliser pour | Paramètres |
|---|---|---|
| **RSS** | Blogs, médias, annonces de versions (Atom ou RSS 2.0) | 1 à 20 URLs http(s) de flux |
| **OSV** | Vulnérabilités touchant vos dépendances (PyPI, npm, Go, crates.io, Maven, NuGet, RubyGems, Packagist) | 1 à 50 paquets (nom + écosystème) |
| **NVD** | Failles CVE par mots-clés (produit, éditeur) | 1 à 20 mots-clés, sévérité minimale optionnelle ; `PFLUX_NVD_API_KEY` conseillée |

Exemples : RSS `https://hnrss.org/frontpage` ; OSV `lodash` / `npm` ; NVD `openssl`.

## Notifications ntfy

- **ntfy.sh** : dans *Réglages*, serveur `https://ntfy.sh`, choisissez un sujet (topic) difficile à deviner, puis activez *Notifier* sur le flux avec un seuil de priorité. Pour un serveur protégé, ajoutez `PFLUX_NTFY_TOKEN`.
- **ntfy sur le réseau local** : les adresses privées sont bloquées par défaut (protection SSRF). Autorisez explicitement l'hôte : `PFLUX_SSRF_ALLOWLIST=192.168.1.20:8080`, puis serveur `http://192.168.1.20:8080`.
- `PFLUX_PUBLIC_URL` ajoute un lien de retour vers le digest dans la notification.

## Reverse proxy HTTPS

Pour un accès hors de la machine : définissez `PFLUX_EXPOSE=1`, `PFLUX_PASSWORD` (≥ 12 caractères), `PFLUX_TRUST_PROXY=1` et `PFLUX_PUBLIC_URL=https://flux.exemple.org`. Placez devant n'importe quel proxy (Caddy, nginx, Traefik…) terminant le TLS et transmettant `X-Forwarded-For`/`X-Forwarded-Proto`, y compris les WebSockets. Exemple Caddy :

```
flux.exemple.org {
    reverse_proxy 127.0.0.1:8787
}
```

N'exposez jamais le port 8787 en HTTP clair sur Internet.

## Sauvegarde et restauration de /data

```bash
# sauvegarde (arrêt court pour un instantané cohérent)
docker compose stop
docker run --rm -v personnal-flux_pflux-data:/data -v "$PWD":/backup debian:bookworm-slim \
  tar czf /backup/pflux-backup.tgz -C /data .
docker compose start

# restauration
docker compose stop
docker run --rm -v personnal-flux_pflux-data:/data -v "$PWD":/backup debian:bookworm-slim \
  sh -c 'tar xzf /backup/pflux-backup.tgz -C /data && chown -R 10001:10001 /data'
docker compose start
```

(Le préfixe du volume dépend du nom du dossier du projet : vérifiez avec `docker volume ls`.) `/data` contient la base SQLite, `session.key`, les secrets saisis dans l'interface et les identifiants Claude. Les flux se transfèrent aussi sans secrets via *Exporter/Importer*.

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
| `PFLUX_DEFAULT_BUDGET_USD` | `0.5` | Budget par run par défaut |
| `PFLUX_ANTHROPIC_API_KEY` | — | Clé API Anthropic |
| `PFLUX_NVD_API_KEY` | — | Clé API NVD |
| `PFLUX_NTFY_TOKEN` | — | Jeton d'accès ntfy |
| `PFLUX_CLAUDE_BIN` | `node_modules/.bin/claude` | Binaire Claude Code |
| `PFLUX_CLAUDE_RUNNER` | `cli` | `cli` ou `fake` (tests) |
| `PFLUX_LOG_LEVEL` | `info` | Niveau de logs |
| `PFLUX_IN_CONTAINER` | auto | Posé par l'image Docker |

Une variable d'environnement prime sur le réglage équivalent de l'interface (signalé comme « imposé par l'environnement »).

## Modèle de menaces et limites

- **Usage prévu** : un seul utilisateur, sur sa machine ou derrière un proxy HTTPS. Pas de comptes multiples ni de rôles.
- **Par défaut** : écoute sur la boucle locale uniquement. En mode exposé, mot de passe obligatoire, cookies de session signés, protection CSRF, limitation des tentatives de connexion.
- **SSRF** : toutes les requêtes sortantes (flux, ntfy) refusent les adresses privées, loopback et métadonnées cloud, avec vérification de l'IP de connexion (anti-rebinding), sauf entrées explicites de `PFLUX_SSRF_ALLOWLIST`.
- **Contenu non fiable** : les articles sont traités comme des données ; le XML est analysé sans entités ni DTD ; la sortie de Claude est validée par schéma ; l'interface n'affiche que du texte échappé.
- **Conteneur** : non-root, lecture seule, sans capabilities, sans `docker.sock`.
- **Limites** : les résumés de Claude peuvent être inexacts — vérifiez les sources avant d'agir ; une injection de prompt dans un article peut fausser un résumé ou une priorité (sans accès à des outils ni à vos secrets) ; les identifiants Claude et secrets résident dans `/data` non chiffré — protégez le volume et ses sauvegardes ; pas de chiffrement TLS intégré ; le coût dépend de votre usage (budget par run plafonné).

Voir aussi `docs/DONNEES-ENVOYEES.md` pour le détail des données qui quittent votre machine.
