# Audit de conformité — passe 1

| Fonctionnalité | Statut | Constat | Captures |
|---|---|---|---|
| F1 — Modèle et CRUD des flux | ok | FeedsPage/FeedFormPage/FeedCard, ConfirmDialog de suppression, import/export JSON (FeedsPage), SourceHelp (rss/osv/nvd avec effet de la clé NVD), validation zod partagée src/shared/schemas.ts, test-no | docs/qa/screenshots/error-state.png |
| F2 — Connecteurs de sources | ok | src/sources/{rss,osv,nvd,xml,rateLimiter,htmlText}.ts, branchés via getConnector dans le pipeline; fixtures locales; tests passent. | — |
| F3 — Client HTTP anti-SSRF | ok | src/net/{ipPolicy,safeFetch}.ts; tests d'intégration safeFetch; utilisé par sources et ntfy; l'e2e passe via l'allowlist. | — |
| F4 — Déduplication | ok | src/dedup/index.ts + SeenRepo; test pipeline à deux runs. | — |
| F5 — Moteur Claude headless sécurisé | ok | src/claude/* (env, args, cliRunner, fakeRunner, prompt, outputSchema, engine, classify, status); tests unitaires verts; e2e utilise le faux runner. Le CLI réel n'a pas été exercé (pas de compte). | — |
| F6 — Ordonnanceur et file d'exécution | ok | src/scheduler/{index,lock}.ts, src/queue/index.ts, démarrés dans src/index.ts après acquireLock; RunPage utilise useRunEvents (WS); e2e: Lancer maintenant → succeeded. | docs/qa/screenshots/happy-path.png |
| F7 — Digests, fil et exports | partial | DigestPage rendue conforme à la maquette (titre, chapeau, sections, badges priorité, justification, résumé, sources cliquables, exports MD/JSON, bouton Lu/Marquer lu); historique paginé; thème clair/s | docs/qa/screenshots/happy-path.png |
| F8 — Notifications ntfy | ok | src/notify/ntfy.ts appelé à l'étape notify du pipeline; réglages globaux dans SettingsPage et surcharge par flux dans FeedFormPage; test-notify global et par flux; erreur générique « Destination non a | — |
| F9 — Réglages et connexion Claude | ok | SettingsPage: Revérifier, ntfy, clé NVD, URL publique, fuseau, concurrence, rétention, SecretField (remplacer/effacer); LoginTerminal (xterm) + src/console/loginConsole.ts + WS console; SecretsStore e | — |
| F10 — Sécurité d'accès et durcissement HTTP | ok | src/auth/*, plugin enregistré dans app.ts avant les routes; gestionnaire d'erreurs; config exposé sans mot de passe → exit; tests d'intégration http, startup et no-external-assets présents et verts (n | — |
| F11 — Livrable, CI et documentation | ok | Dockerfile, docker-compose.yml, .env.example, README.md, docs/DONNEES-ENVOYEES.md, docs/ci/workflow.example.yml présents; pas de .github/; dépendances sans ^ ni ~; npm test (vitest + build + playwrigh | — |
