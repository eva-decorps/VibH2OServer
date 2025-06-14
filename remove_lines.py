input_file = "tonfichier"
output_file = "bpm_data.txt"

with open(input_file, 'r', encoding='utf-8') as infile, open(output_file, 'w', encoding='utf-8') as outfile:
    for line in infile:
        if "Synchronie" not in line and "Syncrhonie" not in line:
            outfile.write(line)

print(f"Lines without 'Synchronie' have been written to {output_file}.")
