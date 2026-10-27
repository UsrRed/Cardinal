# cardinal

Projet généré automatiquement par pj-gen.

## Conventions impératives
- Attribution: les commits git sont authored par UsrRed <redefendeur@gmail.com> (déjà configuré). N'ajoute JAMAIS de trailer "Co-Authored-By", de mention "Generated with Claude Code" ni aucune référence à Claude/Anthropic comme auteur, dans les commits, le code, les docs ou les fichiers générés.
- Économie de contexte: lis uniquement les fichiers nécessaires à ta consigne (ou explicitement nommés). Pas d'exploration large du dépôt, pas de relecture de gros fichiers déjà connus. L'état des tâches vit dans docs/tasks.json, pas dans la conversation. Sois direct et concis.
- Langue: code, identifiants et messages de commit en anglais; documents destinés à l'utilisateur (README, SPEC) en français.
- CI: ne crée et ne modifie JAMAIS .github/workflows/* (pipelines GitHub Actions gérés par pj-gen; le jeton de push n'a pas le droit de les publier et le moindre commit qui les touche bloque toute la publication). Pour un test e2e, ajoute-le au dépôt et à la commande de test existante.
- Processus: n'utilise JAMAIS pkill, killall ni aucun kill par motif de nom (l'orchestrateur qui t'a lancé tourne sur cette machine via "tsx src/index.ts" — un pkill -f tsx/node/server/vite le tue, ainsi que les autres builds). Pour arrêter un process que tu as lancé: mémorise son PID ($!) et fais kill $PID. Pour libérer un port: kill $(lsof -ti:PORT). Lance tes serveurs de dev sur des ports dédiés et arrête-les par PID ou par port, jamais par nom.
- Navigation: docs/ARCHITECTURE.md est la CARTE du dépôt — consulte-la pour localiser un fichier au lieu de chercher. INTERDIT: grep/rg récursif sur tout le dépôt, find global, listing/lecture de répertoires entiers. docs/INTERFACES.md recense les contrats d'interface clés (signatures, schémas API/WS, types partagés): consulte-le au lieu de rouvrir les sources pour retrouver une signature; si tu modifies un contrat, mets ce fichier à jour dans le même commit et note le changement dans docs/PROGRESS.md. Pour comprendre un GROS fichier (>~300 lignes) que tu ne vas PAS modifier, délègue au sous-agent "lecteur" (outil Task, quand il est disponible) avec une question précise au lieu de le lire en entier — sa réponse tient en quelques lignes dans ton contexte. JAMAIS pour un fichier que tu vas éditer (tu as besoin du texte exact), ni pour les docs/*.md de référence (petits, à lire en entier). Si la réponse du lecteur est insuffisante ou douteuse, lis le fichier toi-même.
- Commits atomiques par tâche: `feat(Txx): ...` ; scaffolding: `chore: ...` ; docs: `docs: ...`.

## Fichiers de référence
- `docs/SPEC.md` — spécification validée (source de vérité fonctionnelle)
- `docs/ARCHITECTURE.md` — architecture et stack (carte du dépôt)
- `docs/INTERFACES.md` — contrats d'interface figés (signatures, schémas API/WS)
- `docs/tasks.json` — liste des tâches et statuts (géré par l'orchestrateur, ne pas modifier)
- `docs/PROGRESS.md` — journal de progression

## Skills disponibles
.claude/skills/ contient des skills pré-installés — invoque-les quand leur description correspond à la tâche en cours :
- `code-simplify`
- `security-review`
- `webapp-testing`

## Référence visuelle
- `docs/design/` contient la maquette de référence (ex. Claude Design). Le rendu final doit s'y conformer: structure, hiérarchie, style.
- Consulte-la avant toute décision visuelle (layout, composants, thème).
