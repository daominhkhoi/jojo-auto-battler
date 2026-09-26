import math
import time
import random
import uuid

# =====================================================================
# CHAMPION COST REGISTRY
# Populated at app startup by app.py (single source of truth).
# No CSV read here anymore — avoids dual data-source divergence.
# =====================================================================
_CHAMPION_COSTS = {}

def register_champion_costs(cost_dict):
    """Called once at app startup with the loaded champion data."""
    _CHAMPION_COSTS.clear()
    _CHAMPION_COSTS.update(cost_dict)

def get_champion_cost(name):
    return _CHAMPION_COSTS.get(name, 1)


class Champion:
    def __init__(self, id, name, team, x, y, hp, attack, attack_range, speed, max_mana,
                 star=1, skill=None, start_mana=0, active_buffs=None,
                 raw_hp=None, raw_attack=None, raw_range=None, raw_speed=None,
                 raw_skill=None, applied_traits=None, mana_refund_ratio=0.0,
                 double_cast_chance=0.0):
        self.id = id
        self.name = name
        self.team = team
        self.x = x
        self.y = y
        self.hp = hp
        self.max_hp = hp
        self.raw_hp = raw_hp if raw_hp is not None else hp
        self.attack = attack
        self.base_attack = attack
        self.raw_attack = raw_attack if raw_attack is not None else attack
        self.attack_range = attack_range
        self.raw_range = raw_range if raw_range is not None else attack_range
        self.speed = speed
        self.base_speed = speed
        self.raw_speed = raw_speed if raw_speed is not None else speed
        self.mana = start_mana
        self.max_mana = max_mana if max_mana > 0 else 100
        self.mana_refund_ratio = mana_refund_ratio
        self.double_cast_chance = double_cast_chance
        self.pending_double_cast_ticks = 0
        self.is_alive = True
        self.star = star
        self.attack_cooldown = 0
        self.skill = skill if skill else {'type': 'damage', 'power': 50, 'duration': 0, 'target': 'enemy_closest'}
        self.raw_skill = raw_skill if raw_skill is not None else self.skill
        self.active_buffs = active_buffs if active_buffs else []
        self.applied_traits = applied_traits if applied_traits is not None else []

        # Trạng thái khống chế & đặc biệt — ALL reset at start of update_buffs tick
        self.is_stunned = False
        self.is_mana_locked = False
        self.is_submerged = False
        self.is_banished = False   # FIX: now also reset at top of update_buffs like the others
        self.is_polymorphed = False
        self.shield = 0
        self.original_team = team  # Dùng cho Mind Control đổi phe

    # ------------------------------------------------------------------
    def can_attack(self):
        if self.is_stunned or self.is_banished or getattr(self, 'is_polymorphed', False):
            return False
        if self.attack_cooldown > 0:
            safe_speed = max(0.1, self.speed)
            self.attack_cooldown -= 0.1 * safe_speed
            return False
        return True

    def reset_attack_cooldown(self):
        self.attack_cooldown = 1.0

    # ------------------------------------------------------------------
    def take_damage(self, amount, attacker, board_state):
        events = []
        if self.hp <= 0:
            return 0, events
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
        # FIX: Use take_damage on the attacker so their revive/shield/evasion applies.
        # Guard with a flag to prevent infinite reflect recursion and only reflect when actual damage > 0.
        if attacker and attacker.is_alive and not getattr(attacker, '_in_reflect', False) and actual_damage > 0:
            reflect_buffs = [b for b in self.active_buffs if b.get('type') == 'reflect_shield']
            if reflect_buffs:
                best_power = max((b.get('power', 0) for b in reflect_buffs), default=0)
                reflect_dmg = actual_damage * best_power
                if reflect_dmg > 0:
                    attacker._in_reflect = True
                    ref_dmg, ref_evs = attacker.take_damage(reflect_dmg, None, board_state)
                    attacker._in_reflect = False
                    if ref_dmg > 0:
                        events.append({'type': 'reflect', 'targetId': attacker.id, 'defenderId': self.id, 'damage': ref_dmg})
                    events.extend(ref_evs)

        # 3. Damage Link
        for buff in self.active_buffs:
            if buff['type'] == 'damage_link':
                linked_target = buff['linked_target']
                if linked_target and linked_target.is_alive:
                    linked_target.hp -= actual_damage
                    events.append({'type': 'damage_link_proc', 'caster_id': self.id,
                                   'target_id': linked_target.id, 'damage': actual_damage})
                    if linked_target.hp <= 0:
                        revive_buff = next((b for b in linked_target.active_buffs if b['type'] == 'revive'), None)
                        if revive_buff:
                            linked_target.hp = linked_target.max_hp
                            linked_target.is_alive = True
                            linked_target.active_buffs.remove(revive_buff)
                            events.append({'type': 'revive', 'target_id': linked_target.id})
                        else:
                            linked_target.is_alive = False

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

    # ------------------------------------------------------------------
    # HỆ THỐNG QUÉT MỤC TIÊU THÔNG MINH
    # ------------------------------------------------------------------
    def resolve_target(self, target_mode, board_state):
        enemies = [c for c in board_state if c.team != self.team and c.is_alive
                   and not c.is_submerged and not c.is_banished]
        allies  = [c for c in board_state if c.team == self.team and c.is_alive
                   and not c.is_banished]

        if not enemies and target_mode.startswith('enemy'):
            return None

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

    # ------------------------------------------------------------------
    def cast_skill(self, base_target, board_state, is_bonus_cast=False):
        if not is_bonus_cast:
            refund_ratio = getattr(self, 'mana_refund_ratio', 0.0)
            refund = round(self.max_mana * refund_ratio) if refund_ratio > 0 else 0
            self.mana = min(self.max_mana - 1, refund) if refund > 0 else 0
        else:
            refund = 0
            refund_ratio = 0.0
        if not self.is_alive or self.is_stunned or self.is_banished:
            return None

        s_type  = self.skill.get('type', 'damage')
        t_mode  = self.skill.get('target', 'enemy_closest')

        # Ngăn Clone dùng chiêu đẻ Clone liên tục
        if s_type == 'clone' and getattr(self, 'is_clone', False):
            s_type = 'damage'
            t_mode = 'enemy_closest'

        # Tự động tìm mục tiêu chuẩn xác theo Target Mode
        if t_mode == 'self':
            target = self
        elif t_mode in ['all_enemies', 'all_except_self']:
            target = None
        else:
            target = self.resolve_target(t_mode, board_state)

        s_power   = int(self.skill.get('power', 0))
        s_duration = float(self.skill.get('duration', 0))
        s_percent  = float(self.skill.get('percent', 0))
        s_radius   = float(self.skill.get('radius', 1.5))

        event = {
            'type': 'skill', 'skill_type': s_type,
            'casterId': self.id, 'targetId': target.id if target else self.id,
            'radius': s_radius, 'duration': s_duration, 'power': s_power
        }

        # Utility Trait: sự kiện hoàn trả mana sau khi tung chiêu
        if refund > 0:
            event.setdefault('extra_events', []).append({
                'type': 'mana_refund',
                'target_id': self.id,
                'amount': refund,
                'percent': int(round(refund_ratio * 100))
            })

        # 1. TIME STOP
        if s_type == 'time_stop':
            for c in board_state:
                if c.id != self.id and c.is_alive:
                    c.active_buffs.append({'type': 'time_stopped', 'duration': s_duration})
            bonus_speed = self.base_speed * 3
            self.speed += bonus_speed
            self.active_buffs.append({'type': 'speed_buff', 'power': bonus_speed, 'duration': s_duration})
            self.active_buffs.append({'type': 'mana_lock', 'duration': s_duration})

        # 1.5. RETURN TO ZERO
        elif s_type == 'return_to_zero':
            pct = float(self.skill.get('percent', 0.20))
            if pct <= 0:
                pct = 0.20
            dmg = int(round(self.max_hp * pct))
            for c in board_state:
                if c.team != self.team and c.is_alive:
                    c.mana = 0
                    for buff in c.active_buffs[:]:
                        bt = buff['type']
                        if bt == 'buff_atk':                 c.attack -= buff['power']
                        elif bt == 'speed_buff':             c.speed  -= buff['power']
                        elif bt == 'speed_debuff':           c.speed  += buff['power']
                        elif bt == 'mind_control':           c.team    = buff.get('original_team', c.team)
                        elif bt == 'banish':                 c.is_banished   = False
                        elif bt == 'submerge':               c.is_submerged  = False
                        elif bt == 'stat_steal_victim':      c.attack += buff['power']
                        elif bt == 'stat_steal_beneficiary': c.attack = max(0, c.attack - buff['power'])
                        c.active_buffs.remove(buff)

                    # Gây sát thương = 20% máu bản thân cho toàn địch
                    actual_dmg, evs = c.take_damage(dmg, self, board_state)
                    event.setdefault('extra_events', []).extend(evs)
                    event.setdefault('extra_events', []).append({
                        'type': 'aoe_damage_hit',
                        'target_id': c.id,
                        'damage': actual_dmg
                    })

        # 2. BLINK STRIKE
        elif s_type == 'blink_strike' and target:
            offset_y = 1 if target.team == 'Team1' else -1
            self.x = target.x
            self.y = max(0, min(5, target.y + offset_y))
            dmg, evs = target.take_damage(s_power, self, board_state)
            event.setdefault('extra_events', []).extend(evs)

        # 3. PULL
        elif s_type == 'pull':
            if target and target.is_alive and not getattr(target, 'is_submerged', False):
                targets = [target]
            else:
                targets = [c for c in board_state if c.team != self.team and c.is_alive and not getattr(c, 'is_submerged', False)]

            for c in targets:
                c.x, c.y = self.x, self.y
                dmg, evs = c.take_damage(s_power, self, board_state)
                event.setdefault('extra_events', []).extend(evs)

        # 4. EXECUTE
        elif s_type == 'execute' and target:
            if 0 < s_percent <= 1.0:
                threshold = s_percent
            else:
                cost = get_champion_cost(self.name)
                cost_thresholds = {1: 0.10, 2: 0.20, 3: 0.25, 4: 0.30, 5: 0.35}
                threshold = cost_thresholds.get(cost, 0.20)

            if (target.hp / max(1, target.max_hp)) < threshold:
                dmg, evs = target.take_damage(999999, self, board_state)
            else:
                dmg, evs = target.take_damage(s_power, self, board_state)
            event['extra_events'] = evs

        # 5. SUBMERGE
        elif s_type == 'submerge':
            self.is_submerged = True
            self.active_buffs.append({'type': 'submerge', 'duration': s_duration})

        # 6. POLYMORPH
        elif s_type == 'polymorph' and target:
            target.is_polymorphed = True
            target.active_buffs.append({'type': 'polymorph', 'duration': s_duration})

        # 7. MIND CONTROL
        elif s_type == 'mind_control' and target:
            if not any(b['type'] == 'mind_control' for b in target.active_buffs):
                target.team = self.team
                target.active_buffs.append({
                    'type': 'mind_control', 'duration': s_duration,
                    'original_team': target.original_team
                })

        # 8. RICOCHET
        elif s_type == 'ricochet' and target:
            bounce_count   = int(s_radius) if s_radius > 0 else 3
            current_target = target
            bounce_path    = [target.id]
            for _ in range(bounce_count):
                if not current_target or not current_target.is_alive:
                    break
                dmg, evs = current_target.take_damage(s_power, self, board_state)
                event.setdefault('extra_events', []).extend(evs)
                next_targets = [c for c in board_state
                                if c.team != self.team and c.is_alive
                                and c != current_target
                                and not getattr(c, 'is_submerged', False)]
                if not next_targets:
                    break
                current_target = min(next_targets,
                                     key=lambda c: calculate_distance(current_target.x, current_target.y, c.x, c.y),
                                     default=None)
                if current_target:
                    bounce_path.append(current_target.id)
            event['bounce_path'] = bounce_path

        # 9. SOUL SWAP
        elif s_type == 'soul_swap':
            self.soul_swap_count = getattr(self, 'soul_swap_count', 0)
            if self.soul_swap_count < 1:
                self.soul_swap_count += 1
                enemy_team = [c for c in board_state
                              if c.team != self.team and c.is_alive
                              and not getattr(c, 'is_banished', False)]
                ally_team  = [c for c in board_state
                              if c.team == self.team and c.is_alive
                              and c.id != self.id and not getattr(c, 'is_banished', False)]
                if enemy_team and ally_team:
                    enemy_target = max(enemy_team, key=lambda c: (get_champion_cost(c.name), getattr(c, 'star', 1)))
                    ally_target  = min(ally_team,  key=lambda c: (get_champion_cost(c.name), getattr(c, 'star', 1)))
                    event['targetId'] = enemy_target.id
                    # Swap teams — keep original_team consistent (FIX: don't overwrite original_team)
                    enemy_target.team = ally_target.original_team
                    ally_target.team  = enemy_target.original_team
                    # Swap positions
                    enemy_target.x, ally_target.x = ally_target.x, enemy_target.x
                    enemy_target.y, ally_target.y = ally_target.y, enemy_target.y
                    # Heal to full
                    enemy_target.hp = getattr(enemy_target, 'max_hp', 1000)
                    ally_target.hp  = getattr(ally_target,  'max_hp', 1000)
                    event.setdefault('extra_events', []).extend([
                        {'type': 'swap', 'target_id': enemy_target.id},
                        {'type': 'swap', 'target_id': ally_target.id},
                    ])

        # 10. MANA BATTERY
        elif s_type == 'mana_battery' and target:
            target.active_buffs.append({'type': 'mana_battery', 'power': s_power, 'duration': s_duration})

        # 11. DAMAGE — FIX: now routes through take_damage so shields/evasion/revive apply
        elif s_type == 'damage' and target:
            dmg, evs = target.take_damage(s_power, self, board_state)
            event.setdefault('extra_events', []).extend(evs)

        elif s_type == 'heal' and target:
            if s_duration > 0:
                target.active_buffs.append({'type': 'heal', 'power': s_power, 'duration': s_duration})
            else:
                target.hp = min(target.max_hp, target.hp + s_power)
                event.setdefault('extra_events', []).append({
                    'type': 'heal', 'target_id': target.id, 'power': s_power
                })

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
            dmg, evs = target.take_damage(s_power, self, board_state)
            event.setdefault('extra_events', []).extend(evs)

        elif s_type == 'clone':
            has_clone = any(c.id.startswith(f"{self.id}_clone_") and c.is_alive for c in board_state)
            if has_clone and target:
                dmg, evs = target.take_damage(self.attack * 3, self, board_state)
                event['skill_type'] = 'damage'
                event.setdefault('extra_events', []).extend(evs)
            else:
                # FIX: UUID-based clone ID — no more millisecond collision
                clone_id = f"{self.id}_clone_{uuid.uuid4().hex[:8]}"
                clone = Champion(
                    clone_id, self.name, self.team,
                    self.x + 0.5, self.y + 0.5,
                    self.max_hp * s_percent, self.attack * s_percent,
                    self.attack_range, self.speed, self.max_mana,
                    self.star, skill=self.skill
                )
                clone.is_clone = True
                event['spawned_clones'] = [clone]

        elif s_type == 'mana_lock' and target:
            target.active_buffs.append({'type': 'mana_lock', 'duration': s_duration})

        elif s_type == 'stun' and target:
            target.active_buffs.append({'type': 'stun', 'duration': s_duration})

        elif s_type == 'global_slow':
            slow_pct = s_percent * 100 if s_percent > 0 else 50
            for c in board_state:
                if c.team != self.team and c.is_alive \
                        and not getattr(c, 'is_submerged', False) \
                        and not getattr(c, 'is_banished', False):
                    penalty = c.base_speed * (slow_pct / 100.0)
                    # FIX: clamp so speed never goes below 0.1
                    c.speed = max(0.1, c.speed - penalty)
                    c.active_buffs.append({'type': 'speed_debuff', 'power': penalty, 'duration': s_duration})

        elif s_type == 'stat_steal' and target:
            actual_steal = s_power
            amount_drained = min(max(0, target.attack), actual_steal)
            target.attack = max(0, target.attack - actual_steal)
            self.attack   += actual_steal
            steal_dur = s_duration if s_duration > 0 else 5.0
            target.active_buffs.append({'type': 'stat_steal_victim',       'power': amount_drained, 'duration': steal_dur, 'caster_id': self.id})
            self.active_buffs.append(  {'type': 'stat_steal_beneficiary',  'power': actual_steal,  'duration': steal_dur, 'target_id': target.id})

        elif s_type == 'banish' and target:
            target.is_banished = True
            target.active_buffs.append({'type': 'banish', 'duration': s_duration if s_duration > 0 else 5})

        elif s_type == 'hp_shield' and target:
            new_shield = target.max_hp * s_percent
            target.shield = max(getattr(target, 'shield', 0), new_shield)
            target.active_buffs = [b for b in target.active_buffs if b['type'] != 'hp_shield']
            target.active_buffs.append({'type': 'hp_shield', 'duration': s_duration if s_duration > 0 else 5})

        elif s_type == 'damage_link' and target:
            self.active_buffs = [b for b in self.active_buffs if b['type'] != 'damage_link']
            self.active_buffs.append({
                'type': 'damage_link', 'linked_target': target,
                'caster_id': target.id, 'duration': s_duration if s_duration > 0 else 5
            })

        elif s_type == 'life_tether' and target:
            target.active_buffs = [b for b in target.active_buffs if b['type'] != 'life_tether']
            target.active_buffs.append({
                'type': 'life_tether', 'caster': self, 'caster_id': self.id,
                'power': s_power, 'duration': s_duration if s_duration > 0 else 5
            })

        elif s_type == 'evasion' and target:
            target.active_buffs.append({'type': 'evasion', 'duration': s_duration if s_duration > 0 else 5})

        elif s_type == 'revive':
            self.active_buffs.append({'type': 'revive', 'duration': 9999})

        return event

    # ------------------------------------------------------------------
    def update_buffs(self, board_state):
        # FIX: ALL status flags reset at top — including is_banished (unified pattern)
        self.is_stunned    = False
        self.is_mana_locked = False
        self.is_submerged  = False
        self.is_polymorphed = False
        self.is_banished   = False   # Now reset here too, re-applied by active buff below

        events = []

        for buff in self.active_buffs[:]:
            has_duration = 'duration' in buff
            if has_duration:
                buff['duration'] -= 0.1

            bt = buff['type']

            # --- TÁC DỤNG THEO THỜI GIAN (TICK CỦA BUFF) ---
            if bt == 'dot' or bt == 'aoe_dot':
                dmg, evs = self.take_damage(buff['power'] / 10.0, None, board_state)
                events.extend(evs)
            elif bt in ('regen', 'aoe_heal', 'heal'):
                self.hp = min(self.max_hp, self.hp + buff['power'] / 10.0)
            elif bt == 'life_tether':
                caster = next((c for c in board_state if c.id == buff.get('caster_id')), None)
                dmg, evs = self.take_damage(buff['power'] / 10.0, caster, board_state)
                events.extend(evs)
                if caster and caster.is_alive:
                    caster.hp = min(caster.max_hp, caster.hp + buff['power'] / 10.0)
            elif bt == 'mana_battery':
                self.mana = min(self.max_mana, self.mana + buff['power'] / 10)
            elif bt in ('stun', 'time_stopped'):
                self.is_stunned = True
            elif bt == 'mana_lock':
                self.is_mana_locked = True
            elif bt == 'submerge':
                self.is_submerged = True
            elif bt == 'polymorph':
                self.is_polymorphed = True
            elif bt == 'banish':
                self.is_banished = True   # FIX: re-applied each tick from buff list

            # --- XÓA BUFF KHI HẾT HẠN ---
            if has_duration and buff['duration'] <= 0:
                if bt == 'buff_atk':                self.attack  -= buff['power']
                elif bt == 'speed_buff':            self.speed   -= buff['power']
                elif bt == 'speed_debuff':          self.speed   += buff['power']
                elif bt == 'mind_control':          self.team     = buff['original_team']
                elif bt == 'banish':                pass  # is_banished already reset at top of next tick
                elif bt == 'submerge':              pass  # is_submerged already reset at top of next tick
                elif bt == 'stat_steal_victim':     self.attack  += buff['power']
                elif bt == 'stat_steal_beneficiary': self.attack = max(0, self.attack - buff['power'])
                elif bt == 'hp_shield':             self.shield   = 0
                self.active_buffs.remove(buff)

        return events

    # ------------------------------------------------------------------
    def to_dict(self):
        safe_buffs = []
        for b in self.active_buffs:
            safe_buffs.append({k: v for k, v in b.items() if isinstance(v, (str, int, float, bool))})

        return {
            'id': self.id, 'name': self.name, 'team': self.team,
            'x': self.x, 'y': self.y, 'hp': self.hp, 'mana': self.mana,
            'shield': getattr(self, 'shield', 0),
            'max_hp': self.max_hp, 'max_mana': self.max_mana,
            'attack': self.attack, 'speed': self.speed,
            'base_attack': getattr(self, 'base_attack', self.attack),
            'base_speed': getattr(self, 'base_speed', self.speed),
            'raw_hp': getattr(self, 'raw_hp', self.max_hp),
            'raw_attack': getattr(self, 'raw_attack', self.base_attack),
            'raw_range': getattr(self, 'raw_range', self.attack_range),
            'raw_speed': getattr(self, 'raw_speed', self.base_speed),
            'attack_range': self.attack_range,
            'is_alive': self.is_alive, 'star': getattr(self, 'star', 1),
            'skill': getattr(self, 'skill', None),
            'raw_skill': getattr(self, 'raw_skill', None),
            'applied_traits': getattr(self, 'applied_traits', []),
            'mana_refund_ratio': getattr(self, 'mana_refund_ratio', 0.0),
            'double_cast_chance': getattr(self, 'double_cast_chance', 0.0),
            'buffs': [b['type'] for b in self.active_buffs],
            'buff_details': safe_buffs
        }


# ======================================================================
def calculate_distance(x1, y1, x2, y2):
    return math.hypot(x2 - x1, y2 - y1)


def find_closest_target(attacker, board_state):
    closest_target, min_dist = None, float('inf')
    for champ in board_state:
        if (champ.team != attacker.team and champ.is_alive
                and not getattr(champ, 'is_submerged', False)
                and not getattr(champ, 'is_banished', False)):
            dist = calculate_distance(attacker.x, attacker.y, champ.x, champ.y)
            if dist < min_dist:
                min_dist = dist
                closest_target = champ

    attacker.current_target_id = closest_target.id if closest_target else None
    return closest_target


def move_towards(champ, target_x, target_y):
    step = 0.08 * max(0.1, champ.speed)
    dx, dy = target_x - champ.x, target_y - champ.y
    dist = calculate_distance(champ.x, champ.y, target_x, target_y)
    if dist > 0:
        actual_step = min(step, dist)
        champ.x += (dx / dist) * actual_step
        champ.y += (dy / dist) * actual_step