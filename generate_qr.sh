#!/bin/bash

# Vérifie le nombre d'arguments
if [ "$#" -lt 1 ]; then
  echo "Usage: $0 N [dossier]"
  exit 1
fi

N=$1
OUTPUT_DIR=${2:-qr_codes}  # Par défaut : dossier "qr_codes"

# Détecter l'IP locale (pour macOS)
IP=$(ipconfig getifaddr en0)
if [ -z "$IP" ]; then
  echo "Impossible de détecter l'adresse IP locale."
  exit 1
fi

# Installer qrencode si nécessaire
if ! command -v qrencode &> /dev/null; then
  echo "qrencode n'est pas installé. Installation avec Homebrew..."
  brew install qrencode
fi

# Créer le dossier de sortie si nécessaire
mkdir -p "$OUTPUT_DIR"

# Générer les QR codes
for ((i = 1; i <= N; i++)); do
  FILENAME="$OUTPUT_DIR/user${i}_qr.png"
  URL="http://$IP:3000/user/user${i}"
  echo "→ Génération de $FILENAME pour $URL"
  qrencode -s 10 -o "$FILENAME" "$URL"

done

echo "✅ QR codes générés dans le dossier '$OUTPUT_DIR'"

