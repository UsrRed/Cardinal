# ARCHITECTURE — Cardinal

> Carte du dépôt. Pour localiser un module, partir de la section « Structure de fichiers ». Les contrats sont dans `docs/INTERFACES.md`.

## 1. Stack retenue

| Couche | Choix | Pourquoi |
|---|---|---|
| Runtime | Node 22 LTS, TypeScript strict (ESM, `"type":"module"`) | Imposé par la SPEC, même base que pj-gen/gh-scanner |
| HTTP/WS | Fastify 5 + `@fastify/websocket`, `@fastify/static`, `@fastify/cookie` | Hooks (auth, CSRF, en-têtes), schémas, WS natif |
| Base | SQLite via `better-sqlite3` (synchrone, WAL), migrations SQL numérotées | Mono-utilisateur, zéro service, transactions simples |
| Validation | zod | Validation des env, des entrées API et de la sortie Claude |
| XML | `fast-xml-parser` (`processEntities:false`, pas de DTD) + pré-rejet `<!DOCTYPE`/`<!ENTITY` | Aucune résolution d'entités externes |
| Réseau | `node:http`/`node:https` + `net.BlockList` (sans dépendance) | Contrôle exact de la résolution DNS et de l'IP de connexion (anti-rebinding) |
| Logs | pino (stdout, `redact`) | Imposé ; masquage des clés sensibles |
| Console | `node-pty` côté serveur, `@xterm/xterm` + `@xterm/addon-fit` côté front (empaquetés par Vite) | Console `claude /login` dans l'UI |
| CLI Claude | `@anthropic-ai/claude-code` (version exacte, binaire `node_modules/.bin/claude`) | Installé par npm, pas de `curl \| sh` |
| Front | Vite + React 18 + `react-router-dom` ; CSS pur reprenant les tokens de `docs/design/` | La maquette définit un style éditorial précis ; un framework CSS serait superflu |
| Tests | Vitest (unitaires + intégration, `fastify.inject`, serveurs HTTP locaux), Playwright Chromium (e2e) | Rapides, sans réseau |
| Qualité | ESLint (flat config, `typescript-eslint`, `eslint-plugin-react-hooks`), `tsc --noEmit` | `npm run ci` |
| Dev | `tsx` (script `dev` uniquement) | Rechargement du serveur en dev |

Aucune autre dépendance. Pas de helmet (en-têtes posés par un hook de 20 lignes), pas de lib de rate-limit (règle spécifique 5/15 min + délai progressif), pas de lib cron (tick 60 s), pas de rendu Markdown (le corps des sections est rendu en paragraphes de texte échappé).

## 2. Structure de fichiers

