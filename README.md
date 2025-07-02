# Installation

Pour installer les dépendances avec brew et npm executer les commandes suivantes :

```shell
# Installer Node.js
brew install node

# Initialiser npm
cd VibH2OServer
npm init -y
npm install express
```

# Utilisation

Avant de lancer le server (optionnel) enlever les lignes d'info de syncrhonie avec le script python, modifier le nom du fichier original dans le script.

```python
input_file = "tonfichier" 
```

```shell
python remove_lines.py
```

Pour lancer le server, mettre le fichier dans un répertoire `data` dans le repo et si besoin le renommer `bpm_data.txt`, puis lancer le server avec la commande :

```shell
node server.js  
```

Pour avoir accès au server en local aller sur http://localhost:3000 et pour voir directement un user donné n aller sur http://localhost:3000/user/usern. \
Depuis une autre machine sur le même réseau aller sur http://ip-ordinateur:3000 et http://ip-ordinateur:3000/user/usern avec l'ip de l'ordinateur sur lequel le server tourne.

On peut aussi se connecter directement en scannant un qr code associé à un siège. Les QR code pour un identifiant donné seront enregistré automatiquement dans le dossier spécifié (automatiquement crée s'il n'existe pas déjà) sous le nom `usern_qr.png`. Un QR code vers l'authentification manuelle est aussi générer sous le nom `auth_qr.png` \
Pour générer les qr codes exécuter les commandes suivantes :

```shell
# Rendre le script exécutable
chmod +x generate_qr.sh

# Générer les N QR codes dans [dossier]
./generate_qr.sh N [dossier]
```
