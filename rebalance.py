import csv
import random

def clamp(val, min_val, max_val):
    return max(min_val, min(val, max_val))

with open('champions.csv', 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f, delimiter=';')
    champs = list(reader)

cost_map = {
    'Star Platinum': 5,
    'The World': 5,
    'Gold Experience Requiem': 5,
    'King Crimson': 5,
    'Made in Heaven': 5,
    'Chariot Requiem': 5,
    'Cream': 4,
    'Killer Queen': 4,
    'Crazy Diamond': 4,
    'Sticky Fingers': 4,
    'Whitesnake': 4,
    'Weather Report': 4,
    'Purple Haze': 4,
    'The Hand': 4,
    'C-MOON': 4,
    'Metallica': 4,
    'Green Day': 4,
    'Oasis': 4,
    'Bad Company': 4,
    'White Album': 4,
    'Magician\'s Red': 3,
    'Hierophant Green': 3,
    'Silver Chariot': 3,
    'The Fool': 3,
    'Echoes Act 3': 3,
    'Aerosmith': 3,
    'Sex Pistols': 3,
    'Black Sabbath': 3,
    'Hanged Man': 3,
    'Justice': 3,
    'Geb': 3,
    'Horus': 3,
    'The Grateful Dead': 3,
    'Diver Down': 3,
    'Stone Free': 3,
    'Kiss': 3,
    'Foo Fighters': 3,
    'Clash': 3,
    'Beach Boy': 3
}

base_hp = {1: 50000, 2: 70000, 3: 90000, 4: 120000, 5: 160000}
base_atk = {1: 3000, 2: 4200, 3: 5500, 4: 7500, 5: 10000}

for c in champs:
    # Handle the case where BOM might not be fully removed or header name is exactly 'Tên Tướng'
    name_col = 'Tên Tướng' if 'Tên Tướng' in c else list(c.keys())[0]
    name = c[name_col]
    
    # Reassign cost
    if name in cost_map:
        c['Vàng'] = cost_map[name]
    else:
        orig_cost = int(c.get('Vàng', 1))
        if orig_cost > 2:
            c['Vàng'] = random.choice([1, 2])
            
    cost = int(c['Vàng'])
    class_type = c['Tộc / Hệ'].split(', ')[1] if ', ' in c['Tộc / Hệ'] else 'Utility'
    
    hp = base_hp[cost]
    atk = base_atk[cost]
    
    if class_type == 'Power Type':
        hp = int(hp * 0.9)
        atk = int(atk * 1.3)
        c['Tầm Đánh'] = str(random.choice([1.0, 1.5]))
        c['Mana'] = str(random.choice([80, 100]))
    elif class_type == 'Bound':
        hp = int(hp * 1.5)
        atk = int(atk * 0.6)
        c['Tầm Đánh'] = '1.0'
        c['Mana'] = str(random.choice([60, 80]))
    elif class_type == 'Long-Distance':
        hp = int(hp * 0.8)
        atk = int(atk * 1.15)
        c['Tầm Đánh'] = str(random.choice([4.0, 5.0]))
        c['Mana'] = str(random.choice([80, 100]))
    elif class_type == 'Phenomenon':
        hp = int(hp * 1.0)
        atk = int(atk * 0.7)
        c['Tầm Đánh'] = str(random.choice([3.0, 4.0, 5.0]))
        c['Mana'] = str(random.choice([120, 150]))
    elif class_type == 'Automatic':
        hp = int(hp * 0.8)
        atk = int(atk * 1.4)
        c['Tầm Đánh'] = str(random.choice([1.0, 2.0]))
        c['Mana'] = str(random.choice([80, 100]))
    elif class_type == 'Utility':
        hp = int(hp * 1.1)
        atk = int(atk * 0.6)
        c['Tầm Đánh'] = str(random.choice([2.0, 3.0, 4.0]))
        c['Mana'] = str(random.choice([100, 120]))
        
    c['Máu (HP)'] = str(hp)
    c['Sát Thương (ATK)'] = str(atk)

with open('champions.csv', 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=reader.fieldnames, delimiter=';')
    writer.writeheader()
    writer.writerows(champs)
print('Done!')