```
.
├── package.json / package-lock.json     # versions exactes, scripts (cf. §8)
├── tsconfig.json                         # base strict
├── tsconfig.server.json                  # src/ → dist/ (exclut web/)
├── tsconfig.web.json                     # web/ (noEmit, jsx)
├── vite.config.ts                        # root=web/, outDir=dist/web
├── vitest.config.ts                      # tests/unit + tests/integration
├── playwright.config.ts                  # tests/e2e, chromium, sans webServer (géré par le setup)
├── eslint.config.js
├── Dockerfile / docker-compose.yml / .dockerignore / .env.example
├── README.md                             # FR
├── docs/
│   ├── SPEC.md ARCHITECTURE.md INTERFACES.md PROGRESS.md tasks.json
│   ├── DONNEES-ENVOYEES.md
│   ├── ci/workflow.example.yml
│   └── design/                           # maquette de référence (ne pas modifier)
├── migrations/
│   └── 001_init.sql                      # 00N_*.sql appliquées au démarrage, dans l'ordre
├── src/
│   ├── index.ts                          # point d'entrée: loadConfig → openDb → migrate → seed → buildApp → lock+scheduler → listen
│   ├── healthcheck.ts                    # → dist/healthcheck.js (GET /healthz sur 127.0.0.1:PORT, exit 0/1)
│   ├── app.ts                            # buildApp(deps): Fastify + plugins + routes (utilisé par tests)
│   ├── deps.ts                           # type AppDeps + createDeps(config) (composition root)
│   ├── shared/
│   │   ├── types.ts                      # types partagés serveur/front (Feed, Run, Digest, Item, statuts…)
│   │   ├── schemas.ts                    # zod: FeedInput, sourceParams, SettingsPatch… (importé par web/ aussi)
│   │   ├── clock.ts                      # Clock (systemClock, FakeClock pour tests)
│   │   └── errors.ts                     # AppError(code,status), PublicErrorCode
│   ├── config/
│   │   └── index.ts                      # loadConfig(env) → Config (zod), ConfigError
│   ├── log/
│   │   └── logger.ts                     # createLogger(level) pino + redact ; sanitizeLogMessage()
│   ├── db/
│   │   ├── index.ts                      # openDb(path), migrate(db, dir), Db type
│   │   ├── seed.ts                       # 3 flux d'exemple désactivés si table feeds vide
│   │   └── repos/
│   │       ├── feeds.ts                  # FeedsRepo
│   │       ├── runs.ts                   # RunsRepo (+ run_logs, usage cumulée)
│   │       ├── digests.ts                # DigestsRepo
│   │       ├── items.ts                  # ItemsRepo (éléments retenus, lu/non lu)
│   │       ├── seen.ts                   # SeenRepo (seen_items)
│   │       ├── settings.ts               # SettingsRepo (réglages UI non secrets)
│   │       └── retention.ts              # purge(olderThan)
│   ├── net/
│   │   ├── ipPolicy.ts                   # isBlockedAddress, parseAllowlist, isAllowlisted
│   │   └── safeFetch.ts                  # createSafeFetch(opts) → SafeFetch ; SsrfError
│   ├── sources/
│   │   ├── types.ts                      # RawItem, SourceConnector, SourceContext
│   │   ├── index.ts                      # getConnector(sourceType)
│   │   ├── htmlText.ts                   # htmlToText(html, max=8000)
│   │   ├── xml.ts                        # parseXmlSafe(text) (rejet DTD/ENTITY)
│   │   ├── rss.ts                        # RSS 2.0 + Atom 1.0 ; testFeedUrl()
│   │   ├── osv.ts                        # querybatch + /v1/vulns/{id}
│   │   ├── nvd.ts                        # fenêtres ≤120 j, pagination, filtre CVSS
│   │   └── rateLimiter.ts                # SlidingWindowLimiter (singleton process pour NVD)
│   ├── dedup/
│   │   └── index.ts                      # normalizeUrl, dedupKey, filterUnseen
│   ├── claude/                           # conçu pour être extractible (aucun import de db/http)
│   │   ├── types.ts                      # ClaudeRunner, RunRequest, RunResult, ClaudeError
│   │   ├── env.ts                        # buildClaudeEnv(opts) (env reconstruit)
│   │   ├── args.ts                       # buildClaudeArgs(model, mcpConfigPath)
│   │   ├── cliRunner.ts                  # CliClaudeRunner (spawn, stdin, stream-json, AbortSignal)
│   │   ├── fakeRunner.ts                 # FakeClaudeRunner scriptable (+ mode auto pour e2e)
│   │   ├── streamJson.ts                 # parseStreamJson(lines) → {text, usage, isError}
│   │   ├── classify.ts                   # classifyError(stdout, stderr, code) → ClaudeErrorKind
│   │   ├── prompt.ts                     # SYSTEM_HEADER, escapeDelimiters, buildTriagePrompt, buildDigestPrompt
│   │   ├── outputSchema.ts               # zod TriageOutput, DigestOutput, validateOutput (anti-invention)
│   │   ├── engine.ts                     # runTriageAndDigest(): lots de 40, 1 retry, budget
│   │   └── status.ts                     # checkClaudeStatus() (appel minimal sans outil)
│   ├── pipeline/
│   │   ├── index.ts                      # executeRun(runId, ctx) : fetch→dedup→triage→digest→notify
│   │   └── runEvents.ts                  # RunEventBus (EventEmitter typé) → WS
│   ├── queue/
│   │   └── index.ts                      # RunQueue (persistée en DB, concurrence, annulation)
│   ├── scheduler/
│   │   ├── index.ts                      # Scheduler (tick, rattrapage 1 run, defer backoff)
│   │   └── lock.ts                       # acquireLock(dataDir) O_EXCL + PID + obsolescence
│   ├── notify/
│   │   └── ntfy.ts                       # NtfyNotifier: send, sendTest, notifyRun
│   ├── secrets/
│   │   └── index.ts                      # SecretsStore (/data/secrets.json 600, atomique, env prioritaire)
│   ├── auth/
│   │   ├── session.ts                    # sign/verify cookie HMAC, SessionStore, loadSessionSecret
│   │   ├── password.ts                   # verifyPassword (timingSafeEqual sur sha256)
│   │   ├── rateLimit.ts                  # LoginRateLimiter (5/15 min/IP, délai progressif)
│   │   ├── csrf.ts                       # csrfToken(sessionId), checkOrigin, csrf hook
│   │   └── plugin.ts                     # plugin Fastify: auth gate + CSRF + en-têtes de sécurité
│   ├── mcp/
│   │   └── tools.ts                      # outils MCP (flux) : list/get/test-url/create/update/set-enabled/run
│   ├── console/
│   │   └── loginConsole.ts               # LoginConsole: pty unique `claude /login`, inactivité 10 min
│   └── http/
│       ├── errors.ts                     # setErrorHandler global (requestId, réponses génériques)
│       ├── static.ts                     # @fastify/static dist/web + fallback SPA
│       └── routes/
│           ├── health.ts                 # /healthz
│           ├── auth.ts                   # /api/auth/*, /api/csrf
│           ├── feeds.ts                  # CRUD, duplicate, pause, run-now, test-url, test-notify, export/import
│           ├── runs.ts                   # liste, détail, logs, cancel
│           ├── digests.ts                # liste, détail, export.md/json
│           ├── items.ts                  # fil, marquer lu
│           ├── settings.ts               # réglages, secrets, statut Claude, test ntfy
│           ├── stats.ts                  # usage cumulée
│           ├── ws.ts                     # /api/ws/runs, /api/ws/console
│           └── mcp.ts                    # /mcp : JSON-RPC MCP sans état, Bearer PFLUX_MCP_TOKEN
├── web/
│   ├── index.html                        # aucune ressource externe
│   └── src/
│       ├── main.tsx  App.tsx             # routes + Shell
│       ├── api/client.ts                 # fetch wrapper (X-CSRF-Token, 401→/login), types depuis src/shared
│       ├── api/ws.ts                     # useRunEvents(runId?) reconnectant
│       ├── hooks/useAsync.ts             # {data,error,loading,reload}
│       ├── theme/theme.ts                # prefers-color-scheme + bascule localStorage (classe .dark)
│       ├── styles/tokens.css             # tokens de la maquette (:root / .dark)
│       ├── styles/app.css                # shell, mast, btn, seg, stamp, prio, feeds, tape, stats, log, runs, article
│       ├── components/
│       │   ├── Shell.tsx Sidebar.tsx Masthead.tsx
│       │   ├── StatusStamp.tsx PriorityBadge.tsx SourceStamp.tsx
│       │   ├── FeedCard.tsx MiniTape.tsx PipelineTape.tsx StatsBar.tsx LogView.tsx RunList.tsx
│       │   ├── States.tsx                # <Loading/> <Empty/> <ErrorState/> (obligatoires sur chaque vue)
│       │   ├── ConfirmDialog.tsx Pagination.tsx SegFilter.tsx SecretField.tsx
│       │   ├── SourceHelp.tsx            # aide contextuelle rss/osv/nvd
│       │   ├── SafeText.tsx              # paragraphes de texte échappé (pas de dangerouslySetInnerHTML)
│       │   └── LoginTerminal.tsx         # xterm.js + WS console (bouton Coller + champ de repli)
│       └── pages/
│           ├── FeedsPage.tsx             # "/" cartes flux, export/import
│           ├── FeedFormPage.tsx          # "/feeds/new", "/feeds/:id/edit"
│           ├── FeedDetailPage.tsx        # "/feeds/:id" (onglets: fil, digests, runs)
│           ├── RunPage.tsx               # "/runs/:id" suivi en direct
│           ├── DigestPage.tsx            # "/digests/:id" article
│           ├── StreamPage.tsx            # "/stream" fil global filtrable
│           ├── RunsPage.tsx              # "/runs" historique + coûts cumulés
│           ├── SettingsPage.tsx          # "/settings"
│           └── LoginPage.tsx             # "/login" (mode exposé)
└── tests/
    ├── fixtures/                         # rss2.xml atom.xml xxe.xml billion-laughs.xml osv-*.json nvd-*.json claude/*.jsonl
    ├── helpers/                          # tmpDataDir(), fakeDns(), localServer(), buildTestApp()
    ├── unit/                             # config, ipPolicy, dedup, xml, rss, osv, nvd, rateLimiter, prompt, outputSchema, classify, env/args, session, csrf, password, secrets, digest-escape (renderToStaticMarkup)
    ├── integration/                      # safeFetch, pipeline (dedup 2 runs), scheduler+lock, queue/cancel, ntfy, http (auth exposé 401/WS, CSRF, rate-limit, erreurs génériques, secrets), startup (exit≠0), no-external-assets
    └── e2e/
        ├── global-setup.ts               # mkdtemp data, serveur fixture RSS 127.0.0.1, spawn `node dist/index.js` (PID mémorisé)
        ├── global-teardown.ts            # kill(PID)
        └── flow.spec.ts                  # créer flux rss → Lancer maintenant → succeeded → digest → liens → marquer lu
```

