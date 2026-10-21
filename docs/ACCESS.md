# Accès requis

Inventaire établi au cadrage. Les **valeurs** des secrets ne figurent PAS ici: elles sont dans le fichier `.env` du workspace, non versionné.

| Clé | Type | Requis | Pourquoi | Variables .env |
|---|---|---|---|---|
| claude_account | other | oui | Claude trie, priorise, résume et rédige les digests via le CLI claude en mode headless. | — |
| anthropic_api_key | api_key | non | Permet d'authentifier le CLI claude par clé API au lieu du compte abonné. | PFLUX_ANTHROPIC_API_KEY |
| nvd_api_key | api_key | non | Relève la limite de débit de l'API NVD (50 au lieu de 5 requêtes par 30 s). | PFLUX_NVD_API_KEY |
| ntfy_token | api_key | non | Nécessaire uniquement si le serveur ntfy utilisé exige une authentification. | PFLUX_NTFY_TOKEN |
| app_password | other | non | Obligatoire seulement si PFLUX_EXPOSE=1 : protège l'interface exposée sur le réseau. | PFLUX_PASSWORD |
| session_secret | other | non | Signe les cookies de session ; généré automatiquement (32 octets, fichier 600) s'il n'est pas fourni. | PFLUX_SESSION_SECRET |
