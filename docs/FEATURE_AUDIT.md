# Audit de conformité — passe 2

| Fonctionnalité | Statut | Constat | Captures |
|---|---|---|---|
| F1 — Modèle et CRUD des flux | ok | FeedsPage/FeedCard/FeedFormPage montés dans App.tsx ; routes CRUD, duplicate, pause/resume, export/import dans src/http/routes/feeds.ts ; ConfirmDialog, états Loading/Empty/ErrorState, SourceHelp ; se | docs/qa/screenshots/error-state.png, docs/qa/screenshots/happy-path.png |
| F2 — Connecteurs de sources | ok | src/sources/{rss,osv,nvd,xml,rateLimiter}.ts ; getConnector câblé ; tests rss/osv/nvd/edge-cases sur fixtures locales (dont XXE) passent. | — |
| F3 — Client HTTP anti-SSRF | ok | src/net/safeFetch.ts (lookup figé sur IP validée) ; utilisé par ntfy (src/notify/ntfy.ts) et connecteurs ; tests/unit/ssrf.test.ts passent. | — |
| F4 — Déduplication | ok | src/dedup/index.ts filterUnseen utilisé par pipeline ; tests/integration/pipeline.test.ts (2 runs) et dedup.test.ts passent. | — |
| F5 — Moteur Claude headless sécurisé | ok | src/claude/{env,args,cliRunner,fakeRunner,prompt,outputSchema,engine,classify,status}.ts ; tests claude-runner/engine/prompt passent ; dépendance @anthropic-ai/claude-code 2.1.307 épinglée. | — |
| F6 — Ordonnanceur et file d'exécution | ok | src/index.ts : acquireLock → queue.recover → Scheduler.start ; RunPage avec PipelineTape, LogView, useRunEvents (WS) et bouton Annuler ; /api/feeds/:id/run (202) ; queue-scheduler.test.ts et ws.test.t | — |
| F7 — Digests, fil et exports | ok | DigestPage rendue en article (screenshot : chapeau, badges priorité, justification, sources, export MD/JSON, bouton lu/marquer lu, thème 'Sombre') ; routes digests export.md/json ; fil par flux filtra | docs/qa/screenshots/happy-path.png |
| F8 — Notifications ntfy | partial | Notifier ntfy via safeFetch, plafond 5 + récap, test par flux fonctionnel (FeedFormPage → POST /api/feeds/:id/test-notify, route existante). MAIS le bouton « Tester la notification » global de Setting | — |
| F9 — Réglages et connexion Claude | partial | SettingsPage monte LoginTerminal (xterm + WS /api/ws/console → node-pty claude /login), statut Claude, Revérifier, SecretField pour clé API/NVD/jeton ntfy, fuseau, concurrence, rétention, URL publique | — |
| F10 — Sécurité d'accès et durcissement HTTP | ok | src/auth/plugin.ts (garde d'accès, routes publiques /login, /api/auth/login, /healthz, redirection 302 / 401), CSRF, rate-limit, en-têtes ; startup exposé sans mot de passe → exit 1 dans src/index.ts  | — |
| F11 — Livrable, CI et documentation | ok | Dockerfile multi-étapes épinglé par digest, uid 10001, HEALTHCHECK node dist/healthcheck.js ; docker-compose, .env.example, docs/ci/workflow.example.yml présents ; pas de .github/ ; tests/unit/deliver | — |
