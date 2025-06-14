Pour installer les dépendances

```shell
# Installer Node.js
brew install node

# Initialiser npm
cd VibH2OServer
npm init -y
npm install express
```

Pour lancer le server, mettre le fichier dans un répertoire `data` dans le repo et le renommer `bpm_data.txt`.

```shell
node server.js  
```

Pour générer les qr codes :
```shell
# rendre le script exécutable
chmod +x generate_qr.sh

# Générer les N QR codes dans [dossier]
./generate_qr.sh N [dossier]
```