## 3. Modules et responsabilités (frontières)

Règle de dépendance (sens unique) : `http`/`console` → `pipeline`/`queue`/`scheduler` → `claude`, `sources`, `dedup`, `notify` → `net` → `config`/`shared`. `db/repos` n'est importé que par `pipeline`, `queue`, `scheduler`, `http`, `seed`. `claude/` n'importe ni `db` ni `http` (extractible). Le front n'importe que `src/shared/*` (types et schémas zod).

- **config** : lit `process.env` une seule fois, valide toutes les `PFLUX_*` (zod), calcule `host` effectif (`127.0.0.1` sauf `PFLUX_EXPOSE=1`), exige `PFLUX_PASSWORD` ≥ 12 en exposé. Erreur → message clair sur stderr, `process.exit(1)`.
- **db** : connexion WAL, `foreign_keys=ON`, migrations `migrations/NNN_*.sql` suivies dans `schema_migrations`. Repos fins et typés ; aucun SQL hors `db/`.
- **net** : unique client HTTP sortant (RSS, OSV, NVD, ntfy). Résolution DNS injectable, validation de chaque IP, connexion sur l'IP validée (option `lookup` figée), SNI/Host conservés, redirections manuelles ≤ 5 revalidées, bornes taille/durée.
- **sources** : connecteurs purs `fetch(params, ctx)` ; parsing testable à partir de chaînes (`parseRss(text)`, `parseOsv(json)`, `parseNvd(json)`). Erreurs par URL/paquet reportées via `ctx.onSourceError` sans interrompre les autres.
- **dedup** : normalisation + SHA-256 ; filtre avant Claude.
- **claude** : runner (réel/faux), construction de l'env et des arguments, prompt durci, validation stricte, moteur de lots + budget, classification des erreurs.
- **pipeline** : orchestre un run, écrit étapes/logs (assainis) en DB et sur `RunEventBus`, marque `seen_items`, crée digest + items, notifie.
- **queue** : file persistée (`runs.status`), concurrence `maxConcurrentRuns`, `AbortController` par run, annulation `queued`/`running`, recovery au démarrage (`running`→`queued`).
- **scheduler** : n'est démarré que si `acquireLock` réussit ; tick toutes les `schedulerTickS` ; enfile les flux dus sans doublon ; rattrapage = 1 seul run ; calcule `nextRunAt` ; backoff de report.
- **notify/ntfy** : construction des requêtes ntfy (en-têtes `Title`, `Priority`, `Click`, `Authorization`), plafond 5 + récapitulatif.
- **secrets** : `/data/secrets.json` (600, écriture atomique via `mkdtemp` dans `dataDir` puis `rename`), priorité env > UI, API ne renvoie que l'état.
- **auth** : sessions signées HMAC, mot de passe à temps constant, rate-limit login, CSRF, garde d'accès (HTTP + upgrade WS), en-têtes de sécurité.
- **console** : un seul pty `claude /login` (même env que le runner), WS authentifié + Origin vérifiée, fermeture après 10 min d'inactivité.
- **http** : routes Fastify fines (validation zod → service → DTO), gestionnaire d'erreurs global (`{error, requestId}`), statique + fallback SPA.
- **web** : SPA fidèle à `docs/design/` (voir §6).

