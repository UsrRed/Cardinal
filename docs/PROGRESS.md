# Progression

- 2026-10-21T19:32:01.969Z — workspace initialisé
- 2026-10-21T23:22:41.009Z — découpage strictement linéaire — aucune parallélisation possible
- 2026-10-21T23:27:46.624Z — T01 terminé (Dépendances exactes, scripts npm et types/schémas partagés)
- 2026-10-21T23:28:40.059Z — T02 terminé (Configuration PFLUX_* et logger pino)

## T03
- Migration 001, openDb/migrate, FeedsRepo (+duplicate, exportAll ajoutés au contrat), SettingsRepo, seedIfEmpty, helper tmpDataDir.
- 2026-10-21T23:29:43.519Z — T03 terminé (Base SQLite, migrations, dépôts flux/réglages et seed)
- T04: runs/digests/items/seen repos + retention purge implemented (factories createRunsRepo, createDigestsRepo, createItemsRepo, createSeenRepo); contracts unchanged.
- 2026-10-21T23:31:00.290Z — T04 terminé (Dépôts runs, logs, digests, items, seen, rétention)
- 2026-10-21T23:31:54.115Z — T05 terminé (Client HTTP anti-SSRF (ipPolicy + safeFetch))
- T06: ajout de filterUnseen(items, seenRepo, feedId, sourceType) dans INTERFACES §7.
- 2026-10-21T23:32:45.894Z — T06 terminé (Déduplication, htmlToText, parseur XML sûr et types de sources)
- T07: RSS/Atom connector (parseFeed, rssConnector, testFeedUrl), getConnector('rss') wired; error codes follow INTERFACES (fetch_failed/parse_failed/destination_blocked).
- 2026-10-21T23:33:44.195Z — T07 terminé (Connecteur RSS/Atom et test d'URL)
- T08: OSV connector; SourceContext gains optional osvBaseUrl (test override).
- 2026-10-21T23:34:39.697Z — T08 terminé (Connecteur OSV)
- T09: NVD connector + SlidingWindowLimiter (getNvdLimiter singleton per key); getConnector now returns nvdConnector. No contract change.
- 2026-10-21T23:35:42.088Z — T09 terminé (Connecteur NVD et limiteur à fenêtre glissante)
- 2026-10-21T23:37:07.880Z — T10 terminé (Runner Claude: env reconstruit, arguments, stream-json, classification, CLI et faux runner)
- 2026-10-21T23:38:12.570Z — T11 terminé (Prompt durci et validation de sortie (anti-invention))
- 2026-10-21T23:39:09.571Z — T12 terminé (Moteur Claude: lots, retry, budget, statut)
- 2026-10-21T23:40:03.531Z — T13 terminé (Stockage des secrets et notifier ntfy)
- T14: auth lib implemented; added SessionStore(clock?) param, checkCsrf and cookie helpers to INTERFACES §12.
- 2026-10-21T23:40:54.466Z — T14 terminé (Bibliothèque d'authentification: session, mot de passe, rate-limit, CSRF)
- T15: executeRun pipeline (fetch→dedup→triage→digest→notify), defer backoff, partial digest on budget; no contract change.
- 2026-10-21T23:42:46.796Z — T15 terminé (Pipeline d'un run (fetch→dedup→triage→digest→notify) et bus d'événements)
- 2026-10-21T23:43:56.363Z — T16 terminé (File d'exécution persistée, ordonnanceur et verrou unique)
- T17: AppDeps gains settings(): Settings (effective settings); authPlugin is registered unencapsulated on the root app; createDeps also opens/migrates/seeds the DB.
- 2026-10-21T23:45:49.788Z — T17 terminé (Squelette applicatif Fastify: deps, plugin d'accès, erreurs, statique, santé, point d'entrée)
- 2026-10-21T23:46:54.242Z — T18 terminé (Routes API des flux: CRUD, duplication, pause, lancer, test URL, test ntfy, export/import)
- 2026-10-21T23:48:08.615Z — T19 terminé (Routes API runs, digests, éléments et statistiques)
- T20: settings/secrets/claude/auth routes (registerSettingsRoutes, registerAuthRoutes); no contract change.
- 2026-10-21T23:49:31.484Z — T20 terminé (Routes API réglages, secrets, statut Claude et authentification)
- T21: ConsoleSession gains onClose(fn) (idle notification to the WS route); INTERFACES.md updated.
- 2026-10-21T23:51:29.913Z — T21 terminé (WebSocket des runs et console de connexion Claude (pty))
- 2026-10-21T23:52:23.270Z — T22 terminé (Câblage des routes et tests d'intégration sécurité HTTP)

- T23: front foundation (tokens/app CSS from mockup, theme toggle, API client with CSRF, useRunEvents, shared components, date utils). No contract change.
