import csv
import math

with open('champions.csv', 'r', encoding='utf-8-sig') as f:
    lines = f.readlines()

out_lines = []
for i, line in enumerate(lines):
    if i == 0:
        out_lines.append(line)
        continue
    
    parts = line.strip('\n').split(';')
    if len(parts) >= 7:
        try:
            old_mana = float(parts[6])
            new_mana = math.floor(old_mana * 0.8)
            parts[6] = str(int(new_mana))
        except ValueError:
            pass
    out_lines.append(';'.join(parts) + '\n')

with open('champions.csv', 'w', encoding='utf-8-sig') as f:
    f.writelines(out_lines)
