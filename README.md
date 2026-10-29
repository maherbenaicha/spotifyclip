# spotifyclip

**Chaque chanson mérite son clip.** spotifyclip regarde ce qui joue sur ton PC et transforme ton écran en clip vivant :

- les **paroles synchronisées** s'affichent au bon moment ;
- les **couleurs** viennent de la pochette de l'album ;
- un nuage de **particules danse sur le rythme** (basses, beats, aigus).

Tout tourne sur ton ordinateur, gratuitement. Marche avec **Spotify gratuit** : pas de Premium, pas de compte développeur.
Usage strictement personnel.

---

## 1. Installation (une seule fois)

1. **Node.js** (version LTS) : https://nodejs.org → télécharge, installe, garde les options par défaut.
2. **VS Code** : https://code.visualstudio.com → pour ouvrir et lire le code.
3. Ouvre un terminal dans le dossier du projet :
   ```
   cd C:\Users\Maher\Desktop\githubprojects\spotifyclip
   npm install
   ```

C'est tout. Pas de clé, pas de compte à créer.

---

## 2. Lancer l'app

### Tester d'abord avec une fausse chanson
```
npm run demo
```
Le navigateur s'ouvre sur `http://127.0.0.1:8888` avec une chanson de démonstration. Si tu vois des paroles et des particules, l'app marche. Ferme avec `Ctrl + C` dans le terminal.

### Avec ta vraie musique
1. Lance une chanson dans l'**appli Spotify pour Windows**.
2. Dans le terminal :
   ```
   npm run dev
   ```
3. Clique **Son du PC** → choisis **Écran entier** → coche **Partager l'audio du système** → Partager.
   Les particules suivent maintenant la vraie musique. (Sans ça, l'app simule une pulsation douce.)
4. Appuie sur **F** pour le plein écran. Les boutons disparaissent quand tu ne bouges plus la souris.

| Touche | Action |
|---|---|
| `F` | Plein écran |
| `→` / `←` | Avancer / retarder les paroles si elles sont décalées |

Utilise **Chrome** ou **Edge** : ce sont eux qui savent capter le son de Windows.

---

## 3. Comment ça marche

```
 ┌───────────────┐   Windows sait ce qui joue    ┌────────────────────┐
 │ Appli Spotify │ ────────────────────────────▶ │ now-playing.ps1    │  (le pont)
 └───────────────┘   titre, pochette, position   └─────────┬──────────┘
                                                           │ une ligne JSON / 0,4 s
                                                 ┌─────────▼──────────┐
                                                 │ plugin.js (Vite)   │  /api/now-playing
                                                 └─────────┬──────────┘  /api/cover
                                                           │
       paroles (LRCLIB) ──────▶ ┌──────────┐ ◀──────────────┘
                                │ main.js  │ ──▶ paroles + clip à l'écran
  énergie du son (Web Audio) ─▶ └──────────┘
```

### Le rôle de chaque fichier

| Fichier | Rôle | Concepts à retenir |
|---|---|---|
| `bridge/now-playing.ps1` | Le pont : lit la musique en cours via Windows | API Windows (SMTC), PowerShell, JSON |
| `bridge/plugin.js` | Lance le pont et le relie à la page | Processus enfant, flux de texte, petite API HTTP |
| `bridge/demo.js` | Une fausse chanson pour tester | Même « protocole » que le pont |
| `src/nowplaying.js` | La page demande ce qui joue | `fetch`, nettoyage de données |
| `src/lyrics.js` | Paroles synchronisées | Format LRC, expressions régulières, recherche dichotomique, cache |
| `src/palette.js` | Couleurs de la pochette | Canvas, pixels, espaces de couleur RGB/HSL |
| `src/audio.js` | « L'oreille » | Web Audio API, FFT (fréquences), détection de beats |
| `src/visuals.js` | Le clip animé | Three.js, WebGL, shaders GLSL |
| `src/main.js` | Le chef d'orchestre | État de l'app, boucles d'animation, événements |
| `src/style.css` | L'apparence | Variables CSS, animations, responsive |

### Trois idées clés à comprendre

**1. On ne passe pas par l'API Spotify.** Elle exige un compte Premium depuis 2026. À la place, on lit ce que **Windows** sait déjà de la musique en cours (c'est ce qui affiche le titre quand tu changes le volume). Une page web n'a pas le droit de parler à Windows : c'est pour ça qu'il faut un « pont » qui tourne à côté.

**2. On interpole la position.** On reçoit la position deux fois par seconde, mais les paroles doivent bouger au millième près. Entre deux réceptions, on ajoute le temps écoulé (`currentProgress()` dans `main.js`). Si l'appli ne donne pas du tout la position, l'app lance son propre chrono au changement de chanson : c'est moins précis, d'où les touches `←` `→`.

**3. La carte graphique fait le travail lourd.** 6 000 particules qui bougent 60 fois par seconde, c'est trop pour le processeur. Les *shaders* de `visuals.js` sont de petits programmes qui tournent directement sur la carte graphique.

---

## 4. Problèmes fréquents

| Problème | Solution |
|---|---|
| « Lance une chanson sur Spotify » alors qu'elle joue | Teste le pont seul (voir plus bas). Vérifie que tu utilises l'**appli** Spotify, pas le site web |
| Paroles marquées « position estimée » | L'appli ne transmet pas la position à Windows. Recale avec `←` `→` |
| `Port 8888 is in use` | Une autre app utilise le port. Ferme-la ou change le port dans `vite.config.js` |
| Pas de son capté | Choisis **Écran entier** (pas une fenêtre) et coche **Partager l'audio du système** |
| « Pas de paroles trouvées » | La chanson n'est pas dans LRCLIB. Tu peux l'y ajouter toi-même sur lrclib.net |

### Tester le pont tout seul
Pendant qu'une chanson joue, dans un terminal ouvert dans le dossier du projet :
```
powershell -ExecutionPolicy Bypass -File bridge\now-playing.ps1
```
Tu dois voir défiler des lignes comme :
```
{"type":"state","track":{"title":"...","artist":"...","positionMs":42000,"durationMs":215000,...}}
```
- `positionMs` est un nombre → parfait, les paroles seront précises.
- `positionMs` vaut `null` → l'app utilisera son chrono de secours.
- Une ligne `"type":"error"` → copie-la et demande de l'aide.

`Ctrl + C` pour arrêter.

---

## 5. Tes défis (pour apprendre vraiment)

Fais-les dans l'ordre. Pour chacun, essaie d'abord de trouver **où** modifier le code avant de demander de l'aide.

1. **Facile.** Change la vitesse de rotation des particules. *Indice : cherche `uTime * (0.05` dans `visuals.js`.*
2. **Facile.** Change la chanson de démo dans `bridge/demo.js` par une chanson que tu aimes (titre, artiste, durée exacte).
3. **Moyen.** Fais « flasher » le fond en blanc à chaque beat. *Indice : `uBeat` dans le shader du fond.*
4. **Moyen.** Affiche le nom de l'album sous l'artiste. *Indice : `index.html` + `onTrackChange` dans `main.js`.*
5. **Difficile.** Ajoute un deuxième style visuel (par exemple des anneaux au lieu d'une sphère) et une touche pour changer de style.

---

## 6. La suite du projet

- **V1 (ici)** : paroles synchronisées + animation sur le rythme. Zéro IA, zéro coût.
- **V2** : l'IA (Gemini, gratuit) lit les paroles et choisit l'ambiance : couleurs, vitesse, style.
- **V3** : l'IA écrit un scénario scène par scène et génère les images (Pollinations / Cloudflare Workers AI, gratuits). L'app les anime sur la musique.
