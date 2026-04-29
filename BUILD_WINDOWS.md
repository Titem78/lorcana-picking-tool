# Compiler en `.exe` Windows

Ce guide t'explique comment transformer le projet Python en un **vrai logiciel
Windows autonome** (`LorcanaPicking.exe`) que tu peux lancer en double-cliquant,
sans que Python soit installé sur la machine.

> ⚠️ **Important** : la compilation doit être faite **sur un PC Windows**.
> Un .exe Windows ne peut pas être compilé depuis un Mac ou Linux (ou alors
> avec des bidouillages compliqués). Donc cette étape se fait chez toi.

---

## Méthode rapide (1 double-clic)

> ⚠️ **Recommandation Python** : utilise **Python 3.12 ou 3.13**, pas la
> toute dernière 3.14. Certaines dépendances (notamment `pillow-avif-plugin`
> pour décoder les visuels AVIF de Lorcast) n'ont pas encore de wheel
> pré-compilé pour 3.14, ce qui peut faire échouer l'installation. Avec
> 3.12 ou 3.13, tout passe sans bricolage.
> Lien direct Python 3.13 : <https://www.python.org/downloads/release/python-3130/>

1. Installe Python **3.12 ou 3.13** depuis <https://www.python.org/downloads/windows/>
   en cochant bien **« Add Python to PATH »** pendant l'installation.
2. Dézippe le projet quelque part **sans espace ni parenthèse dans le chemin**
   (ex: `C:\LorcanaPicking\` ✅, **pas** `D:\telechargement\files (11)\` ❌).
3. **Double-clique sur `build_exe.bat`**.

Une fenêtre console s'ouvre, installe les dépendances + PyInstaller,
et compile le tout (1-3 minutes).

À la fin, tu trouveras :

```
dist\
  LorcanaPicking\
    LorcanaPicking.exe       ← le logiciel à lancer
    _internal\               ← dépendances (Python embarqué, libs…)
    config.json
    README.md
```

➡ **Lance `LorcanaPicking.exe`** et c'est parti.

---

## Méthode manuelle (si le `.bat` plante)

Ouvre **PowerShell** ou **cmd** dans le dossier du projet, et tape :

```powershell
python -m pip install -r requirements.txt
python -m pip install pyinstaller
python -m PyInstaller lorcana_picking.spec --noconfirm
```

Le résultat est dans `dist\LorcanaPicking\`.

---

## Distribuer le logiciel

Tu peux **copier l'intégralité du dossier `LorcanaPicking\`** sur :
- une clé USB
- un autre PC Windows
- un dossier réseau partagé

Aucune installation supplémentaire requise sur le PC cible.

---

## Données utilisateur

Quand le logiciel tourne en mode `.exe`, il **stocke ta config et tes données
à côté de `LorcanaPicking.exe`**, pas dans un dossier temporaire :

```
LorcanaPicking\
├── LorcanaPicking.exe
├── config.json          ← tes options
├── locations.json       ← tes emplacements (créé au 1er enregistrement)
├── tags.json            ← tes tags (créé au 1er ajout)
└── cache\               ← visuels et données API Lorcast
    ├── cards.json
    └── images\
```

Tu peux donc **sauvegarder facilement** tes réglages : il suffit de copier les
fichiers `*.json` dans un coin.

---

## Si Windows / l'antivirus rouspète au lancement

C'est normal pour un .exe non signé créé avec PyInstaller. Deux options :
- Ignorer l'avertissement « Windows a protégé votre PC » → **Informations
  complémentaires** → **Exécuter quand même**.
- Si c'est l'antivirus (Avast, Norton…) qui hurle au faux positif, ajoute le
  dossier `LorcanaPicking\` à ses exceptions. C'est un bug connu de
  PyInstaller, pas un vrai virus.

Pour signer officiellement le `.exe` (et faire taire les avertissements pour
de bon), il faut acheter un certificat de signature de code (~150 €/an), ce
qui n'a de sens que si tu veux distribuer largement le logiciel.

---

## Dépannage compilation

**`ERROR: Could not open requirements file: ... requirements.txt`**
Le `.bat` n'est pas dans le bon dossier. Vérifie qu'à côté de
`build_exe.bat` tu vois bien `app.py`, `config.json`, `requirements.txt`,
`lorcana_picking.spec`. Si non, dézippe à nouveau et place le `.bat` au
bon endroit.

**`ERROR: Unable to find '...config.json'`**
Même cause : PyInstaller cherche `config.json` à côté du `.bat` mais ne le
trouve pas.

**`ERROR: Could not find a version that satisfies the requirement pillow-avif-plugin`**
Tu utilises probablement Python 3.14 — pas encore de wheel disponible. Soit
tu installes Python 3.12 ou 3.13 à la place, soit tu vires temporairement
`pillow-avif-plugin` de `requirements.txt` (l'app marchera sans les images
de cartes).

**`Defaulting to user installation because normal site-packages is not writeable`**
Ce n'est qu'un *warning*, pas une erreur. Mais si la suite plante avec
"is not writeable", relance `build_exe.bat` en clic droit → **Exécuter en
tant qu'administrateur**.

**Le .exe se lance puis se ferme immédiatement sans fenêtre**
Ouvre un terminal `cmd` dans `dist\LorcanaPicking\` et lance
`LorcanaPicking.exe` depuis là. Tu verras le message d'erreur Python.
Copie-le et dis-le moi, je t'aiderai.

---

## Mettre à jour le logiciel

Quand tu modifies le code source :

1. Relance `build_exe.bat`
2. Le contenu de `dist\LorcanaPicking\` est régénéré
3. Tes données utilisateur dans le `LorcanaPicking\` **du PC cible** ne sont
   pas touchées (elles sont à côté du `.exe`, pas dans le code source)

---

## Ajouter une icône (optionnel)

Mets un fichier `icon.ico` à côté de `lorcana_picking.spec`, puis dans le
fichier `.spec`, décommente la ligne :

```python
# icon='icon.ico',
```

Relance le build.

Pour créer un `.ico` à partir d'une image, utilise <https://convertio.co/png-ico/>.

---

## Taille finale

Compte environ **120-180 Mo** pour le dossier `LorcanaPicking\` complet
(Python embarqué + Pillow + AVIF + Tkinter + pdfplumber, etc.). C'est gros
mais c'est le prix de l'autonomie totale.

Si tu veux un seul fichier `.exe` (plus pratique à distribuer mais lent au
démarrage car il s'extrait dans `%TEMP%` à chaque lancement), édite le
`.spec` et remplace le bloc `EXE(...)` + `COLLECT(...)` par :

```python
exe = EXE(
    pyz, a.scripts, a.binaries, a.zipfiles, a.datas, [],
    name='LorcanaPicking',
    debug=False, strip=False, upx=True, console=False,
    onefile=True,
)
```

Puis supprime le `COLLECT(...)`. ⚠️ Dans ce mode, **les données utilisateur
sont stockées à côté du .exe** comme prévu (pas dans le `_MEI`), donc rien
ne change côté usage.
