# Déploiement — Cardinal

Ce document décrit comment déployer Cardinal. La cible concrète documentée est la **machine locale via Docker Compose** (image `cardinal:local`, publiée sur `127.0.0.1:8787`). Les variantes (accès réseau, Node natif) sont décrites ensuite.

Les valeurs des secrets ne figurent jamais dans ce document : elles se saisissent dans le fichier `.env` local (ignoré par git).

## 1. Options de déploiement

| Option | Quand la choisir | Exposition |
|---|---|---|
| **A. Docker Compose local** (recommandée, cible documentée) | Usage personnel sur une machine | Boucle locale uniquement (`127.0.0.1:8787`) |
| **B. Docker Compose + reverse proxy HTTPS** | Accès depuis d'autres appareils ou Internet | HTTPS via proxy (Caddy, nginx, Traefik…) ; l'application passe en mode exposé |
| **C. Node natif (`npm start`)** | Pas de Docker disponible | Boucle locale par défaut ; même configuration que A/B hors conteneur |

Le conteneur n'est pas exposé en HTTP clair : ne publiez jamais le port 8787 directement sur Internet.

## 2. Prérequis

- Docker Engine avec le plugin **Docker Compose v2** (`docker compose version`).
- Un dépôt cloné (`git clone <url-du-dépôt> cardinal`).
- Un accès Claude, **au choix** :
  - compte Claude (abonnement) : connexion via la console intégrée, aucune variable requise ;
  - ou clé API Anthropic : variable `PFLUX_ANTHROPIC_API_KEY`.
- Optionnel : clé NVD (`PFLUX_NVD_API_KEY`), jeton ntfy (`PFLUX_NTFY_TOKEN`), secret de session (`PFLUX_SESSION_SECRET`).

### Inventaire des accès

| Accès | Rôle | Variable (fichier `.env`) | Requis ? | État |
|---|---|---|---|---|
| Compte Claude | Triage/résumés via le CLI `claude` (connexion `/login`) | — (console intégrée) | Oui, si pas de clé API | NON FOURNI |
| Clé API Anthropic | Alternative au compte Claude | `PFLUX_ANTHROPIC_API_KEY` | Oui, si pas de compte Claude | NON FOURNI |
| Clé API NVD | Limite de débit NVD relevée (50 au lieu de 5 requêtes / 30 s) | `PFLUX_NVD_API_KEY` | Non, conseillé | NON FOURNI |
| Jeton ntfy | Serveur ntfy protégé | `PFLUX_NTFY_TOKEN` | Seulement si le serveur l'exige | NON FOURNI |
| Mot de passe d'accès | Protège l'interface en mode exposé | `PFLUX_PASSWORD` | Oui si `PFLUX_EXPOSE=1` | NON FOURNI |
| Secret de session | Signe les cookies de session | `PFLUX_SESSION_SECRET` | Non : généré (32 octets, fichier 600) | NON FOURNI (auto) |

## 3. Procédure — Option A : Docker Compose local

### 3.1 Préparer la configuration

```bash
cd cardinal
cp .env.example .env
chmod 600 .env
```

Éditez `.env` (fichier local, jamais versionné) :

1. Fuseau : `PFLUX_TZ` (ex. `Europe/Paris`).
2. Accès Claude, **un des deux** :
   - compte Claude : ne renseignez aucune clé ; la connexion se fait à l'étape 3.3 ;
   - clé API : renseignez `PFLUX_ANTHROPIC_API_KEY`.
3. Optionnel : `PFLUX_NVD_API_KEY` et `PFLUX_NTFY_TOKEN` si vous les utilisez.

### 3.2 Construire et démarrer

```bash
docker compose up -d --build
docker compose ps        # l'état « healthy » doit apparaître après ~20 s
```

Le healthcheck interroge `GET /healthz` dans le conteneur. Si l'état reste `unhealthy`, consultez `docker compose logs pflux`.

L'interface est disponible sur <http://127.0.0.1:8787>.

### 3.3 Connecter Claude (si compte Claude)

1. Ouvrez *Réglages → Connexion Claude*.
2. Lancez la console, exécutez `claude /login` et suivez le lien affiché.
3. Vérifiez que la pastille « Claude » de la barre latérale passe à « connecté ».

Les identifiants sont écrits dans le volume `pflux-data` (sous `claude-home/`).

### 3.4 Vérifier

- Créez un flux RSS de test, lancez-le avec *Lancer*, et suivez le run jusqu'à `succeeded`.
- Consultez `docker compose logs --tail=50 pflux` : aucun secret ne doit apparaître.

### 3.5 Mettre à jour

