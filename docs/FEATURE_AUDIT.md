# Audit de conformité — passe 3

| Fonctionnalité | Statut | Constat | Captures |
|---|---|---|---|
| F1 — Modèle et CRUD des flux | ok | Routes src/http/routes/feeds.ts (CRUD, duplicate, pause, run, test-url, test-notify, export/import) montées via routes/index.ts. FeedsPage/FeedFormPage/FeedCard/SourceHelp routés dans App.tsx; Confirm | docs/qa/screenshots/error-state.png, docs/qa/screenshots/happy-path.png |
| F2 — Connecteurs de sources (RSS/OSV/NVD) | ok | sources/rss.ts, xml.ts, osv.ts (querybatch, alias CVE), nvd.ts (tranches 120 j, apiKey en header, filtre minSeverity, nvdLimiter.acquire via getNvdLimiter 5/50 par 30 s, injecté par pipeline/index.ts) | — |
| F3 — Client HTTP anti-SSRF | ok | net/ipPolicy.ts + net/safeFetch.ts : DNS résolu avant connexion, lookup figé sur l'IP validée, redirections manuelles limitées, maxBytes/timeout. Instancié dans deps.ts et utilisé par sources et NtfyN | — |
| F4 — Déduplication SHA-256 | ok | dedup/index.ts, SeenRepo.markSeen appelé dans pipeline/index.ts (l.168) après chaque lot ; chemin noNews (l.123) sans Claude ni notification ; tests/integration/pipeline.test.ts verts. | — |
| F5 — Moteur Claude headless sécurisé | ok | claude/{cliRunner,env,args,prompt,outputSchema,engine,classify,status,fakeRunner}.ts ; deps.ts choisit CliClaudeRunner ou FakeClaudeRunner selon PFLUX_CLAUDE_RUNNER ; pipeline gère deferred et budget_ | — |
| F6 — Ordonnanceur, file et suivi en direct | ok | src/index.ts : acquireLock → queue.recover() → Scheduler.start ; RunQueue dans deps ; runs/:id + WS /api/ws/runs (route ws.ts, bus RunEventBus) ; RunPage, RunsPage, PipelineTape, LogView routés. tests | — |
| F7 — Digests, fil et exports | ok | DigestPage (/digests/:id) rendue : titre, chapeau avec lettrine, section, badges de priorité, justification, résumé, sources, boutons Exporter Markdown/JSON, bouton marquer lu (état « LU » visible), t | docs/qa/screenshots/happy-path.png |
| F8 — Notifications ntfy | ok | notify/ntfy.ts via safeFetch, appelé par pipeline (notifyRun l.220) ; routes test-notify global et par flux ; SettingsPage affiche le bouton « Tester la notification » et le message d'échec générique  | docs/qa/screenshots/settings.png |
| F9 — Réglages et connexion Claude | ok | SettingsPage rendue : statut Claude + Revérifier + Ouvrir la console, clé API Anthropic, ntfy (serveur/sujet/jeton), clé NVD, URL publique, fuseau, concurrence, rétention. LoginConsole + route /api/ws | docs/qa/screenshots/settings.png |
| F10 — Sécurité d'accès et durcissement HTTP | ok | config (résolution de l'hôte, mot de passe obligatoire en exposé), authPlugin enregistré dans app.ts (garde, CSRF, en-têtes), registerErrorHandler, vérification d'Origin sur les WS, /healthz. tests/in | — |
| F11 — Livrable, CI et documentation | ok | Dockerfile (node:22-bookworm-slim épinglé par digest, USER 10001, EXPOSE 8787, HEALTHCHECK), docker-compose (127.0.0.1:8787, read_only, tmpfs, cap_drop, no-new-privileges), .env.example, README.md, do | — |