## 4. Flux de données

### Run (pipeline)
```
Scheduler.tick / POST run-now ──► RunsRepo.create(status=queued) ──► RunQueue.kick()
RunQueue (≤ N concurrents) ──► executeRun(runId, signal)
  1 fetch   : connector.fetch(params, ctx) via safeFetch ; items hors freshnessDays ignorés ; erreurs par source → log étape
  2 dedup   : dedupKey(item) ; SeenRepo.filterUnseen(feedId, keys) ; 0 nouveau → status succeeded, noNews=1, pas de Claude/notif
  3 triage  : ≤40 items → 1 appel DigestOutput ; >40 → lots de 40 TriageOutput puis 1 appel DigestOutput sur items keep
              chaque appel: prompt durci → runner.run → validateOutput (schéma, refs connues, URL ⊂ entrées) → 1 retry max
              coût cumulé > budgetUsd → lots restants non lancés → budget_exceeded (+ digest partiel si items traités)
              après chaque lot validé : SeenRepo.markSeen(lot entier, keep ou non)
  4 digest  : DigestsRepo.create + ItemsRepo.insertMany (keep=true) si ≥1 retenu
  5 notify  : NtfyNotifier.notifyRun (items ≥ seuil, 5 max + récap) ; échec → log étape, run non échoué
  fin       : RunsRepo.finish(status, usage) ; FeedsRepo.setLastRun ; events WS
ClaudeError kind usage_limit|unauthenticated|overloaded → status deferred, feed.nextRunAt = now + min(defer·2^n, 360 min)
```

