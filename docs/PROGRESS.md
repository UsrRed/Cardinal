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
