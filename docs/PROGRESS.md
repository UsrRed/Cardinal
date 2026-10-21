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
