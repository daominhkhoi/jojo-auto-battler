import math
import time
import random
import os
import pandas as pd

_CHAMPION_COSTS = {}
def get_champion_cost(name):
    if not _CHAMPION_COSTS:
        try:
            csv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'champions.csv')
            df = pd.read_csv(csv_path, sep=';')
            for _, row in df.iterrows():
                _CHAMPION_COSTS[row['Name']] = row['Cost']
        except Exception:
            pass
    return _CHAMPION_COSTS.get(name, 1)

class Champion:
    def __init__(self, id, name, team, x, y, hp, attack, attack_range, speed, max_mana, star=1, skill=None, start_mana=0, active_buffs=None):
        self.id = id
        self.name = name
        self.team = team
        self.x = x
        self.y = y
        self.hp = hp
        self.max_hp = hp
        self.attack = attack
        self.base_attack = attack 
        self.attack_range = attack_range
        self.speed = speed
        self.base_speed = speed   
        self.mana = start_mana 
        self.max_mana = max_mana if max_mana > 0 else 100 
        self.is_alive = True
        self.star = star
        self.attack_cooldown = 0 
        self.skill = skill if skill else {'type': 'damage', 'power': 50, 'duration': 0, 'target': 'enemy_closest'}
        self.active_buffs = active_buffs if active_buffs else []
        
        # Các trạng thái khống chế & đặc biệt
        self.is_stunned = False
        self.is_mana_locked = False
        self.is_submerged = False # Tàng hình
        self.is_banished = False  # Bị nhốt
        self.shield = 0           # Giáp ảo
        self.original_team = team # Dùng cho Mind Control đổi phe

    def can_attack(self):
        if self.is_stunned or self.is_banished or getattr(self, 'is_polymorphed', False): return False
        if self.attack_cooldown > 0:
            safe_speed = max(0.1, self.speed)
            self.attack_cooldown -= 0.1 * safe_speed
            return False
        return True

    def reset_attack_cooldown(self):
        self.attack_cooldown = 1.0

    def take_damage(self, amount, attacker, board_state):
        events = []
        if self.hp <= 0: return 0, events
        amount = max(0, amount)

        # 1. Evasion
        if any(b['type'] == 'evasion' for b in self.active_buffs):
            events.append({'type': 'evasion', 'target_id': self.id})
            return 0, events

        actual_damage = amount
        
        # 2. HP Shield (Lá chắn)
        if self.shield > 0:
            if self.shield >= actual_damage:
                self.shield -= actual_damage
                events.append({'type': 'shield_block', 'target_id': self.id, 'damage_blocked': actual_damage})
                return 0, events
            else:
                events.append({'type': 'shield_break', 'target_id': self.id, 'damage_blocked': self.shield})
                actual_damage -= self.shield
                self.shield = 0
        
        actual_damage = min(actual_damage, self.hp)
        self.hp -= actual_damage

        # 2.5 Giáp phản đòn (Reflect Shield)
        for buff in self.active_buffs:
            if buff['type'] == 'reflect_shield':
                reflect_dmg = actual_damage * buff.get('power', 0)
                if attacker and attacker.is_alive:
                    attacker.hp -= reflect_dmg
                    events.append({'type': 'reflect', 'targetId': attacker.id, 'damage': reflect_dmg})
                    if attacker.hp <= 0: attacker.is_alive = False

        # 3. Damage Link
        for buff in self.active_buffs:
            if buff['type'] == 'damage_link':
                linked_target = buff['linked_target']
                if linked_target and linked_target.is_alive:
                    linked_target.hp -= actual_damage
                    events.append({'type': 'damage_link_proc', 'caster_id': self.id, 'target_id': linked_target.id, 'damage': actual_damage})
                    if linked_target.hp <= 0: linked_target.is_alive = False

        # 4. Revive
        if self.hp <= 0:
            revive_buff = next((b for b in self.active_buffs if b['type'] == 'revive'), None)
            if revive_buff:
                self.hp = self.max_hp
                self.is_alive = True
                self.active_buffs.remove(revive_buff)
                events.append({'type': 'revive', 'target_id': self.id})
            else:
                self.is_alive = False

        return actual_damage, events

    # --- HỆ THỐNG QUÉT MỤC TIÊU THÔNG MINH ---
    def resolve_target(self, target_mode, board_state):
        enemies = [c for c in board_state if c.team != self.team and c.is_alive and not c.is_submerged and not c.is_banished]
        allies = [c for c in board_state if c.team == self.team and c.is_alive and not c.is_banished]

        if not enemies and target_mode.startswith('enemy'): return None

        if target_mode in ['enemy_closest', 'area_closest', 'bounce_closest']:
            return min(enemies, key=lambda c: calculate_distance(self.x, self.y, c.x, c.y), default=None)
        elif target_mode == 'enemy_furthest':
            return max(enemies, key=lambda c: calculate_distance(self.x, self.y, c.x, c.y), default=None)
        elif target_mode == 'enemy_highest_atk':
            return max(enemies, key=lambda c: c.attack, default=None)
        elif target_mode == 'enemy_lowest_hp':
            return min(enemies, key=lambda c: c.hp, default=None)
        elif target_mode == 'enemy_random':
            return random.choice(enemies) if enemies else None
        elif target_mode == 'ally_lowest_hp':
            return min(allies, key=lambda c: c.hp, default=self)
        elif target_mode == 'ally_lowest_mana':
            valid_allies = [c for c in allies if c != self]
            return min(valid_allies, key=lambda c: c.mana) if valid_allies else None
        elif target_mode == 'enemy_highest_cost':
            return max(enemies, key=lambda c: (get_champion_cost(c.name), getattr(c, 'star', 1)), default=None)
        return None

    def cast_skill(self, base_target, board_state):
        self.mana = 0 
        if not self.is_alive or self.is_stunned or self.is_banished: return None
        
        s_type = self.skill.get('type', 'damage')
        t_mode = self.skill.get('target', 'enemy_closest')
        
        # Ngăn Clone dùng chiêu đẻ Clone liên tục
        if s_type == 'clone' and getattr(self, 'is_clone', False):
            s_type = 'damage'; t_mode = 'enemy_closest'
        
        # Tự động tìm mục tiêu chuẩn xác theo Target Mode
        if t_mode == 'self':
            target = self
        elif t_mode in ['all_enemies', 'all_except_self']:
            target = None
        else:
            target = self.resolve_target(t_mode, board_state)

        s_power = int(self.skill.get('power', 0))
        s_duration = float(self.skill.get('duration', 0))
        s_percent = float(self.skill.get('percent', 0.5))
        s_radius = float(self.skill.get('radius', 1.5))
        
        event = {
            'type': 'skill', 'skill_type': s_type, 
            'casterId': self.id, 'targetId': target.id if target else self.id,
            'radius': s_radius, 'duration': s_duration
        }
        
        # 1. TIME STOP (THE WORLD / STAR PLATINUM)
        if s_type == 'time_stop':
            for c in board_state:
                if c.id != self.id and c.is_alive:
                    c.active_buffs.append({'type': 'time_stopped', 'duration': s_duration})
            bonus_speed = self.base_speed * 3
            self.speed += bonus_speed
            self.active_buffs.append({'type': 'speed_buff', 'power': bonus_speed, 'duration': s_duration})
            self.active_buffs.append({'type': 'mana_lock', 'duration': s_duration})
            
        # 1.5. RETURN TO ZERO (GOLD EXPERIENCE REQUIEM)
        elif s_type == 'return_to_zero':
            for c in board_state:
                if c.team != self.team and c.is_alive:
                    c.mana = 0
                    # Return to Zero: Xoá bỏ mọi buff/trạng thái hiện tại
                    for buff in c.active_buffs[:]:
                        bt = buff['type']
                        if bt == 'buff_atk': c.attack -= buff['power']
                        elif bt == 'speed_buff': c.speed -= buff['power'] 
                        elif bt == 'speed_debuff': c.speed += buff['power']
                        elif bt == 'mind_control': c.team = buff.get('original_team', c.team)
                        elif bt == 'banish': c.is_banished = False
                        elif bt == 'submerge': c.is_submerged = False
                        elif bt == 'stat_steal_victim': c.attack += buff['power']
                        elif bt == 'stat_steal_beneficiary': c.attack -= buff['power']
                        c.active_buffs.remove(buff)
            
        # 2. BLINK STRIKE (ÁM SÁT TUYẾN SAU)
        elif s_type == 'blink_strike' and target:
            offset_y = 1 if target.team == 'Team1' else -1
            self.x = target.x
            self.y = max(0, min(5, target.y + offset_y))
            dmg, evs = target.take_damage(s_power, self, board_state)
            if 'extra_events' not in event: event['extra_events'] = []
            event['extra_events'].extend(evs)
            
        # 3. PULL (KÉO TOÀN BỘ ĐỊCH VỀ PHÍA MÌNH - THE HAND)
        elif s_type == 'pull':
            for c in board_state:
                if c.team != self.team and c.is_alive and not getattr(c, 'is_submerged', False):
                    c.x, c.y = self.x, self.y
                    dmg, evs = c.take_damage(s_power, self, board_state)
                    if 'extra_events' not in event: event['extra_events'] = []
                    event['extra_events'].extend(evs)

        # 4. EXECUTE (HÀNH QUYẾT TỨC THỜI - KILLER QUEEN)
        elif s_type == 'execute' and target:
            if target.hp / target.max_hp < 0.3:
                dmg, evs = target.take_damage(999999, self, board_state)
                if 'extra_events' not in event: event['extra_events'] = []
                event['extra_events'].extend(evs)
            else:
                dmg, evs = target.take_damage(s_power, self, board_state)
                event['extra_events'] = evs

        # 5. SUBMERGE (TÀNG HÌNH - ACHTUNG BABY)
        elif s_type == 'submerge':
            self.is_submerged = True
            self.active_buffs.append({'type': 'submerge', 'duration': s_duration})

        # 6. POLYMORPH (HÓA ỐC SÊN / TRẺ CON)
        elif s_type == 'polymorph' and target:
            target.is_polymorphed = True
            target.active_buffs.append({'type': 'polymorph', 'duration': s_duration})

        # 7. MIND CONTROL (THAO TÚNG TÂM TRÍ - ĐỔI PHE)
        elif s_type == 'mind_control' and target:
            if not any(b['type'] == 'mind_control' for b in target.active_buffs):
                target.team = self.team # Đổi phe
                target.active_buffs.append({'type': 'mind_control', 'duration': s_duration, 'original_team': target.original_team})

        # 8. RICOCHET (ĐẠN NẢY)
        elif s_type == 'ricochet' and target:
            bounce_count = int(s_radius) if s_radius > 0 else 3
            current_target = target
            bounce_path = [target.id]
            for _ in range(bounce_count):
                if not current_target or not current_target.is_alive: break
                dmg, evs = current_target.take_damage(s_power, self, board_state)
                if 'extra_events' not in event: event['extra_events'] = []
                event['extra_events'].extend(evs)
                
                next_targets = [c for c in board_state if c.team != self.team and c.is_alive and c != current_target and not getattr(c, 'is_submerged', False)]
                if not next_targets: break
                current_target = min(next_targets, key=lambda c: calculate_distance(current_target.x, current_target.y, c.x, c.y), default=None)
                if current_target:
                    bounce_path.append(current_target.id)
            event['bounce_path'] = bounce_path
            
        # 9. SOUL SWAP (HOÁN ĐỔI LINH HỒN - CHARIOT REQUIEM)
        elif s_type == 'soul_swap':
            self.soul_swap_count = getattr(self, 'soul_swap_count', 0)
            if self.soul_swap_count < 1:
                self.soul_swap_count += 1
                
                enemy_team = [c for c in board_state if c.team != self.team and c.is_alive and not getattr(c, 'is_banished', False)]
                ally_team = [c for c in board_state if c.team == self.team and c.is_alive and c.id != self.id and not getattr(c, 'is_banished', False)]
                
                if enemy_team and ally_team:
                    enemy_target = max(enemy_team, key=lambda c: (get_champion_cost(c.name), getattr(c, 'star', 1)))
                    ally_target = min(ally_team, key=lambda c: (get_champion_cost(c.name), getattr(c, 'star', 1)))
                    
                    event['targetId'] = enemy_target.id
                    # Swap team (and original_team for safety)
                    enemy_target.team, ally_target.team = ally_target.team, enemy_target.team
                    enemy_target.original_team = enemy_target.team
                    ally_target.original_team = ally_target.team
                    
                    # Swap positions
                    enemy_target.x, ally_target.x = ally_target.x, enemy_target.x
                    enemy_target.y, ally_target.y = ally_target.y, enemy_target.y
                    
                    # Heal to full
                    enemy_target.hp = getattr(enemy_target, 'max_hp', 1000)
                    ally_target.hp = getattr(ally_target, 'max_hp', 1000)
                    
                    if 'extra_events' not in event: event['extra_events'] = []
                    event['extra_events'].append({'type': 'swap', 'target_id': enemy_target.id})
                    event['extra_events'].append({'type': 'swap', 'target_id': ally_target.id})

        # 9. MANA BATTERY (BƠM MANA)
        elif s_type == 'mana_battery' and target:
            target.active_buffs.append({'type': 'mana_battery', 'power': s_power, 'duration': s_duration})

        # 10. CÁC SKILL CƠ BẢN CŨ VẪN HOẠT ĐỘNG BÌNH THƯỜNG
        elif s_type == 'damage' and target:
            target.hp -= s_power
            if target.hp <= 0: target.is_alive = False
            
        elif s_type == 'heal' and target:
            target.active_buffs.append({'type': 'heal', 'power': s_power, 'duration': s_duration})
            
        elif s_type == 'regen':
            self.active_buffs.append({'type': 'regen', 'power': s_power, 'duration': s_duration})
            
        elif s_type == 'buff_atk':
            self.attack += s_power
            self.active_buffs.append({'type': 'buff_atk', 'power': s_power, 'duration': s_duration})
            
        elif s_type == 'dot' and target:
            target.active_buffs.append({'type': 'dot', 'power': s_power, 'duration': s_duration})
            
        elif s_type == 'aoe_heal' and target:
            for c in board_state:
                if c.team == self.team and c.is_alive and calculate_distance(target.x, target.y, c.x, c.y) <= s_radius:
                    c.active_buffs.append({'type': 'aoe_heal', 'power': s_power, 'duration': s_duration})
                    
        elif s_type == 'aoe_dot' and target:
            for c in board_state:
                if c.team != self.team and c.is_alive and calculate_distance(target.x, target.y, c.x, c.y) <= s_radius:
                    c.active_buffs.append({'type': 'aoe_dot', 'power': s_power, 'duration': s_duration})
                    
        elif s_type == 'speed_buff':
            bonus_speed = self.base_speed * (s_power / 100.0)
            self.speed += bonus_speed
            self.active_buffs.append({'type': 'speed_buff', 'power': bonus_speed, 'duration': s_duration})
            event['targetId'] = self.id
            
        elif s_type == 'swap' and target:
            self.x, target.x = target.x, self.x
            self.y, target.y = target.y, self.y
            target.hp -= s_power
            if target.hp <= 0: target.is_alive = False
            
        elif s_type == 'clone':
            clone_id = f"{self.id}_clone_{int(time.time()*1000)}"
            clone = Champion(clone_id, self.name, self.team, self.x + 0.5, self.y + 0.5, 
                             self.max_hp * s_percent, self.attack * s_percent, self.attack_range, 
                             self.speed, self.max_mana, self.star, skill=self.skill)
            clone.is_clone = True 
            event['spawned_clones'] = [clone]
            
        elif s_type == 'mana_lock' and target:
            target.active_buffs.append({'type': 'mana_lock', 'duration': s_duration})
                    
        elif s_type == 'stun' and target:
            target.active_buffs.append({'type': 'stun', 'duration': s_duration})
            
        elif s_type == 'global_slow':
            slow_pct = s_percent * 100 if s_percent > 0.5 else 50 # Default 50% slow if no percent given
            for c in board_state:
                if c.team != self.team and c.is_alive and not getattr(c, 'is_submerged', False) and not getattr(c, 'is_banished', False):
                    penalty = c.base_speed * (slow_pct / 100.0)
                    c.speed -= penalty
                    c.active_buffs.append({'type': 'speed_debuff', 'power': penalty, 'duration': s_duration})

        elif s_type == 'stat_steal' and target:
            actual_steal = s_power
            target.attack -= actual_steal
            self.attack += actual_steal
            steal_dur = s_duration if s_duration > 0 else 5.0
            target.active_buffs.append({'type': 'stat_steal_victim', 'power': actual_steal, 'duration': steal_dur})
            self.active_buffs.append({'type': 'stat_steal_beneficiary', 'power': actual_steal, 'duration': steal_dur})

        elif s_type == 'banish' and target:
            target.is_banished = True
            target.active_buffs.append({'type': 'banish', 'duration': s_duration if s_duration > 0 else 5})

        elif s_type == 'hp_shield' and target:
            # Phòng trường hợp giáp chồng giáp: lấy lượng giáp lớn hơn, làm mới thời gian
            new_shield = target.max_hp * s_percent
            target.shield = max(getattr(target, 'shield', 0), new_shield)
            target.active_buffs = [b for b in target.active_buffs if b['type'] != 'hp_shield']
            target.active_buffs.append({'type': 'hp_shield', 'duration': s_duration if s_duration > 0 else 5})

        elif s_type == 'damage_link' and target:
            self.active_buffs = [b for b in self.active_buffs if b['type'] != 'damage_link']
            self.active_buffs.append({'type': 'damage_link', 'linked_target': target, 'caster_id': target.id, 'duration': s_duration if s_duration > 0 else 5})

        elif s_type == 'life_tether' and target:
            target.active_buffs = [b for b in target.active_buffs if b['type'] != 'life_tether']
            target.active_buffs.append({'type': 'life_tether', 'caster': self, 'caster_id': self.id, 'power': s_power, 'duration': s_duration if s_duration > 0 else 5})

        elif s_type == 'evasion' and target:
            target.active_buffs.append({'type': 'evasion', 'duration': s_duration if s_duration > 0 else 5})

        elif s_type == 'revive':
            self.active_buffs.append({'type': 'revive', 'duration': 9999})

        return event

    def update_buffs(self, board_state):
        self.is_stunned = False
        self.is_mana_locked = False
        self.is_submerged = False
        self.is_polymorphed = False
        events = []
        
        for buff in self.active_buffs[:]:
            has_duration = 'duration' in buff
            if has_duration:
                buff['duration'] -= 0.1
                
            bt = buff['type']
            
            # --- TÁC DỤNG THEO THỜI GIAN (TICK CỦA BUFF) ---
            if bt == 'dot':
                dmg, evs = self.take_damage(buff['power'] / 10.0, None, board_state)
                events.extend(evs)
            elif bt == 'aoe_dot':
                dmg, evs = self.take_damage(buff['power'] / 10.0, None, board_state)
                events.extend(evs)
            elif bt == 'regen' or bt == 'aoe_heal' or bt == 'heal':
                self.hp = min(self.max_hp, self.hp + buff['power'] / 10.0)
            elif bt == 'life_tether':
                caster = next((c for c in board_state if c.id == buff.get('caster_id')), None)
                dmg, evs = self.take_damage(buff['power'] / 10.0, caster, board_state)
                events.extend(evs)
                if caster and caster.is_alive:
                    caster.hp = min(caster.max_hp, caster.hp + buff['power'] / 10.0)
            elif bt == 'mana_battery':
                self.mana = min(self.max_mana, self.mana + buff['power']/10)
            elif bt in ['stun', 'time_stopped']:
                self.is_stunned = True
            elif bt == 'mana_lock':
                self.is_mana_locked = True
            elif bt == 'submerge':
                self.is_submerged = True
            elif bt == 'polymorph':
                self.is_polymorphed = True
                
            # --- XÓA BUFF KHI HẾT HẠN ---
            if has_duration and buff['duration'] <= 0:
                if bt == 'buff_atk': self.attack -= buff['power']
                elif bt == 'speed_buff': self.speed -= buff['power'] 
                elif bt == 'speed_debuff': self.speed += buff['power']
                elif bt == 'mind_control': self.team = buff['original_team'] 
                elif bt == 'banish': self.is_banished = False
                elif bt == 'submerge': self.is_submerged = False
                elif bt == 'stat_steal_victim': self.attack += buff['power']
                elif bt == 'stat_steal_beneficiary': self.attack -= buff['power']
                elif bt == 'hp_shield': self.shield = 0
                self.active_buffs.remove(buff)

        return events

    def to_dict(self):
        safe_buffs = []
        for b in self.active_buffs:
            safe_buffs.append({k: v for k, v in b.items() if isinstance(v, (str, int, float, bool))})
            
        return {
            'id': self.id, 'name': self.name, 'team': self.team,
            'x': self.x, 'y': self.y, 'hp': self.hp, 'mana': self.mana, 'shield': getattr(self, 'shield', 0),
            'max_hp': self.max_hp, 'max_mana': self.max_mana,
            'attack': self.attack, 'speed': self.speed, 'attack_range': self.attack_range,
            'is_alive': self.is_alive, 'star': getattr(self, 'star', 1),
            'buffs': [b['type'] for b in self.active_buffs],
            'buff_details': safe_buffs
        }

def calculate_distance(x1, y1, x2, y2): return math.hypot(x2 - x1, y2 - y1)

def find_closest_target(attacker, board_state):
    closest_target, min_dist = None, float('inf')
    for champ in board_state:
        if champ.team != attacker.team and champ.is_alive and not getattr(champ, 'is_submerged', False) and not getattr(champ, 'is_banished', False):
            dist = calculate_distance(attacker.x, attacker.y, champ.x, champ.y)
            if dist < min_dist: min_dist = dist; closest_target = champ
            
    if closest_target: attacker.current_target_id = closest_target.id
    else: attacker.current_target_id = None
    
    return closest_target

def move_towards(champ, target_x, target_y):
    step = 0.08 * max(0.1, champ.speed) 
    dx, dy = target_x - champ.x, target_y - champ.y
    dist = calculate_distance(champ.x, champ.y, target_x, target_y)
    if dist > 0:
        actual_step = min(step, dist)
        champ.x += (dx / dist) * actual_step; champ.y += (dy / dist) * actual_step