### Requête HTTP
`onRequest` (en-têtes sécurité, requestId) → garde d'accès (mode exposé) → CSRF (mutations) → validation zod → repo/service → DTO JSON. Toute exception non `AppError` → log serveur `{requestId, err}` → `500 {error:"internal_error", requestId}`.

### Temps réel
`RunEventBus` (process) → `/api/ws/runs` → front (`useRunEvents`) : statut, étapes, logs, usage.

## 5. Stockage (`PFLUX_DATA_DIR`, défaut `/data`, `./data` en dev)

```
<data>/pflux.db            # SQLite (WAL)
<data>/secrets.json        # 600, {anthropicApiKey?, nvdApiKey?, ntfyToken?}
<data>/session.key         # 600, 32 octets aléatoires (si PFLUX_SESSION_SECRET absent)
<data>/scheduler.lock      # O_EXCL, contenu {pid, startedAt}
<data>/claude-home/        # 700, HOME du CLI claude (identifiants /login)
```
Tables (migration 001) : `feeds`, `runs`, `run_logs`, `digests`, `items`, `seen_items` (UNIQUE `feed_id, dedup_key`), `settings` (clé/valeur JSON non secrète), `schema_migrations`. `seen_items.feed_id` sans `ON DELETE CASCADE` vers la purge (la rétention ne la touche jamais ; suppression du flux → suppression de ses `seen_items`).

## 6. Front — mise en œuvre de la maquette

