# Publier une mise à jour de l'application

Ce guide explique comment **toi** (ou la personne qui maintient le code) publie
une nouvelle version qui sera automatiquement détectée par les utilisateurs.

---

## 🔧 Configuration initiale (à faire UNE SEULE FOIS)

### 1. Créer le dépôt GitHub

1. Va sur <https://github.com/new>
2. Crée un dépôt **public** (ex: `lorcana-picking-tool`)
3. Note ton **pseudo GitHub** et le **nom du dépôt**

### 2. Configurer l'app pour pointer vers ce dépôt

Édite **`update_config.json`** et remplace `TON_PSEUDO_GITHUB` par ton vrai pseudo :

```json
{
  "github_owner": "ton-pseudo",
  "github_repo": "lorcana-picking-tool",
  "check_on_startup": true
}
```

### 3. Pousser le code initial

```bash
cd /chemin/vers/lorcana_picking
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/ton-pseudo/lorcana-picking-tool.git
git push -u origin main
```

---

## 🚀 Publier une nouvelle version (à chaque mise à jour)

Imaginons que tu viens de corriger un bug et que tu veux passer de v0.4 à v0.5.

### Étape 1 : Modifier le code

Tu fais tes modifications dans les fichiers `.py` comme d'habitude.

### Étape 2 : Lancer le script de release

```bash
python release.py 0.5
```

Le script va :
- Lister les fichiers à inclure
- Te demander des notes de version (optionnel — termine par Ctrl-D ou Ctrl-Z)
- Créer dans `release_output/` :
  - `lorcana_v0.5.zip` ← l'archive
  - `manifest.json` ← la liste des fichiers + leurs hashes SHA-256

### Étape 3 : Mettre à jour `VERSION`

Édite le fichier `VERSION` à la racine et écris simplement :

```
0.5
```

(Une seule ligne, juste le numéro.)

### Étape 4 : Commit + tag Git

```bash
git add .
git commit -m "Version 0.5 - <description courte>"
git push
git tag v0.5
git push --tags
```

### Étape 5 : Créer la release sur GitHub

1. Va sur `https://github.com/ton-pseudo/lorcana-picking-tool/releases`
2. Clique **« Draft a new release »**
3. Dans **« Choose a tag »**, sélectionne `v0.5`
4. **Titre** : `v0.5 — <résumé court>`
5. **Description** : tes notes de version (markdown supporté)
6. **Glisse-dépose les 2 fichiers** depuis `release_output/` :
   - `lorcana_v0.5.zip`
   - `manifest.json`
7. Coche **« Set as the latest release »**
8. Clique **« Publish release »**

✅ **C'est tout.** Au prochain démarrage de l'application chez tes utilisateurs,
ils verront un bandeau jaune en haut :

> 🔔 Mise à jour disponible : v0.5 — [Voir détails] [Installer maintenant] [Plus tard]

---

## 🔒 Sécurité : pourquoi le SHA-256 ?

Chaque fichier de la release est référencé dans `manifest.json` avec son
empreinte cryptographique SHA-256. Avant d'écrire un fichier sur le disque
de l'utilisateur, l'app **recalcule son hash** et le compare à celui du
manifest. Si ça ne correspond pas (fichier corrompu pendant le téléchargement,
ou compromis sur GitHub), la mise à jour est **abandonnée immédiatement**.

C'est la même technique que les gestionnaires de paquets Linux (apt, dnf...).

---

## 🧯 Que se passe-t-il en cas d'erreur ?

L'updater est **résilient** :

1. **Avant** d'écrire les nouveaux fichiers, il copie les anciens dans
   `versions_backup/v<ancienne>_<timestamp>/`
2. Si une erreur survient pendant l'écriture (disque plein, droits refusés,
   crash...), il **restaure automatiquement** la version précédente depuis ce backup
3. L'utilisateur peut aussi **restaurer manuellement** une ancienne version
   en copiant les fichiers de `versions_backup/<dossier>/` vers la racine

---

## 📋 Fichiers gérés par le système de mise à jour

**Patchés** (peuvent être remplacés par une mise à jour) :
- Tous les `.py`
- `VERSION`
- `README.md`, `BUILD_WINDOWS.md`, `PUBLISHING_UPDATES.md`
- `requirements.txt`, `lorcana_picking.spec`, `build_exe.bat`

**Protégés** (jamais touchés par la mise à jour, même si présents dans le zip) :
- `config.json`, `locations.json`, `tags.json`, `history.json`
  *(données utilisateur)*
- `update_config.json` *(URL personnalisée du dépôt)*
- `cache/`, `backups/`, `versions_backup/`
- `dist/`, `build/`, `__pycache__/`

---

## ⚠️ Limites actuelles

- **Le `.exe` PyInstaller, lui, n'est PAS mis à jour automatiquement.**
  Si tu changes les dépendances Python (nouvelle lib dans `requirements.txt`),
  ou si Python lui-même doit être mis à jour, l'utilisateur doit
  **recompiler** (`build_exe.bat`). Mais 95 % des mises à jour ne touchent que
  les `.py`, donc le système couvre la majorité des cas.

- L'utilisateur doit **redémarrer l'app** pour que les nouveaux `.py`
  soient rechargés (Python ne peut pas remplacer du code en cours d'exécution).
  L'app le lui rappelle avec un message clair après installation.

- En cas de **breaking change** dans le format des fichiers de données
  (ex: nouveau champ obligatoire dans `history.json`), pense à gérer la
  migration côté code (lire l'ancien format gracieusement).

---

## 🧪 Tester localement avant publication

Tu peux tester le système sans publier sur GitHub :

1. Pose `release_output/lorcana_v0.5.zip` et `manifest.json` quelque part
   accessible en HTTP (ex: serveur local, bucket S3 public, etc.)
2. Modifie temporairement `update_config.json` pour pointer vers un
   dépôt GitHub privé de test
3. Vérifie que le bandeau de mise à jour apparaît, que l'install marche,
   et que les hashes sont validés

Ou plus simple : utilise un **dépôt privé secondaire** rien que pour les tests.