```bash
git pull
docker compose up -d --build
```

Les données du volume `pflux-data` sont conservées. Les migrations SQL (`migrations/`) s'appliquent au démarrage.

### 3.6 Arrêter

```bash
docker compose stop        # arrêt, données conservées
docker compose down        # arrêt et suppression du conteneur (le volume reste)
```

## 4. Procédure — Option B : accès HTTPS via reverse proxy

Le conteneur publie son port uniquement sur `127.0.0.1` : un accès distant passe obligatoirement par un proxy HTTPS qui tourne sur la même machine.

### 4.1 Variables à définir dans `.env`

| Variable | Valeur attendue |
|---|---|
| `PFLUX_EXPOSE` | `1` |
| `PFLUX_PASSWORD` | mot de passe d'au moins 12 caractères (saisi par l'opérateur, jamais versionné) |
| `PFLUX_TRUST_PROXY` | `1` |
| `PFLUX_PUBLIC_URL` | URL publique HTTPS, sans slash final (ex. `https://flux.exemple.org`) |

Relancez ensuite : `docker compose up -d`.

### 4.2 Proxy (exemple Caddy)

```
flux.exemple.org {
    reverse_proxy 127.0.0.1:8787
}
```

Le proxy doit transmettre `X-Forwarded-For` et `X-Forwarded-Proto`, y compris pour les WebSockets (console de connexion et suivi des runs). Caddy le fait par défaut.

### 4.3 Vérifier

- `https://flux.exemple.org` affiche la page de connexion ; sans mot de passe, l'accès est refusé.
- Le port 8787 n'est pas joignable depuis une autre machine (`127.0.0.1` uniquement).

## 5. Procédure — Option C : Node natif

```bash
npm ci && npx playwright install chromium   # Playwright seulement si vous lancez les tests
npm run build
PFLUX_DATA_DIR=./data npm start
```

`npm start` ne lit pas `.env` : exportez les variables (`PFLUX_ANTHROPIC_API_KEY`, etc.) dans l'environnement du service. Pour un démarrage automatique, un service `systemd` utilisateur qui exécute `node dist/index.js` depuis le dépôt, avec `PFLUX_DATA_DIR` pointant vers un dossier dédié, convient.

Hors conteneur, `PFLUX_HOST` n'est pris en compte que si `PFLUX_EXPOSE=1`.

## 6. Sauvegarde et restauration

Le volume `pflux-data` contient la base SQLite, `session.key`, les secrets saisis dans l'interface et les identifiants Claude **non chiffrés**. Protégez ses sauvegardes en conséquence.

Le nom du volume dépend du nom du dossier du projet (`cardinal_pflux-data` dans le dépôt cloné sous ce nom) : vérifiez avec `docker volume ls`.

```bash
# sauvegarde (arrêt court pour un instantané cohérent)
docker compose stop
docker run --rm -v cardinal_pflux-data:/data -v "$PWD":/backup debian:bookworm-slim \
  tar czf /backup/pflux-backup.tgz -C /data .
docker compose start

# restauration
docker compose stop
docker run --rm -v cardinal_pflux-data:/data -v "$PWD":/backup debian:bookworm-slim \
  sh -c 'tar xzf /backup/pflux-backup.tgz -C /data && chown -R 10001:10001 /data'
docker compose start
```

Les flux se transfèrent sans secrets via *Exporter / Importer* dans l'interface.

## 7. Contraintes et points de vigilance

- **Conteneur** : utilisateur 10001, système de fichiers en lecture seule, `tmpfs` sur `/tmp`, `cap_drop: ALL`, `no-new-privileges`, seul `/data` est inscriptible.
- **Modules natifs** : `better-sqlite3` et `node-pty` sont compilés dans l'étape de build de l'image.
- **Sortie Claude** : le CLI est épinglé (`@anthropic-ai/claude-code` 2.1.307) ; une mise à jour du CLI doit passer par `npm test`.

## 8. Questions ouvertes

Ce que l'inventaire ne couvre pas :

- **Cible distante** : aucun serveur, hôte, système d'exploitation ni nom de domaine n'est défini. Tant qu'il n'y a pas de cible distante, seules les options A et C sont applicables.
- **Reverse proxy et certificat** : le choix du proxy (Caddy, nginx, Traefik…) et du mode d'obtention du certificat TLS n'est pas arrêté.
- **Serveur ntfy** : hébergé (`https://ntfy.sh`) ou local ? Si local, faut-il ajouter son hôte à `PFLUX_SSRF_ALLOWLIST` ?
- **Sauvegardes** : fréquence, rétention et destination des archives de `pflux-data` ne sont pas définies.