- `styles/tokens.css` reprend **à l'identique** les variables `:root` / `.dark` de `docs/design/` (papier, encre, rouge, ocre, graphite, vert, bleu ; piles de polices système serif/sans/mono, **aucune police distante**).
- `Shell` = grille `232px 1fr` : `Sidebar` (marque `C` rouge + wordmark « Cardinal », double filet, nav Flux / Fil / Runs / Réglages avec compteurs `.count`, liste des flux avec `.dot` actif/pause/reporté, pied avec coût cumulé et statut Claude) + `main`.
- `Masthead` : dateline mono majuscule, titre serif 34px, `mast-meta`, zone `.actions`.
- Composants ↔ classes : `StatusStamp` (`.stamp .s-ok/.s-run/.s-queue/.s-def/.s-fail/.s-cancel/.s-budget/.s-pause`), `PriorityBadge` (`.prio .p-high/.p-med/.p-low` + barres), `FeedCard` (`.feed`, hachures `.paused`, gros compteur non-lus, `.meta` dl, `MiniTape` 5 étapes), `PipelineTape` (`.tape` perforé, `.done/.now/.todo/.err`, animation `crawl`), `StatsBar` (`.stats` + `.gauge` budget), `LogView` (`.log`, niveaux `.lv.i/.w/.e`, curseur), `RunList` (`.runs`), `SegFilter` (`.seg`), boutons `.btn primary/danger/ghost/sm`.
- `DigestPage` : page article (serif, chapeau, sections, éléments avec badge, justification, résumé, liens `target="_blank" rel="noopener noreferrer"`), boutons export MD/JSON.
- Thème : classe `.dark` sur `<html>`, défaut `prefers-color-scheme`, bascule mémorisée `localStorage["pflux-theme"]`.
- Chaque page utilise `States.tsx` pour chargement / vide / erreur. Dates formatées avec `Intl.DateTimeFormat` dans le fuseau `settings.timezone`.

## 7. Sécurité — points d'implémentation

