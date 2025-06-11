import os
import json
import re
from collections import defaultdict

# Fichier source
input_file = "data/bpm_data.txt"

# Dossier de sortie
output_folder = "data"
os.makedirs(output_folder, exist_ok=True)

# Dictionnaire regroupant les valeurs par ID
data_by_id = defaultdict(list)

# Regex pour extraire ID et valeur depuis la ligne
pattern = re.compile(r'"/(\d+)/\s*(\d+)"')

with open(input_file, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        match = pattern.search(line)
        if match:
            id_ = match.group(1)
            value = int(match.group(2))
            data_by_id[id_].append(value)
        else:
            print(f"⚠️ Ligne ignorée (format inattendu) : {line}")

# Écriture d’un fichier JSON par ID avec le bon format
for id_, values in data_by_id.items():
    content = {
        "name": f"Siège {id_}",
        "bpmData": values
    }
    filename = f"seat_{id_}.json"
    filepath = os.path.join(output_folder, filename)
    with open(filepath, "w", encoding="utf-8") as f_out:
        json.dump(content, f_out, indent=2, ensure_ascii=False)
    print(f"✅ Fichier écrit : {filepath} ({len(values)} valeurs)")
