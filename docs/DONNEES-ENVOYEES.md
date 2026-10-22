# Données envoyées à l'extérieur

Personnal Flux n'envoie **aucune télémétrie** et ne charge aucune ressource externe dans l'interface (polices, scripts, images). Seuls les échanges ci-dessous ont lieu, déclenchés par vos flux.

| Destinataire | Quand | Données envoyées |
|---|---|---|
| **Anthropic** (via la CLI Claude Code ou l'API) | À chaque run, étape de tri/synthèse | Vos instructions de flux, et pour chaque élément nouveau : titre, URL, date, extrait de texte (≤ 8000 caractères). Le compte ou la clé API est celui que vous avez configuré. Soumis à la politique d'Anthropic. |
| **OSV** (`api.osv.dev`) | Flux de type OSV | Noms de paquets et écosystèmes configurés, identifiants de vulnérabilités. |
| **NVD** (`services.nvd.nist.gov`) | Flux de type NVD | Mots-clés, sévérité minimale, fenêtre de dates ; la clé `PFLUX_NVD_API_KEY` en en-tête si définie. |
| **Serveurs RSS/Atom** | Flux de type RSS | Requête HTTP GET vers les URLs que vous avez saisies (votre IP et un User-Agent y sont visibles). |
| **Serveur ntfy** (`ntfy.sh` ou le vôtre) | Notification activée | Titre, résumé court, priorité, lien optionnel (`PFLUX_PUBLIC_URL`) ; le jeton `PFLUX_NTFY_TOKEN` en en-tête si défini. Le sujet (topic) sert de secret : choisissez-le difficile à deviner. |

Rien d'autre ne sort : pas de métriques, pas de rapport d'erreur, pas de vérification de mises à jour. Les clés et jetons ne sont jamais journalisés ni renvoyés par l'API.
