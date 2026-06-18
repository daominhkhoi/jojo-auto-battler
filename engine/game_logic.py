import math
import time

class Champion:
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
        self.mana = start_mana 
        self.max_mana = max_mana if max_mana > 0 else 100 
        self.is_alive = True
        self.star = star
        self.attack_cooldown = 0 
        self.skill = skill if skill else {'type': 'damage', 'power': 50, 'duration': 0}
        self.active_buffs = []
        
        # Các trạng thái khống chế
        self.is_stunned = False
        self.is_mana_locked = False

    def can_attack(self):
        if self.is_stunned: return False # Bị choáng thì đứng im
        if self.attack_cooldown > 0:
            self.attack_cooldown -= 0.1
            return False
        return True

    def reset_attack_cooldown(self):
        safe_speed = self.speed if self.speed > 0 else 1.0
        self.attack_cooldown = 1.0 / safe_speed

    # === HỆ THỐNG XỬ LÝ KỸ NĂNG (SKILL SYSTEM) ===
    # === HỆ THỐNG KỸ NĂNG MỞ RỘNG (10 LOẠI SKILL) ===
    def cast_skill(self, target, board_state):
        self.mana = 0 
        if not self.is_alive or self.is_stunned: return None
        
        s_type = self.skill.get('type', 'damage')
        
        # --- CHẶN CLONE ĐẺ THÊM CLONE (CHỐNG TREO MÁY) ---
        if s_type == 'clone' and getattr(self, 'is_clone', False):
            s_type = 'damage'
            self.skill['power'] = self.attack * 2
        
        # === CƠ CHẾ NÂNG CẤP KỸ NĂNG THEO SAO ===
        # 1. Sát thương / Hồi máu (x1, x2, x3 theo Cấp Sao)
        s_power = self.skill.get('power', 0) * self.star if 'power' in self.skill else 0
        
        # 2. Thời gian hiệu ứng (Tăng 50% mỗi Cấp Sao: x1, x1.5, x2)
        base_duration = self.skill.get('duration', 0)
        s_duration = base_duration * (1 + (self.star - 1) * 0.5)
        
        # 3. Sức mạnh Phân Thân (Tăng 20% chỉ số mỗi Cấp Sao)
        base_percent = self.skill.get('percent', 0.5)
        s_percent = base_percent + (self.star - 1) * 0.2
        
        # Bán kính (Radius) giữ nguyên để tránh Vùng Phép to tràn ra ngoài bản đồ
        s_radius = self.skill.get('radius', 1.5)
        
        # Mặc định targetId là kẻ địch
        event = {'type': 'skill', 'skill_type': s_type, 'casterId': self.id, 'targetId': target.id if target else self.id}
        
        # 1. Burst Damage
        if s_type == 'damage' and target:
            target.hp -= s_power
            if target.hp <= 0: target.is_alive = False; target.hp = 0
            
        # 2. Heal Tức thời (TỰ ĐỘNG TÌM ĐỒNG MINH THẤP MÁU NHẤT)
        elif s_type == 'heal':
            lowest_hp_ally = min([c for c in board_state if c.team == self.team and c.is_alive], key=lambda c: c.hp/c.max_hp, default=self)
            lowest_hp_ally.hp = min(lowest_hp_ally.max_hp, lowest_hp_ally.hp + s_power)
            event['targetId'] = lowest_hp_ally.id # Đổi tâm điểm về đồng minh này
            
        # 3. Regen (Hồi máu bản thân)
        elif s_type == 'regen':
            self.active_buffs.append({'type': 'regen', 'power': s_power, 'duration': s_duration})
            event['targetId'] = self.id # Đổi tâm điểm về bản thân
            
        # 4. Buff ATK
        elif s_type == 'buff_atk':
            self.attack += s_power
            self.active_buffs.append({'type': 'buff_atk', 'power': s_power, 'duration': s_duration})
            event['targetId'] = self.id
            
        # 5. DoT (Độc/Cháy một mục tiêu)
        elif s_type == 'dot' and target:
            target.active_buffs.append({'type': 'dot', 'power': s_power, 'duration': s_duration})
            
        # 6. AoE Heal (VÒNG HỒI MÁU THÔNG MINH)
        elif s_type == 'aoe_heal':
            # Tìm đồng minh đang hấp hối nhất
            lowest_hp_ally = min([c for c in board_state if c.team == self.team and c.is_alive], key=lambda c: c.hp/c.max_hp, default=self)
            event['targetId'] = lowest_hp_ally.id # Quăng vòng sáng màu xanh vào chỗ người này
            
            for c in board_state:
                # CHỈ QUÉT ĐỒNG MINH (c.team == self.team) đang đứng trong vòng sáng đó
                if c.team == self.team and c.is_alive and calculate_distance(lowest_hp_ally.x, lowest_hp_ally.y, c.x, c.y) <= s_radius:
                    c.hp = min(c.max_hp, c.hp + s_power)
                    
        # 7. AoE DoT (Thả độc dính toàn bộ địch)
        elif s_type == 'aoe_dot' and target:
            for c in board_state:
                if c.team != self.team and c.is_alive and calculate_distance(target.x, target.y, c.x, c.y) <= s_radius:
                    c.active_buffs.append({'type': 'aoe_dot', 'power': s_power, 'duration': s_duration})
                    
        # 8. Speed Buff
        elif s_type == 'speed_buff':
            old_speed = self.speed
            self.speed *= (1 + s_power / 100.0)
            self.active_buffs.append({'type': 'speed_buff', 'power': old_speed, 'duration': s_duration})
            event['targetId'] = self.id
            
        # 9. Swap
        elif s_type == 'swap' and target:
            self.x, target.x = target.x, self.x
            self.y, target.y = target.y, self.y
            
        # 10. Clone
        elif s_type == 'clone':
            clone_id = f"{self.id}_clone_{int(time.time()*1000)}"
            clone = Champion(clone_id, self.name, self.team, self.x + 0.5, self.y + 0.5, 
                             self.max_hp * s_percent, self.attack * s_percent, self.attack_range, 
                             self.speed, self.max_mana, self.star,
                             skill=self.skill)
            clone.is_clone = True 
            board_state.append(clone)
            event['targetId'] = self.id # Bóng xuất hiện cạnh bản thân
            
        # 11. Mana Lock
        elif s_type == 'mana_lock':
            for c in board_state:
                if c.team != self.team and c.is_alive:
                    c.active_buffs.append({'type': 'mana_lock', 'duration': s_duration})
                    
        # 12. Stun
        elif s_type == 'stun' and target:
            target.active_buffs.append({'type': 'stun', 'duration': s_duration})

        return event

    def update_buffs(self):
        self.is_stunned = False
        self.is_mana_locked = False
        
        for buff in self.active_buffs[:]:
            buff['duration'] -= 0.1
            bt = buff['type']
            
            # Xử lý Tác dụng theo thời gian (Tick mỗi 0.1s)
            if bt == 'regen': 
                self.hp = min(self.max_hp, self.hp + buff['power']/10)
            elif bt == 'dot' or bt == 'aoe_dot': 
                self.hp -= buff['power']/10
                if self.hp <= 0: self.is_alive = False
            elif bt == 'stun':
                self.is_stunned = True
            elif bt == 'mana_lock':
                self.is_mana_locked = True
                
            # Xóa buff khi hết hạn và hoàn trả chỉ số gốc
            if buff['duration'] <= 0:
                if bt == 'buff_atk': self.attack -= buff['power']
                elif bt == 'speed_buff': self.speed = buff['power'] # Trả lại old_speed
                self.active_buffs.remove(buff)

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'team': self.team,
            'x': self.x, 'y': self.y, 'hp': self.hp, 'mana': self.mana,
            'max_hp': self.max_hp, 'max_mana': self.max_mana,
            'is_alive': self.is_alive, 'star': getattr(self, 'star', 1),
            # BẮT BUỘC PHẢI CÓ DÒNG NÀY THÌ FRONTEND MỚI VẼ ĐƯỢC HIỆU ỨNG (CÁNH, KIẾM, ĐỘC)
            'buffs': [b['type'] for b in self.active_buffs] 
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