# P.A.U.L.

**Programme d'Assistance Utilisateur Local** : un assistant en overlay pour Windows, dans l'esprit de la Game Bar,
affiché par-dessus les jeux. Projet perso en Electron + TypeScript.

> Statut : en développement. Seul le mode **Jeu** est disponible, avec son premier module : **Notes**.

## Fonctionnalités

- **Fenêtre de lancement** : choix du mode, profils de jeu (un profil = un jeu = ses notes), historique.
- **Overlay en jeu** : affiche les notes épinglées par-dessus le jeu, sans jamais intercepter les clics ni le focus.
- **`F4`** : affiche / masque la barre de modules (une icône par module). Les notes épinglées restent à l'écran.
- **Module Notes** : panneau latéral pour créer, éditer (sauvegarde automatique), épingler (plusieurs à la fois) et supprimer des notes, séparées par jeu.
- **`Échap`** : ferme le panneau, puis la barre. Capturé uniquement tant que la barre est affichée.

## Lancer le projet

```bash
npm install
npm start
```

Version Windows packagée : `npm run pack:win` (sortie dans `release-pack/`).

Les données (profils, notes) sont stockées dans le dossier utilisateur (`%APPDATA%/paul/data`), pas dans le dépôt.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `src/main.ts` | Processus principal : handlers IPC, raccourcis, cycle de vie |
| `src/windows.ts` | Création et affichage des fenêtres (lanceur, overlay, barre, panneau) |
| `src/store.ts` | Lecture / écriture des JSON (écriture atomique, validation) |
| `src/modules.ts` | Registre des modules affichés dans la barre |
| `src/*-preload.ts` | API exposée à chaque fenêtre via `contextBridge` |
| `index.html` + `renderer.js` | Interface de lancement |
| `overlay.*`, `dock.*`, `notes-panel.*` | Pages de l'overlay, de la barre de modules et du panneau Notes |

Ajouter un module : l'ajouter dans `src/modules.ts`, y associer une icône dans `dock.js`, puis gérer son `id` dans `dock:openModule` (`src/main.ts`).

## Limites connues

- Le panneau Notes prend le focus clavier (il faut pouvoir écrire) : un jeu qui se met en pause quand il perd le focus
  (Minecraft en solo, par exemple) sera en pause tant que le panneau est ouvert. L'overlay et la barre de modules,
  eux, ne prennent jamais le focus.
- L'overlay est une fenêtre Electron « toujours au-dessus » : il fonctionne en fenêtré, plein écran fenêtré (borderless)
  et avec la plupart des jeux en plein écran sous Windows 10/11. Un vrai plein écran **exclusif** DirectX peut le masquer :
  Electron ne peut pas s'y injecter.
- Seul l'écran principal est couvert.

## Feuille de route

- Modes **Dév IUT** et **Dév perso**
- Modules spécifiques par jeu (Minecraft, etc.)
- Intégration d'API d'IA