- Écoute : `127.0.0.1` par défaut ; `PFLUX_HOST` pris en compte seulement si `PFLUX_EXPOSE=1` (défaut alors `0.0.0.0`). Dans Docker : `PFLUX_EXPOSE` reste 0 mais le compose fixe `PFLUX_HOST=0.0.0.0` **et** `PFLUX_LISTEN_IN_CONTAINER` n'existe pas : la config accepte `PFLUX_HOST=0.0.0.0` sans exposition uniquement si `/.dockerenv` est présent ? **Non** — décision : le compose définit `PFLUX_EXPOSE=0` et `PFLUX_HOST=0.0.0.0`, et la config autorise ce cas via la variable interne au conteneur documentée `PFLUX_HOST` + publication hôte `127.0.0.1:8787:8787` ; la règle « PFLUX_HOST ignoré sauf EXPOSE » est implémentée par `resolveListenHost(config, {inContainer})` où `inContainer` = présence de `/.dockerenv` ou `PFLUX_IN_CONTAINER=1` (posée dans le Dockerfile). Hors conteneur, la règle de la SPEC s'applique strictement.
- Garde d'accès (exposé) : routes publiques `/login`, `/api/auth/login`, `/healthz`, `/mcp` (jamais par session : Bearer `PFLUX_MCP_TOKEN` comparé en temps constant, 404 si non défini, Origin étranger → 403), et les assets statiques nécessaires à la page de login (`/assets/*`). Le reste : 401 JSON pour `/api/*` et upgrade WS, 302 `/login` pour les pages.
- CSRF : mutations → refus si `Sec-Fetch-Site: cross-site` ou `Origin` ∉ {origine de la requête, origine de `PFLUX_PUBLIC_URL`} ; `X-CSRF-Token` = `HMAC(sessionSecret, "csrf:"+sessionId)`. En local, `GET /api/csrf` crée une session anonyme (cookie) et renvoie le jeton. `POST /api/auth/login` exige Origin valide (pas de jeton : pas encore de session) — il émet le jeton en réponse.
- En-têtes : CSP de la SPEC, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cache-Control: no-store` sur `/api/*`.
- Logs : `redact` pino sur `*.authorization, *.apiKey, *.password, *.token, *.cookie, req.headers.cookie, req.headers.authorization, req.headers["x-csrf-token"]` ; logs de run passent par `sanitizeLogMessage` (retire secrets connus, tronque, jamais `err.message` brut d'une lib → code d'erreur générique).
- Conteneur : uid 10001, rootfs RO, `tmpfs /tmp`, `cap_drop ALL`, `no-new-privileges`, volume `/data` seul.

## 8. Scripts npm

| Script | Commande |
|---|---|
| `dev` | `tsx watch src/index.ts` (+ `vite` sur 5173 avec proxy `/api` en parallèle via `dev:web`) |
| `build` | `tsc -p tsconfig.server.json && vite build` |
| `start` | `node dist/index.js` |
| `lint` | `eslint .` |
| `typecheck` | `tsc -p tsconfig.server.json --noEmit && tsc -p tsconfig.web.json --noEmit` |
| `test:unit` | `vitest run` |
| `test:e2e` | `playwright test` (requiert `build`) |
| `test` | `vitest run && npm run build && playwright test` |
| `ci` | `npm run lint && npm run typecheck && npm test` (le build est inclus dans `test`) |

## 9. Tests (sans réseau, < 60 s)

- DNS injecté (`resolve: (host) => Promise<string[]>`) et serveurs `http.createServer` sur `127.0.0.1:0` avec allowlist `127.0.0.1:<port>`.
- `FakeClock` pour scheduler, limiteur NVD, rate-limit login, rétention.
- `FakeClaudeRunner` scriptable : file de réponses (`valid`, `invalid_json`, `bad_schema`, `unknown_ref`, `invented_url`, `usage_limit`, `unauthenticated`, `overloaded`, `cost:<usd>`) ; en mode `PFLUX_CLAUDE_RUNNER=fake` sans script, il génère une sortie valide déterministe (tous les items `keep`, priorité `high` pour le premier) — utilisé par l'e2e.
- Les tests de `cliRunner` utilisent un faux binaire (`PFLUX_CLAUDE_BIN` → script node de `tests/fixtures/claude/fake-claude.mjs`) qui renvoie son `argv`, son `env` et un stream-json simulé.
- `buildTestApp({env})` construit l'app via `fastify.inject` avec data dir `mkdtemp`.
- Démarrage exposé sans mot de passe : `spawn(node, ["dist/index.js"])` ou `tsx` → code ≠ 0 (le test unitaire couvre `loadConfig`, l'intégration couvre `process.exit`).
- Test « aucune ressource externe » : parcourt `dist/web/**` à la recherche de `src=|href=|url(|import` pointant vers `http(s)://`.


## Stack
```json
{
  "language": "TypeScript (Node 22 LTS)",
  "framework": "Fastify 5 + Vite/React 18",
  "package_manager": "npm",
  "install_cmd": "npm ci && npx playwright install chromium",
  "build_cmd": "npm run build",
  "test_cmd": "npm test",
  "run_cmd": "npm start"
}
```

## Risques
- node-pty et better-sqlite3 sont des modules natifs : compilation (python3, make, g++) nécessaire dans l'étape build du Dockerfile et sur les PC sans binaires précompilés ; copier node_modules compilés vers l'image finale slim.
- Flags du CLI claude (--tools "", --disallowedTools, --strict-mcp-config, format stream-json, champs total_cost_usd/usage) susceptibles d'évoluer : version épinglée exacte, arguments centralisés dans claude/args.ts et testés via un faux binaire.
- Classification usage_limit/unauthenticated/overloaded repose sur des motifs textuels de sortie non contractuels : motifs regroupés dans classify.ts avec fixtures, repli prudent sur 'failed'.
- Connexion sur IP résolue avec TLS : il faut conserver SNI/Host et la validation du certificat sur le hostname d'origine (option lookup figée plutôt que remplacer l'hôte par l'IP).
- Règle « PFLUX_HOST ignoré sauf PFLUX_EXPOSE=1 » en tension avec le conteneur qui doit écouter sur 0.0.0.0 sans mot de passe : résolu par PFLUX_IN_CONTAINER=1 posé dans le Dockerfile et publication hôte 127.0.0.1 uniquement — à documenter clairement dans le README.
- Durée de la suite (<60 s) : build Vite + démarrage Playwright Chromium dans npm test ; e2e limité à un seul parcours, faux runner sans délai.
- Allowlist SSRF autorisant 127.0.0.1:port pour les tests et le ntfy local : bien limiter la dérogation à l'IP:port exact et ne jamais l'appliquer à 0.0.0.0/multicast.
- Sorties Claude tronquées ou hors schéma sur gros lots : découpage par 40, plafonds de longueur zod et un seul retry, sinon échec générique sans contenu brut.
