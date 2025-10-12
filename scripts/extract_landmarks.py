# --------------------------
# TIMESTAMP EN MILLISECONDES: ms depuis 1er janv 1970 (Unix epoch UTC)
# Fonctionnement du script :
# 1) Ouvre le fichier de session ligne par ligne
# 2) Récupère le premier timestamp de capteur/BPM comme référence
# 3) Pour chaque ligne non capteur/BPM :
#    - Extrait le timestamp de l'événement
#    - Calcule minutes écoulées = floor((ts_event - ts_ref)/60000)
#    - Nettoie la légende : supprime '/.../', timestamps, préfixes numériques et ponctuations
#    - Conserve si le texte contient au moins une lettre
# 4) Écrit 'minutes, légende, couleur;' dans landmarks.txt
# --------------------------
import re
import math
import sys
import os
import tkinter as tk
from tkinter import filedialog

# Script pour extraire automatiquement tous les repères textuels depuis un fichier de session
# Utilise une interface graphique pour sélectionner le fichier d'entrée et le dossier de sortie

# Couleur hexadécimale par défaut pour les drapeaux
DEFAULT_COLOR = '#4BC0C0'

# Fenêtre Tkinter cachée pour les dialogues
root = tk.Tk()
root.withdraw()

# Sélection du fichier de session
input_path = filedialog.askopenfilename(
    title="Sélectionnez le fichier de session",
    filetypes=[('Text files', '*.txt'), ('All files', '*.*')]
)
if not input_path:
    print("Aucun fichier sélectionné. Fin du script.")
    sys.exit(0)

# Sélection du dossier de sortie
output_dir = filedialog.askdirectory(
    title="Sélectionnez le dossier de sortie pour landmarks"
)
if not output_dir:
    print("Aucun dossier sélectionné. Fin du script.")
    sys.exit(0)

# Chemin complet pour le fichier landmarks.txt
output_path = os.path.join(output_dir, 'landmarks.txt')

# Expressions régulières pour détecter :
# - les lignes capteur/BPM et capturer le timestamp
sensor_bpm_pattern = re.compile(r"/\d+/\s*\d+\s+(\d{10,})")
# - tout timestamp isolé (pour extraction générale)
timestamp_pattern = re.compile(r"(\d{10,})")
# - segments slash /.../ à supprimer
slash_segment_pattern = re.compile(r"/[^/]+/")
# - texte alphabétique pour identifier les repères
text_pattern = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿ]")
# - préfixe numérique (minute + virgule) à retirer
prefix_pattern = re.compile(r"^\s*\d+\s*,?\s*")

# --- Étape 1 : trouver le timestamp de référence ---
start_timestamp = None
with open(input_path, 'r', encoding='utf-8') as f:
    for line in f:
        m = sensor_bpm_pattern.search(line)
        if m:
            # capture du timestamp du premier enregistrement capteur/BPM
            start_timestamp = int(m.group(1))
            break

if start_timestamp is None:
    print("Impossible de déterminer le timestamp de début ; aucun enregistrement capteur/BPM trouvé.")
    sys.exit(1)

# --- Étape 2 : extraction des repères textuels ---
landmarks = []
with open(input_path, 'r', encoding='utf-8') as f:
    for line in f:
        # Ignorer les lignes capteur/BPM
        if sensor_bpm_pattern.search(line):
            continue
        # Extraire le timestamp de l'événement
        m_ts = timestamp_pattern.search(line)
        if not m_ts:
            continue
        event_ts = int(m_ts.group(1))
        # Calcul du temps écoulé en minutes (floor)
        elapsed_min = math.floor((event_ts - start_timestamp) / 60000)
        # Nettoyage de la légende : supprimer '/.../' et le timestamp
        clean = slash_segment_pattern.sub('', line)
        clean = timestamp_pattern.sub('', clean)
        clean = prefix_pattern.sub('', clean)
        legend = clean.strip(' .;,\n')
        # Ne conserver que si présence de texte
        if not text_pattern.search(legend):
            continue
        landmarks.append((elapsed_min, legend, DEFAULT_COLOR))

# --- Étape 3 : écriture du fichier landmarks.txt ---
with open(output_path, 'w', encoding='utf-8') as out:
    for minute, label, color in landmarks:
        out.write(f"{minute}, {label}, {color};\n")

print(f"Extraction terminée : {len(landmarks)} repères enregistrés dans {output_path}.")
