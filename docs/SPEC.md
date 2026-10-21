# SPEC — Personnal Flux

> Nom du produit : **Personnal Flux** (slug `personnal-flux`, préfixe des variables d'environnement `PFLUX_`). L'application ne porte jamais d'autre nom, que ce soit dans l'UI, les docs, les notifications ou l'image Docker.

## Objectif

Personnal Flux est un outil de veille autonome, auto-hébergé et mono-utilisateur, sans système de comptes. L'utilisateur définit des **flux de veille** : un sujet et ses consignes en langage naturel, plus une source (RSS/Atom, OSV ou NVD). L'outil interroge chaque flux à la fréquence choisie. Il fait trier, prioriser et résumer les nouveautés par **Claude**, appelé via le CLI `claude` en mode headless, sans aucun outil et en traitant le contenu comme non fiable. Il produit ensuite des **digests lisibles façon article** et envoie des **notifications push ntfy** pour les éléments importants.

Le projet part de zéro. La stack (TypeScript/Node, Fastify, SQLite, Vite/React) est volontairement proche de pj-gen et gh-scanner, pour réutiliser les mêmes patterns d'appel à Claude et permettre plus tard une mise en commun de la gestion des sessions.

## Éléments différenciants (NON NÉGOCIABLES)

1. **Flux de veille pilotés par une consigne en langage naturel**, sur trois sources gratuites et sans clé obligatoire : **rss** (un ou plusieurs flux RSS/Atom), **osv** (CVE de dépendances : nom + écosystème) et **nvd** (CVE de produits par mots-clés, sévérité minimale optionnelle, clé optionnelle, limites de débit strictement respectées).
2. **Claude comme moteur de tri et de rédaction, durci contre l'injection de prompt** :
   - `claude -p` en sortie `stream-json`, **aucun outil** (`--strict-mcp-config` sans serveur, outils désactivés) ;
   - les données sont passées dans le prompt et délimitées explicitement comme données ;
   - la sortie est validée par un schéma JSON, puis rejetée et re-tentée si elle est invalide, et **jamais affichée brute** ;
   - rien n'est inventé : chaque élément cite ses URL sources réelles.
3. **Gestion des sessions Claude façon pj-gen** :
   - HOME/config dédiés dans `/data/claude-home`, environnement reconstruit explicitement (aucune variable héritée de l'hôte), télémétrie désactivée ;
   - connexion depuis l'UI (console WebSocket `claude /login`, ou clé API) ;
   - détection de « limite d'usage », « non authentifié » et « surcharge », avec **report automatique** du run au lieu d'un échec ;
   - budget en $ par run avec arrêt propre, tokens et coût affichés par run et cumulés.
4. **Ordonnanceur intégré et file d'exécution** :
   - un seul ordonnanceur, sans doublon, avec au plus 1 run de rattrapage par flux après un arrêt ;
   - « Lancer maintenant » ;
   - file avec concurrence réglable (1 par défaut), suivi en direct (étapes, logs) et annulation.
5. **Déduplication SHA-256** : un élément déjà vu (même URL normalisée ou même identifiant CVE) n'est ni re-résumé ni re-notifié.
6. **Digests façon article** : page HTML propre, thème clair/sombre, historique par flux, fil continu filtrable par priorité avec « marquer comme lu », export Markdown/JSON.
7. **Notifications ntfy** : serveur et sujet réglables globalement et/ou par flux, seuil de priorité, lien vers le digest via l'URL publique, bouton « tester ». Le serveur par défaut `https://ntfy.sh` **et** un ntfy anonyme auto-hébergé sur le LAN (via la liste blanche anti-SSRF) doivent fonctionner tous les deux.
8. **Sécurité testée** :
   - écoute sur 127.0.0.1 par défaut ; avec exposition, mot de passe obligatoire (refus de démarrer sinon), comparaison à temps constant, limitation des tentatives ;
   - cookie HttpOnly/SameSite=Lax/Secure, CSRF (Origin/Sec-Fetch-Site + jeton) ;
   - anti-SSRF complet, parseur XML sans entités externes ;
   - erreurs génériques côté client ;
   - secrets en permissions 600 et jamais réaffichés ;
   - conteneur durci, aucune ressource externe dans l'UI.

## Utilisateurs et cas d'usage

**Utilisateur unique** : une personne technique qui auto-héberge l'outil sur un serveur domestique ou un PC, derrière son propre reverse proxy HTTPS (Tailscale serve, Traefik) si elle l'expose.

Cas d'usage :
- **UC1 — Veille d'actualité** : un flux rss réunit 3 blogs sécurité, avec la consigne « m'intéressent les incidents majeurs et les nouvelles techniques d'attaque, ignorer les annonces marketing ». Toutes les 6 h, un digest est produit et les éléments « haute » sont notifiés.
- **UC2 — CVE de dépendances** : un flux osv suit `fastify` (npm), `django` (PyPI) et `golang.org/x/net` (Go). Chaque jour, les nouvelles vulnérabilités sont résumées avec leur sévérité et leurs liens.
- **UC3 — CVE de produits** : un flux nvd suit « WireGuard » et « Apple iOS » avec une sévérité minimale HIGH. Claude écarte les faux positifs (mot-clé apparu par hasard dans une description).
- **UC4 — Lecture** : l'utilisateur ouvre le lien ntfy sur son téléphone, lit le digest en thème sombre, consulte le fil, filtre sur « haute » et marque comme lu.
- **UC5 — Administration** : il connecte Claude depuis Réglages, configure son ntfy LAN, exporte ses flux en JSON pour les sauvegarder et les réimporte sur une autre machine.

## Fonctionnalités

### F1 — Modèle et CRUD des flux

Un flux comporte :
- `id`, `name`, `instructions` (consigne en langage naturel), `sourceType` (`rss|osv|nvd`), `sourceParams` (JSON validé par type) ;
- `frequencyHours` (1–720), `freshnessDays` (fenêtre de fraîcheur, 1–90), `enabled` ;
- `notify` (bool), `notifyThreshold` (`high|medium|low`), `ntfyServer?`/`ntfyTopic?` (surcharge par flux) ;
- `model` (défaut `sonnet`), `budgetUsd` (défaut 0,50) ;
- `createdAt`, `updatedAt`, `lastRunAt`, `nextRunAt`.

Paramètres par type de source :
- `rss` : `{ urls: string[] }`, de 1 à 20 URL ;
- `osv` : `{ packages: {name, ecosystem}[] }`, avec `ecosystem` ∈ PyPI, npm, Go, crates.io, Maven, NuGet, RubyGems, Packagist ;
- `nvd` : `{ keywords: string[], minSeverity?: LOW|MEDIUM|HIGH|CRITICAL }`.

Critères d'acceptation :
- [ ] L'UI liste les flux sous forme de cartes (nom, type, statut actif/pause, dernier run, prochain run, nombre d'éléments non lus) et prévoit des états vide, chargement et erreur.
- [ ] Création, édition, suppression (avec confirmation), duplication (« Copie de … », désactivée) et pause/reprise fonctionnent depuis l'UI.
- [ ] Le formulaire affiche une **aide contextuelle** propre au type de source : exemples d'URL RSS, liste des écosystèmes OSV, conseils de mots-clés NVD et effet de la clé NVD.
- [ ] Toute entrée invalide (fréquence hors bornes, liste vide, écosystème inconnu, URL non http(s)) est rejetée **côté serveur** par un schéma (zod), avec un message par champ.
- [ ] Rss : le bouton « Tester l'URL » récupère le flux via le client anti-SSRF et affiche « OK — N items » ou une erreur générique.
- [ ] L'export JSON de la liste des flux exclut ids et secrets. L'import JSON valide chaque entrée, crée les flux désactivés et rapporte les entrées rejetées sans faire échouer le lot.
- [ ] Au premier démarrage (base vide), 3 flux d'exemple sont créés, un par type, **tous désactivés**.

### F2 — Connecteurs de sources

Chaque connecteur implémente `fetch(params, ctx) → RawItem[]`, où `RawItem = {sourceKey, title, url, publishedAt?, content, meta}`.

Critères d'acceptation :
- [ ] **RSS/Atom** : parse RSS 2.0 et Atom 1.0 avec un parseur XML **sans entités externes ni DTD**. Un document contenant `<!ENTITY` est rejeté ou neutralisé (testé). Le contenu HTML est converti en texte brut tronqué (8 000 caractères max par item).
- [ ] **OSV** : `POST https://api.osv.dev/v1/querybatch`, puis le détail par id. La clé de dédup est l'id OSV, avec alias CVE quand il existe. Les URL de référence sont conservées.
- [ ] **NVD** : `GET https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=…&pubStartDate/pubEndDate` (fenêtre de fraîcheur, découpée si plus de 120 jours) avec pagination.
  - Sans clé : au plus 5 requêtes par fenêtre glissante de 30 s. Avec clé (header `apiKey`) : 50 requêtes / 30 s, via un limiteur partagé au niveau du processus et testé avec une horloge simulée.
  - Le filtre `minSeverity` s'applique sur le CVSS v3.1/v4.
  - La clé de dédup est l'identifiant CVE.
- [ ] Les items plus anciens que `freshnessDays` sont ignorés.
- [ ] Les erreurs réseau, HTTP ≥ 400 et de parsing sont journalisées côté serveur. Le run consigne l'étape en erreur pour la source concernée, sans planter le run si d'autres URL réussissent.
- [ ] Les tests de parsing tournent sur des **fixtures locales** (RSS, Atom, OSV, NVD, XML malveillant), sans réseau.

### F3 — Client HTTP anti-SSRF

Critères d'acceptation :
- [ ] Seuls `http:` et `https:` sont acceptés. Tout autre schéma (file, ftp, gopher, data…) est refusé.
- [ ] La résolution DNS se fait avant connexion, et la connexion utilise **l'IP résolue** (pas de re-résolution, protection contre le DNS rebinding). Sont refusés :
  - le loopback (127.0.0.0/8, ::1) ;
  - les plages privées RFC1918, CGNAT 100.64/10 et les ULA fc00::/7 ;
  - le link-local 169.254/16 et fe80::/10, ce qui inclut 169.254.169.254 et les métadonnées cloud ;
  - 0.0.0.0/8, le multicast et les adresses IPv4 mappées en IPv6 vers ces plages.
- [ ] La liste blanche `PFLUX_SSRF_ALLOWLIST` (séparateur virgule) accepte des entrées `IP:port`, `IP` ou CIDR, par exemple `192.168.1.20:8080`. Une cible privée n'est autorisée que si elle correspond à une entrée.
- [ ] Les redirections sont suivies manuellement (5 max), et chaque saut est revalidé selon les mêmes règles.
- [ ] La taille de réponse est bornée (`PFLUX_FETCH_MAX_BYTES`, défaut 5 Mo) et la durée aussi (`PFLUX_FETCH_TIMEOUT_MS`, défaut 15 000). Un dépassement interrompt le flux.
- [ ] Ce client sert pour RSS, ntfy, OSV et NVD.
- [ ] Les tests couvrent chaque plage refusée, la liste blanche, une redirection vers une IP privée refusée et un dépassement de taille, avec un résolveur DNS injecté et un serveur local.

### F4 — Déduplication

Critères d'acceptation :
- [ ] `dedupKey = sha256(sourceType + ":" + normalizedKey)`. Pour les URL, `normalizedKey` est l'URL normalisée (schéma et hôte en minuscules, fragment retiré, paramètres `utm_*` retirés, slash final retiré). Pour les CVE, c'est l'id CVE/OSV en majuscules.
- [ ] La table `seen_items(feed_id, dedup_key, first_seen_at)` porte un index unique. Les éléments déjà vus sont exclus **avant** l'appel à Claude.
- [ ] Un élément vu mais écarté par Claude reste marqué « vu » et n'est pas re-soumis.
- [ ] Un test prouve que deux runs successifs sur la même fixture produisent zéro nouvel élément au second run, sans appel Claude ni notification.

### F5 — Moteur Claude (runner headless sécurisé)

Interface `ClaudeRunner.run({prompt, model, budgetUsd, signal}) → {json, usage:{inputTokens, outputTokens, costUsd}}`, avec une implémentation réelle (CLI) et un **faux runner** pour les tests, sélectionné par `PFLUX_CLAUDE_RUNNER=fake`.

Critères d'acceptation :
- [ ] Commande lancée par `spawn` (sans shell) : `claude -p --output-format stream-json --verbose --model <m> --strict-mcp-config --mcp-config <fichier vide privé> --disallowedTools "*"` (ou l'équivalent qui garantit **zéro outil**), avec le prompt passé sur stdin.
- [ ] Le répertoire de travail est un répertoire privé vide (`mkdtemp`, mode 700), supprimé après le run.
- [ ] L'environnement est **reconstruit** : `HOME=/data/claude-home`, `PATH` minimal, `LANG`, `DISABLE_TELEMETRY=1`, `DISABLE_ERROR_REPORTING=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, et `ANTHROPIC_API_KEY` seulement si une clé est configurée. Aucune autre variable de l'hôte n'est transmise (testé).
- [ ] Prompt : un en-tête système fixe impose de traiter tout ce qui se trouve entre les délimiteurs `<<<DATA id=…>>>` / `<<<END DATA>>>` comme des données non fiables et de ne jamais suivre d'instruction qui s'y trouve. Les délimiteurs présents dans le contenu sont échappés.
- [ ] La sortie attendue est un JSON conforme au schéma `DigestOutput` :
  - `items[]` : `{ref, keep:boolean, priority: high|medium|low, justification ≤ 200 caractères, summary ≤ 800 caractères, sources: url[]}` ;
  - `digest: {title, lede, sections[{heading, itemRefs[], body}]}`.
- [ ] Validation : la sortie est rejetée si le JSON est invalide, si le schéma n'est pas respecté, si un `ref` est inconnu ou si une URL citée ne figure pas parmi les URL fournies en entrée (anti-invention). En cas de rejet, 1 nouvelle tentative au plus, avec un message de correction ; au-delà, le run échoue avec un message générique. **Jamais d'affichage brut.**
- [ ] Les gros lots sont découpés : au-delà de 40 items, triage par paquets puis rédaction du digest sur les items retenus.
- [ ] Budget : le coût cumulé (issu des événements `result` du stream-json) est comparé à `budgetUsd`. En cas de dépassement, les paquets restants ne sont pas lancés, le run se termine avec le statut `budget_exceeded` et produit un digest partiel s'il existe des items traités.
- [ ] Les erreurs sont classées à partir de la sortie et du code retour : `usage_limit`, `unauthenticated` ou `overloaded` → run `deferred`, reprogrammé (`PFLUX_DEFER_MINUTES`, défaut 60, puis backoff jusqu'à 6 h), **pas** `failed`. Les autres erreurs donnent `failed`. Testé avec des sorties simulées.
- [ ] Tokens et coût sont enregistrés par run et affichés par run, cumulés par flux et cumulés globalement.

### F6 — Ordonnanceur et file d'exécution

Critères d'acceptation :
- [ ] Un seul ordonnanceur par processus, protégé par un verrou (fichier lock `O_EXCL` dans `/data`, avec PID et contrôle d'obsolescence). Un second processus démarré sur le même volume ne lance pas d'ordonnanceur (testé).
- [ ] Toutes les 60 s (`PFLUX_SCHEDULER_TICK_S`), chaque flux actif dont `nextRunAt ≤ now` est mis en file, sauf s'il y a déjà un run `queued|running` pour ce flux (pas de doublon, testé).
- [ ] Rattrapage : après un arrêt, un flux en retard d'une ou plusieurs périodes produit **un seul** run, puis `nextRunAt = now + frequency` (testé avec une horloge simulée).
- [ ] La file a une concurrence `PFLUX_MAX_CONCURRENT_RUNS` (défaut 1). Elle est persistée : les runs `running` au démarrage repassent en `queued`.
- [ ] « Lancer maintenant » met le flux en file, même s'il est en pause. Il répond 409 si un run est déjà actif pour ce flux.
- [ ] Les étapes du run (`fetch`, `dedup`, `triage`, `digest`, `notify`) et les logs horodatés sont visibles **en direct** dans l'UI via WebSocket (ou SSE). Les logs sont assainis : aucun secret, aucun contenu brut d'exception.
- [ ] L'annulation est possible en file comme en cours. Elle tue le processus `claude` (par son PID, via AbortSignal) et le run passe en `cancelled`.
- [ ] Statuts : `queued`, `running`, `succeeded`, `failed`, `deferred`, `cancelled`, `budget_exceeded`.

### F7 — Digests, fil et exports

Critères d'acceptation :
- [ ] Un digest est créé par run réussi qui contient au moins 1 élément retenu. Un run sans nouveauté est enregistré comme « aucune nouveauté », sans digest vide.
- [ ] La page digest (`/digests/:id`) est une page « article » : titre, date dans le fuseau configuré, chapeau, sections, et pour chaque élément un badge de priorité, la justification, le résumé et des liens sources cliquables (`rel="noopener noreferrer"`, `target="_blank"`).
- [ ] Tout texte issu de Claude ou des sources est **échappé** : rendu React sans `dangerouslySetInnerHTML`. Si du Markdown est rendu, il passe par un rendu assaini sans HTML brut. Un test d'injection `<script>` le vérifie.
- [ ] Un thème clair/sombre suit `prefers-color-scheme`, avec bascule manuelle mémorisée.
- [ ] L'historique des digests par flux est paginé.
- [ ] Le fil par flux affiche les éléments retenus, les plus récents en tête. Il est filtrable par priorité et par lu/non lu, avec « marquer comme lu » (unitaire et « tout marquer lu »).
- [ ] Export d'un digest : `GET /api/digests/:id/export.md` et `.json`, avec `Content-Disposition: attachment`. Le contenu reprend les éléments et leurs sources.
- [ ] Toutes les vues prévoient des états vide, chargement et erreur.
- [ ] Purge optionnelle : `PFLUX_RETENTION_DAYS` (ou le réglage UI ; 0 = tout conserver, c'est le défaut). Elle supprime runs, digests et éléments plus anciens, mais conserve `seen_items` pour ne pas re-notifier.

### F8 — Notifications ntfy

Critères d'acceptation :
- [ ] Le serveur et le sujet globaux se règlent dans Réglages (défaut serveur `https://ntfy.sh`, sujet vide = désactivé) et peuvent être surchargés par flux. Jeton optionnel (`PFLUX_NTFY_TOKEN` ou saisie UI) envoyé en `Authorization: Bearer`. Sans jeton, l'envoi est anonyme.
- [ ] Après un run, une notification part pour chaque **nouvel** élément de priorité ≥ seuil, dans la limite de 5 par run. Au-delà, une notification récapitulative est envoyée.
- [ ] Contenu de la notification :
  - titre : `[Personnal Flux] <flux> — <titre élément>` ;
  - corps : résumé court (≤ 300 caractères) ;
  - `Priority` ntfy mappée (high→4, medium→3, low→2) ;
  - `Click` vers `<PFLUX_PUBLIC_URL>/digests/:id` si l'URL publique est définie, sans lien sinon.
- [ ] L'envoi passe par le client anti-SSRF. Un ntfy LAN fonctionne seulement si son `IP:port` figure dans `PFLUX_SSRF_ALLOWLIST` ; sinon, l'erreur est explicite et générique (« destination refusée par la politique réseau »).
- [ ] Le bouton « Tester la notification » (global et par flux) envoie un message de test et affiche succès ou échec générique.
- [ ] Un échec ntfy ne fait pas échouer le run : il est consigné à l'étape `notify`.
- [ ] Un test d'intégration utilise un faux serveur ntfy local (sur une IP de la liste blanche) et vérifie les en-têtes et le corps.

### F9 — Réglages et connexion Claude

Critères d'acceptation :
- [ ] La page Réglages comporte :
  - le statut Claude (connecté / non connecté / clé API) avec le bouton « Revérifier », qui lance un appel minimal sans outil ;
  - le serveur, le sujet et le jeton ntfy ;
  - la clé NVD ;
  - l'URL publique ;
  - le fuseau horaire (IANA, validé) ;
  - la concurrence et la rétention.
- [ ] **Console de connexion** : un terminal intégré (xterm.js empaqueté localement) relié par WebSocket à un pty (`node-pty`) qui exécute `claude /login`, avec le même HOME et le même environnement reconstruit que le runner.
  - Une seule console à la fois, fermée automatiquement après 10 min d'inactivité.
  - WebSocket authentifié, avec vérification de l'`Origin`.
- [ ] Clé API Anthropic : saisie dans l'UI ou via `PFLUX_ANTHROPIC_API_KEY`.
- [ ] **Aucun secret n'est réaffiché** : l'API ne renvoie que `{configured: true, source: "env"|"ui"}`. Le champ propose « Remplacer » et « Effacer ».
- [ ] Les secrets saisis dans l'UI sont stockés dans `/data/secrets.json`, en mode **600** et écrits de façon atomique (fichier temporaire privé puis rename). Ils ne sont jamais écrits en base ni dans les logs (testé : mode de fichier, absence dans la réponse API).
- [ ] Une variable d'environnement prime sur une valeur saisie dans l'UI, et l'UI l'indique.

### F10 — Sécurité d'accès et durcissement HTTP

Critères d'acceptation :
- [ ] Par défaut, l'écoute se fait sur `127.0.0.1:${PFLUX_PORT:-8787}`, sans authentification (accès local). La variable `PFLUX_HOST` est ignorée sauf si `PFLUX_EXPOSE=1`.
- [ ] `PFLUX_EXPOSE=1` → écoute sur `0.0.0.0`, et `PFLUX_PASSWORD` (≥ 12 caractères) est **obligatoire** : sinon, le processus quitte au démarrage avec un message clair et un code ≠ 0 (testé). Aucun mécanisme de « premier venu ».
- [ ] En mode exposé, toutes les routes (API, WS, pages, exports) sauf `/login`, `/api/auth/login` et `/healthz` renvoient 401 (API) ou une redirection vers la page de login sans session (testé sur un échantillon de routes, dont WebSocket).
- [ ] Le mot de passe est comparé à temps constant (`crypto.timingSafeEqual` sur des condensats de même longueur). La limitation des tentatives est de 5 échecs par 15 min et par IP, puis 429, avec un délai progressif (testé).
- [ ] Cookie de session signé (HMAC), `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` si la requête est en HTTPS (ou `X-Forwarded-Proto: https` quand `PFLUX_TRUST_PROXY=1`). Durée de 30 jours. Déconnexion possible.
- [ ] Secret de session : `PFLUX_SESSION_SECRET` (≥ 32 octets), sinon 32 octets générés par `crypto.randomBytes` et stockés dans `/data/session.key` en mode 600. Il n'est jamais stocké en base.
- [ ] CSRF sur **toutes** les mutations (POST/PUT/PATCH/DELETE), y compris en mode local :
  - refus si `Sec-Fetch-Site` vaut `cross-site`, ou si `Origin` est présent et différent de l'origine de l'appli ou de `PFLUX_PUBLIC_URL` ;
  - en-tête `X-CSRF-Token` obligatoire, égal au jeton lié à la session (ou, en mode local, au jeton émis par `/api/csrf`) ;
  - testé : absence de jeton → 403, mauvaise Origin → 403.
- [ ] Gestionnaire d'erreurs global : les erreurs internes sont journalisées côté serveur avec un id de corrélation. Le client reçoit `{error: "internal_error", requestId}`, sans message ni trace d'exception (testé en provoquant une exception).
- [ ] En-têtes de sécurité :
  - CSP stricte `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'` ;
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
- [ ] L'UI ne charge **aucune** ressource externe (CDN, police, script, image distante). Un test vérifie que le HTML et les assets construits ne contiennent aucune URL `http(s)://` de chargement.
- [ ] `/healthz` renvoie `{ok:true}` sans information sensible.

### F11 — Livrable, CI et documentation

Critères d'acceptation :
- [ ] `Dockerfile` multi-étapes : `node:22-bookworm-slim` épinglé par digest, `npm ci`, installation du CLI `claude` via npm (version épinglée dans `package.json`/lockfile), aucun `curl | sh`, utilisateur non-root (uid 10001), `EXPOSE 8787`. Le `HEALTHCHECK` est un script **Node** (`node dist/healthcheck.js`), sans curl ni wget.
- [ ] `docker-compose.yml` :
  - une image, un volume nommé monté sur `/data` ;
  - `read_only: true` avec `tmpfs` pour `/tmp`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]` ;
  - aucun montage de l'hôte, aucun `docker.sock` ;
  - port publié par défaut sur `127.0.0.1:8787:8787` ;
  - variables `PFLUX_*` documentées dans `.env.example`, et `PFLUX_HOST=0.0.0.0` interne au conteneur avec un bind sur l'hôte en local.
- [ ] `npm run ci` enchaîne lint (ESLint), typecheck (`tsc --noEmit`), tests (unitaires, intégration, e2e) et build.
- [ ] `docs/ci/workflow.example.yml` : `permissions: contents: read`, déclencheurs `push`/`pull_request` (**pas** de `pull_request_target`), actions épinglées par SHA, jobs `npm ci` + `npm run ci` + `docker build`. **Aucun fichier dans `.github/workflows/`.**
- [ ] Le `package-lock.json` est versionné, et toutes les dépendances sont épinglées en version exacte.
- [ ] README en français :
  - installation serveur (docker compose) et PC (Node 22 : `npm ci && npm run build && npm start`) ;
  - connexion Claude (console ou clé API) ;
  - création d'un premier flux rss, osv et nvd, et guide « quel type de source choisir » ;
  - notifications ntfy (ntfy.sh, et ntfy LAN anonyme avec l'exemple `PFLUX_SSRF_ALLOWLIST=192.168.1.20:8080`) ;
  - section générique « Derrière un reverse proxy HTTPS » (`PFLUX_EXPOSE`, `PFLUX_PASSWORD`, `PFLUX_TRUST_PROXY`, `PFLUX_PUBLIC_URL`) ;
  - sauvegarde et restauration du volume `/data` ;
  - tableau des variables d'environnement ;
  - modèle de menaces et limites connues.
- [ ] Page `docs/DONNEES-ENVOYEES.md`, « Ce que ce logiciel envoie et à qui » : Anthropic (contenu des items et consignes), OSV (noms de paquets et écosystèmes), NVD (mots-clés, clé si fournie), serveurs des flux RSS configurés (requêtes GET), ntfy (titres et résumés). Elle précise l'absence de télémétrie.

## Contraintes techniques

- **Stack** : Node 22 LTS, TypeScript strict, Fastify (+ `@fastify/websocket`, `@fastify/static`), SQLite via `better-sqlite3` avec des migrations SQL numérotées appliquées au démarrage, zod pour la validation, Vite + React pour le front, xterm.js et node-pty pour la console, Vitest pour les tests unitaires et d'intégration, Playwright (Chromium) pour l'e2e.
- **Modularité** : des frontières explicites, chaque module exposant une interface typée documentée dans `docs/INTERFACES.md`.
  - `config` (lecture et validation des `PFLUX_*`) ;
  - `db` (dépôts) ;
  - `net` (client anti-SSRF) ;
  - `sources/{rss,osv,nvd}` ;
  - `dedup` ;
  - `claude` (runner réel/faux, prompt, schéma, classification d'erreurs) ;
  - `pipeline` (orchestration d'un run) ;
  - `scheduler` et `queue` ;
  - `notify/ntfy` ;
  - `secrets` ;
  - `auth` (session, CSRF, rate-limit) ;
  - `http` (routes) ;
  - `web` (front).
- **Configuration exclusivement par variables d'environnement** : `PFLUX_PORT`, `PFLUX_HOST`, `PFLUX_EXPOSE`, `PFLUX_PASSWORD`, `PFLUX_SESSION_SECRET`, `PFLUX_TRUST_PROXY`, `PFLUX_PUBLIC_URL`, `PFLUX_DATA_DIR` (défaut `/data` ; `./data` en dev), `PFLUX_SSRF_ALLOWLIST`, `PFLUX_FETCH_MAX_BYTES`, `PFLUX_FETCH_TIMEOUT_MS`, `PFLUX_MAX_CONCURRENT_RUNS`, `PFLUX_SCHEDULER_TICK_S`, `PFLUX_DEFER_MINUTES`, `PFLUX_RETENTION_DAYS`, `PFLUX_TZ`, `PFLUX_DEFAULT_MODEL`, `PFLUX_DEFAULT_BUDGET_USD`, `PFLUX_ANTHROPIC_API_KEY`, `PFLUX_NVD_API_KEY`, `PFLUX_NTFY_TOKEN`, `PFLUX_CLAUDE_BIN`, `PFLUX_CLAUDE_RUNNER` (`cli|fake`), `PFLUX_LOG_LEVEL`. Toute valeur invalide fait échouer le démarrage avec un message clair.
- **Aucun service payant requis** hors abonnement Claude de l'utilisateur. OSV, NVD et ntfy.sh sont gratuits.
- **Docker n'est pas requis pour tester** : `npm ci && npm test` suffit en local.
- **Aucun test ne dépend du réseau** ni d'un vrai compte Claude : fixtures locales, serveurs HTTP locaux, résolveur DNS injecté, faux runner Claude scriptable (sorties valides, invalides, `usage_limit`, dépassement de budget).
- **Test e2e** (Playwright, branché sur `npm test`) : il démarre l'appli sur un port dédié avec `PFLUX_CLAUDE_RUNNER=fake` et un répertoire de données temporaire. Il sert une fixture RSS en local (IP en liste blanche), crée un flux rss, clique « Lancer maintenant », attend le statut `succeeded`, ouvre le digest, vérifie les liens sources, puis marque un élément comme lu. Le processus est arrêté par son PID.
- **Fichiers temporaires** : uniquement via `fs.mkdtemp` (répertoires privés en 700). Aucun chemin prévisible.
- **Journalisation** par pino sur stdout, avec masquage des clés sensibles (`authorization`, `apiKey`, `password`, `token`, `cookie`).
- **Aucune télémétrie** dans l'application, et télémétrie Claude désactivée.

## Hors périmètre

- Comptes multiples, inscription, rôles, SSO/OAuth.
- Fournisseurs d'IA autres que Claude, et modèles locaux.
- Sources autres que rss, osv et nvd (GitHub Advisories, scraping HTML, réseaux sociaux, e-mail).
- Canaux de notification autres que ntfy (e-mail, Slack, Telegram, webhooks génériques).
- Déploiement automatisé (SSH, Ansible) et configuration de reverse proxy fournie (pas d'exemple Caddy ou Traefik obligatoire, seulement une doc générique).
- Métriques Prometheus, traçage distribué, export de journaux structurés.
- Application mobile, PWA hors ligne, recherche plein texte avancée.
- Écriture de fichiers dans `.github/workflows/` (workflow fourni en exemple seulement).
- Mise en commun effective du code de session Claude avec pj-gen/gh-scanner (le module `claude` est seulement conçu pour être extractible).

## Critères de terminaison (definition of done)

1. `npm ci && npm run ci` passe en local sans réseau externe ni compte Claude. Lint, typecheck, tests unitaires, tests d'intégration, e2e Playwright et build réussissent.
2. Toutes les fonctionnalités F1 à F11 respectent leurs critères d'acceptation. Les exigences de sécurité suivantes sont couvertes chacune par au moins un test automatisé :
   - refus de démarrer exposé sans mot de passe ;
   - 401 sans session en mode exposé (HTTP et WS) ;
   - rate-limit du login ;
   - CSRF (jeton manquant, Origin étrangère) ;
   - SSRF (chaque famille de plages, redirection, allowlist, taille max) ;
   - XML à entités externes ;
   - absence de fuite d'exception ;
   - secrets non réaffichés et fichier en mode 600 ;
   - environnement Claude reconstruit et sans outils ;
   - rejet d'une sortie Claude invalide ou d'une URL inventée ;
   - échappement HTML du digest.
3. Les tests prouvent le comportement de la dédup (pas de re-résumé ni re-notification), de l'ordonnanceur (pas de doublon, rattrapage d'un seul run, verrou unique) et du report automatique (`usage_limit`, `unauthenticated` et `overloaded` donnent `deferred`).
4. `docker compose up` construit et démarre l'image. Le conteneur tourne non-root, en rootfs lecture seule, avec `cap_drop ALL` et `no-new-privileges`, et le healthcheck Node passe à `healthy`. L'UI est accessible sur `127.0.0.1:8787`.
5. Au premier démarrage, l'UI affiche les 3 flux d'exemple désactivés. Toutes les vues (flux, run en direct, digest, fil, historique, réglages) ont des états vide, chargement et erreur.
6. Les documents suivants sont présents :
   - README français complet ;
   - `docs/DONNEES-ENVOYEES.md` ;
   - `.env.example` ;
   - `docs/ci/workflow.example.yml` (permissions minimales, sans `pull_request_target`) ;
   - `docs/ARCHITECTURE.md` et `docs/INTERFACES.md` à jour.

   Aucun fichier n'existe sous `.github/workflows/`.
7. Le nom « Personnal Flux » est utilisé partout et le préfixe `PFLUX_` est utilisé pour toutes les variables d'environnement.
