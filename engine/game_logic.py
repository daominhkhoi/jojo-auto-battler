import math

class Champion:
    # THÊM THAM SỐ start_mana=0 VÀO CUỐI CÙNG
    def __init__(self, id, name, team, x, y, hp, attack, attack_range, speed, max_mana, star=1, skill=None, start_mana=0):
        self.id = id
        self.name = name
        self.team = team
        self.x = x
        self.y = y
        self.hp = hp
        self.max_hp = hp
        self.attack = attack
        self.attack_range = attack_range
        self.speed = speed
        
        # SỬA DÒNG NÀY: Thay vì self.mana = 0 thì lấy start_mana
        self.mana = start_mana 
        
        self.max_mana = max_mana if max_mana > 0 else 100 
        self.is_alive = True
        self.star = star
        self.attack_cooldown = 0 
        self.skill = skill if skill else {'type': 'damage', 'power': 50, 'duration': 0}
        self.active_buffs = []

    def can_attack(self):
        if self.attack_cooldown > 0:
            self.attack_cooldown -= 0.1
            return False
        return True

    def reset_attack_cooldown(self):
        safe_speed = self.speed if self.speed > 0 else 1.0
        self.attack_cooldown = 1.0 / safe_speed

    # === HỆ THỐNG XỬ LÝ KỸ NĂNG (SKILL SYSTEM) ===
    def cast_skill(self, target):
        self.mana = 0 # Dùng chiêu xong thì xả hết Mana
        if not self.is_alive: return None
        
        s_type = self.skill.get('type', 'damage')
        s_power = self.skill.get('power', 50) * self.star # Tướng 2 sao, 3 sao thì Skill cũng mạnh theo
        s_duration = self.skill.get('duration', 0)
        
        event = {
            'type': 'skill',
            'skill_type': s_type,
            'casterId': self.id,
            'targetId': target.id if target else self.id
        }
        
        # 1. Kỹ năng Sát Thương
        if s_type == 'damage' and target:
            target.hp -= s_power
            if target.hp <= 0:
                target.is_alive = False; target.hp = 0
        # 2. Kỹ năng Hồi Máu Tức Thời
        elif s_type == 'heal':
            self.hp = min(self.max_hp, self.hp + s_power)
            event['targetId'] = self.id
        # 3. Kỹ năng Hồi Máu Theo Thời Gian (HoT)
        elif s_type == 'regen':
            self.active_buffs.append({'type': 'regen', 'power': s_power, 'duration': s_duration})
            event['targetId'] = self.id
        # 4. Kỹ năng Gồng Sát Thương (Buff ATK)
        elif s_type == 'buff_atk':
            self.attack += s_power # Tăng dame ngay lập tức
            self.active_buffs.append({'type': 'buff_atk', 'power': s_power, 'duration': s_duration})
            event['targetId'] = self.id
            
        return event

    def update_buffs(self):
        # Hàm này chạy liên tục mỗi 0.1s để đếm ngược thời gian bùa lợi
        for buff in self.active_buffs[:]:
            buff['duration'] -= 0.1
            
            # Nếu là bùa Regen, hồi một lượng máu nhỏ mỗi 0.1s
            if buff['type'] == 'regen':
                self.hp = min(self.max_hp, self.hp + buff['power'])
                
            # Nếu hết hạn bùa lợi
            if buff['duration'] <= 0:
                if buff['type'] == 'buff_atk':
                    self.attack -= buff['power'] # Tịch thu lại lượng sát thương đã buff
                self.active_buffs.remove(buff)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'team': self.team,
            'x': self.x, 'y': self.y, 'hp': self.hp, 'mana': self.mana,
            'max_hp': self.max_hp, 'max_mana': self.max_mana,
            'is_alive': self.is_alive, 'star': getattr(self, 'star', 1) 
        }

def calculate_distance(x1, y1, x2, y2): return math.hypot(x2 - x1, y2 - y1)
def find_closest_target(attacker, board_state):
    closest_target, min_dist = None, float('inf')
    for champ in board_state:
        if champ.team != attacker.team and champ.is_alive:
            dist = calculate_distance(attacker.x, attacker.y, champ.x, champ.y)
            if dist < min_dist: min_dist = dist; closest_target = champ
    return closest_target
def move_towards(champ, target_x, target_y):
    step = 0.08 
    dx, dy = target_x - champ.x, target_y - champ.y
    dist = calculate_distance(champ.x, champ.y, target_x, target_y)
    if dist > 0:
        actual_step = min(step, dist)
        champ.x += (dx / dist) * actual_step; champ.y += (dy / dist) * actual_step