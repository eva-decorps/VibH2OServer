Pour installer les dépendances

```shell
# Installer Node.js
brew install node

# Initialiser npm
cd VibH2OServer
npm init -y
npm install express
```

Avant de lancer le server (optionnel) enlever les lignes d'info de syncrhonie avec le script python, modifier le nom du fichier original dans le script.

```python
input_file = "tonfichier" 
```

```shell
python remove_lines.py
```

Pour lancer le server, mettre le fichier dans un répertoire `data` dans le repo et si besoin le renommer `bpm_data.txt`.

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
