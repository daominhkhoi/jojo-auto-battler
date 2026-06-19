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
    # === HỆ THỐNG XỬ LÝ KỸ NĂNG NÂNG CẤP (ĐỒNG BỘ DỮ LIỆU) ===
    def cast_skill(self, target, board_state):
        self.mana = 0 
        if not self.is_alive or self.is_stunned: return None
        
        s_type = self.skill.get('type', 'damage')
        
        # --- CHẶN CLONE ĐẺ THÊM CLONE ---
        if s_type == 'clone' and getattr(self, 'is_clone', False):
            s_type = 'damage'
            self.skill['power'] = self.attack
        
        # === CƠ CHẾ NÂNG CẤP KỸ NĂNG THEO SAO ===
        star_factor = self.star - 1
        
        # 1. Sát thương / Hồi máu (Tăng x2.1 mỗi Cấp Sao)
        base_power = self.skill.get('power', 0)
        s_power = int(base_power * (2.1 ** star_factor))
        
        # 2. Thời gian hiệu ứng (Tăng x1.1 mỗi Cấp Sao)
        base_duration = self.skill.get('duration', 0)
        s_duration = base_duration * (1.1 ** star_factor)
        
        # 3. Sức mạnh Phân Thân (Cộng 15% mỗi Cấp Sao)
        base_percent = self.skill.get('percent', 0.5)
        s_percent = base_percent + (star_factor * 0.15)
        
        # 4. Bán kính vùng phép (Tăng x1.1 mỗi Cấp Sao)
        base_radius = self.skill.get('radius', 1.5)
        s_radius = base_radius * (1.1 ** star_factor)
        
        # GỬI ĐẦY ĐỦ THÔNG SỐ VỀ CHO FRONTEND
        event = {
            'type': 'skill', 
            'skill_type': s_type, 
            'casterId': self.id, 
            'targetId': target.id if target else self.id,
            'radius': s_radius,
            'duration': s_duration
        }
        
        # 1. Burst Damage
        if s_type == 'damage' and target:
            target.hp -= s_power
            if target.hp <= 0: target.is_alive = False; target.hp = 0
        
        # 2. Heal Tức thời (Đơn mục tiêu - Tìm đồng minh thấp máu nhất)
        elif s_type == 'heal':
            lowest_hp_ally = min([c for c in board_state if c.team == self.team and c.is_alive], key=lambda c: c.hp/c.max_hp, default=self)
            lowest_hp_ally.hp = min(lowest_hp_ally.max_hp, lowest_hp_ally.hp + s_power)
            event['targetId'] = lowest_hp_ally.id
        
        # 3. Regen (Hồi máu bản thân theo thời gian)
        elif s_type == 'regen':
            self.active_buffs.append({'type': 'regen', 'power': s_power, 'duration': s_duration})
            event['targetId'] = self.id
            
        # 4. Buff ATK
        elif s_type == 'buff_atk':
            self.attack += s_power
            self.active_buffs.append({'type': 'buff_atk', 'power': s_power, 'duration': s_duration})
            event['targetId'] = self.id
            
        # 5. DoT (Độc/Cháy một mục tiêu)
        elif s_type == 'dot' and target:
            target.active_buffs.append({'type': 'dot', 'power': s_power, 'duration': s_duration})
            
        # 6. AoE Heal (VÒNG HỒI MÁU THEO GIÂY THÔNG MINH)
        elif s_type == 'aoe_heal':
            lowest_hp_ally = min([c for c in board_state if c.team == self.team and c.is_alive], key=lambda c: c.hp/c.max_hp, default=self)
            event['targetId'] = lowest_hp_ally.id 
            
            for c in board_state:
                # Gắn bùa lợi hồi phục liên tục lên toàn bộ đồng minh trong tầm
                if c.team == self.team and c.is_alive and calculate_distance(lowest_hp_ally.x, lowest_hp_ally.y, c.x, c.y) <= s_radius:
                    c.active_buffs.append({'type': 'aoe_heal', 'power': s_power, 'duration': s_duration})
                    
        # 7. AoE DoT (Thả độc dính toàn bộ địch xung quanh mục tiêu)
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
            
        # 9. Swap (Hoán đổi vị trí với địch NGẪU NHIÊN TUYẾN SAU + GÂY SÁT THƯƠNG)
        elif s_type == 'swap':
            # Tìm tất cả tướng địch còn sống trên sân
            enemies = [c for c in board_state if c.team != self.team and c.is_alive]
            if enemies:
                import random
                
                # THUẬT TOÁN THÔNG MINH: Loại bỏ con tướng đang đấm nhau trực diện với mình (target)
                # Điều này ép chiêu thức PHẢI chọn một đứa khác ở xa hơn
                other_enemies = [e for e in enemies if e.id != target.id] if target else enemies
                
                # Nếu hàng sau còn đứa khác thì chọn ngẫu nhiên đứa hàng sau, nếu không thì mới chọn đứa trước mặt
                chosen_enemy = random.choice(other_enemies) if other_enemies else random.choice(enemies)
                
                # Tiến hành hoán đổi vị trí hình thể trên sàn đấu
                self.x, chosen_enemy.x = chosen_enemy.x, self.x
                self.y, chosen_enemy.y = chosen_enemy.y, self.y
                
                # Gây thêm sát thương bộc phá
                chosen_enemy.hp -= s_power
                if chosen_enemy.hp <= 0:
                    chosen_enemy.is_alive = False
                    chosen_enemy.hp = 0
                    
                # Gửi ID con mồi ngẫu nhiên này về để Client vẽ hiệu ứng dịch chuyển bay ra tuyến sau
                event['targetId'] = chosen_enemy.id
            
        # 10. Clone
        elif s_type == 'clone':
            clone_id = f"{self.id}_clone_{int(time.time()*1000)}"
            clone = Champion(clone_id, self.name, self.team, self.x + 0.5, self.y + 0.5, 
                             self.max_hp * s_percent, self.attack * s_percent, self.attack_range, 
                             self.speed, self.max_mana, self.star, skill=self.skill)
            clone.is_clone = True 
            board_state.append(clone)
            event['targetId'] = self.id
            
        # 11. Mana Lock ĐƠN MỤC TIÊU (Cấm dùng chiêu 1 kẻ địch gần nhất)
        elif s_type == 'mana_lock' and target:
            target.active_buffs.append({'type': 'mana_lock', 'duration': s_duration})
            event['targetId'] = target.id
                    
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
            if bt == 'regen' or bt == 'aoe_heal': 
                self.hp = min(self.max_hp, self.hp + buff['power']/10)
            elif bt == 'dot' or bt == 'aoe_dot': 
                self.hp -= buff['power']/10
                if self.hp <= 0: self.is_alive = False; self.hp = 0
            elif bt == 'stun':
                self.is_stunned = True
            elif bt == 'mana_lock':
                self.is_mana_locked = True
                
            # Xóa buff khi hết hạn
            if buff['duration'] <= 0:
                if bt == 'buff_atk': self.attack -= buff['power']
                elif bt == 'speed_buff': self.speed = buff['power']
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