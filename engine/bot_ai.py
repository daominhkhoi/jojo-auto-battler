# engine/bot_ai.py
"""
Balanced Smart AI Bot for WarAnimal Auto-Battler.
Strictly balanced according to the player's economy and shop roll rates:
- Gold Economy: Starts with 10 gold, earns identical round income: min(round * 3 + 5, 35)
- Level Progression: Linear level-up cost: level * 4 (same as player shop.js)
- Roll Rates: Identical cost probabilities by level (100% cost 1 at lv 1, 70/30 at lv 2, etc.)
- Star Merging: Authentic 3-copy merge for 2⭐, 3 of 2⭐ for 3⭐ (no free overpowered stars)
- Tactical Grid Positioning: Frontline tanks, backline carries, flank assassins
- Adaptive Synergies: Focuses on archetype traits while pursuing pairs and triples
"""

import random

# Predefined Archetypes matching the lore and active traits
BOT_ARCHETYPES = {
    'stardust': {
        'name': '🤖 Jotaro AI (Grandmaster)',
        'description': 'Stardust Crusader & Power Type Stand Rush',
        'primary_trait': 'Stardust',
        'secondary_traits': ['Power Type', 'Long-Distance'],
        'preferred_champions': [
            'Silver Chariot', 'Hierophant Green', 'Magician\'s Red',
            'Hermit Purple', 'Star Platinum', 'The World', 'Atom Heart Father'
        ],
    },
    'bucciarati': {
        'name': '🤖 Giorno AI (Requiem)',
        'description': 'Passione Skill Burst & High Impact Execution',
        'primary_trait': 'Bucciarati',
        'secondary_traits': ['La Squadra', 'Unita Speciale', 'Requiem'],
        'preferred_champions': [
            'Sticky Fingers', 'Aerosmith', 'Sex Pistols', 'Gold Experience',
            'Purple Haze', 'Moody Blues', 'Beach Boy', 'Gold Experience Requiem'
        ],
    },
    'morioh': {
        'name': '🤖 Kira AI (Tactician)',
        'description': 'Morioh High HP Fortress & Lethal Execution',
        'primary_trait': 'Morioh',
        'secondary_traits': ['Bound', 'Power Type', 'Utility'],
        'preferred_champions': [
            'Crazy Diamond', 'The Hand', 'Echoes Act3', 'Bad Company',
            'Aqua Necklace', 'Cheap Trick', 'Harvest', 'Killer Queen'
        ],
    },
    'green_dolphin': {
        'name': '🤖 Pucci AI (Strategist)',
        'description': 'Green Dolphin Reflect Shield & Area Disruption',
        'primary_trait': 'Green Dolphin',
        'secondary_traits': ['Power Type', 'Phenomenon', 'Automatic'],
        'preferred_champions': [
            'Stone Free', 'Diver Down', 'Whitesnake', 'Foo Fighters',
            'Weather Report', 'Kiss', 'Dragon\'s Dream', 'C-MOON'
        ],
    },
    'tarot': {
        'name': '🤖 DIO AI (The World)',
        'description': 'Tarot Instant Mana Burst & Time Manipulation',
        'primary_trait': 'Tarot',
        'secondary_traits': ['Phenomenon', 'Bound', 'Utility'],
        'preferred_champions': [
            'Cream', 'Hanged Man', 'Horus', 'Geb', 'Emperor',
            'Death Thirteen', 'Dark Blue Moon', 'Anubis', 'The World'
        ],
    }
}


class SmartBot:
    def __init__(self, archetype_key=None):
        if not archetype_key or archetype_key not in BOT_ARCHETYPES:
            archetype_key = random.choice(list(BOT_ARCHETYPES.keys()))

        self.archetype_key = archetype_key
        self.archetype = BOT_ARCHETYPES[archetype_key]
        self.name = self.archetype['name']

        # Economy strictly matching player rules
        self.round_number = 1
        self.level = 1
        self.gold = 10
        self.roster = {} # champ_name -> list of stars, e.g. {'Silver Chariot': [1, 2]}
        self.prev_player_champs = []

    def _roll_cost_by_level(self):
        """
        Exact Python mirror of static/js/shop.js rollChampion() probability table.
        - Level 1: 100% Cost 1
        - Level 2: 70% Cost 1, 30% Cost 2
        - Level 3: 50% Cost 1, 35% Cost 2, 15% Cost 3
        - Level 4: 30% Cost 1, 40% Cost 2, 25% Cost 3, 5% Cost 4
        - Level 5: 15% Cost 1, 30% Cost 2, 40% Cost 3, 14% Cost 4, 1% Cost 5
        - Level 6+: 10% Cost 1, 15% Cost 2, 30% Cost 3, 25% Cost 4, 20% Cost 5
        """
        roll = random.random() * 100
        lvl = self.level
        if lvl == 1:
            return 1
        elif lvl == 2:
            return 1 if roll < 70 else 2
        elif lvl == 3:
            return 1 if roll < 50 else (2 if roll < 85 else 3)
        elif lvl == 4:
            return 1 if roll < 30 else (2 if roll < 70 else (3 if roll < 95 else 4))
        elif lvl == 5:
            return 1 if roll < 15 else (2 if roll < 45 else (3 if roll < 85 else (4 if roll < 99 else 5)))
        else: # Level 6+
            return 1 if roll < 10 else (2 if roll < 25 else (3 if roll < 55 else (4 if roll < 80 else 5)))

    def _generate_shop(self, champion_data):
        """Roll 7 cards using the exact level roll probabilities."""
        cost_map = {}
        for name, data in champion_data.items():
            c = data.get('cost', 1)
            cost_map.setdefault(c, []).append(name)

        shop = []
        for _ in range(7):
            target_cost = self._roll_cost_by_level()
            candidates = cost_map.get(target_cost, cost_map.get(1, []))
            if candidates:
                shop.append(random.choice(candidates))
        return shop

    def _check_merge(self, name):
        """Authentic 3-of-a-kind merging (3 of 1⭐ -> 2⭐, 3 of 2⭐ -> 3⭐)."""
        stars = self.roster.get(name, [])
        for st in (1, 2):
            if stars.count(st) >= 3:
                for _ in range(3):
                    stars.remove(st)
                stars.append(st + 1)
                self.roster[name] = stars
                self._check_merge(name)
                break

    def on_round_end(self, winner, player_board=None):
        """Called by server referee at the end of each combat round."""
        self.round_number += 1
        if player_board:
            self.prev_player_champs = player_board

    def _simulate_shopping_phase(self, champion_data, champion_traits):
        """
        Simulate preparation phase:
        - Gain round income (same formula as player: currentRound * 3 + 5 capped at 35)
        - Level up according to natural player pacing (level * 4)
        - Roll and buy cards based on archetype and pair-seeking logic
        """
        # Income for this round
        if self.round_number > 1:
            raw_income = self.round_number * 3 + 5
            self.gold += min(raw_income, 35)

        # 1. Leveling strategy (player levels up linearly)
        # Cap level at round_number, max 6
        target_lvl = min(6, self.round_number)
        level_cost = self.level * 4
        while self.level < target_lvl and self.gold >= level_cost + 3:
            self.gold -= level_cost
            self.level += 1
            level_cost = self.level * 4

        # 2. Shop Rolls & Buying
        max_rolls = 2 if self.round_number >= 3 else 1
        rolls_done = 0

        while rolls_done <= max_rolls:
            shop = self._generate_shop(champion_data)
            for champ_name in shop:
                tmpl = champion_data.get(champ_name, {})
                cost = tmpl.get('cost', 1)
                traits = champion_traits.get(champ_name, [])

                # Calculate appeal
                score = 0
                if self.archetype['primary_trait'] in traits:
                    score += 6
                for sec in self.archetype['secondary_traits']:
                    if sec in traits:
                        score += 3
                if champ_name in self.archetype['preferred_champions']:
                    score += 2

                # Existing copies boost (seek 2⭐ and 3⭐!)
                existing = self.roster.get(champ_name, [])
                if existing.count(1) == 1:
                    score += 4 # Holds a pair
                elif existing.count(1) == 2:
                    score += 10 # Completes 2-star!
                elif existing.count(2) == 2:
                    score += 18 # Completes 3-star!

                # If board has empty slots, buy filler unit
                total_roster_units = sum(len(v) for v in self.roster.values())
                if total_roster_units < self.level and score == 0:
                    score += 2

                # Counter-play: buy assassin if player has backline carry
                if self._player_has_backline_carry(champion_data):
                    if tmpl.get('skill', {}).get('type') in ('blink_strike', 'execute'):
                        score += 5

                # Buy if score is good and can afford
                if score >= 3 and self.gold >= cost:
                    self.gold -= cost
                    self.roster.setdefault(champ_name, []).append(1)
                    self._check_merge(champ_name)

            if self.gold >= 4 and rolls_done < max_rolls:
                self.gold -= 1 # 1 gold per refresh
                rolls_done += 1
            else:
                break

    def build_team(self, champion_data, champion_traits):
        """
        Build and position the bot's team for this round.
        Returns a list of raw champion dicts:
        [{'id': str, 'name': str, 'star': int, 'x': int, 'y': int}]
        """
        # Execute realistic shopping turn
        self._simulate_shopping_phase(champion_data, champion_traits)

        # 1. Select best units from roster up to min(self.level, 6)
        candidates = []
        for name, stars in self.roster.items():
            for st in stars:
                tmpl = champion_data.get(name, {})
                cost = tmpl.get('cost', 1)
                traits = champion_traits.get(name, [])
                syn_score = (6 if self.archetype['primary_trait'] in traits else 0) + sum(3 for s in self.archetype['secondary_traits'] if s in traits)
                # Value calculation: 2-star and 3-star heavily prioritized, then synergy, then cost
                val = st * 20 + syn_score * 2 + cost * 1.5
                candidates.append((val, st, name))

        candidates.sort(key=lambda x: x[0], reverse=True)
        max_board_size = min(self.level, 6)
        chosen = candidates[:max_board_size]

        # 2. Categorize for tactical grid formation
        frontline, midline, backline, flankers = [], [], [], []

        for _, st, name in chosen:
            tmpl = champion_data.get(name, {})
            rng = tmpl.get('attack_range', 1.0)
            hp = tmpl.get('hp', 1000)
            skill = tmpl.get('skill', {})
            skill_type = skill.get('type', '')

            if skill_type in ('blink_strike', 'execute', 'banish'):
                flankers.append((name, st))
            elif rng >= 3.0:
                backline.append((name, st))
            elif rng <= 1.5 and hp >= 80000:
                frontline.append((name, st))
            else:
                midline.append((name, st))

        # 3. Position units on rows y=3..5 (which mirror to y=0..2 facing player)
        positioned = []
        occupied = set()
        unit_idx = 0

        def place(name, st, y, xs):
            nonlocal unit_idx
            for x in xs:
                if (x, y) not in occupied:
                    occupied.add((x, y))
                    positioned.append({'id': f"bot_{name}_{unit_idx}", 'name': name, 'star': st, 'x': x, 'y': y})
                    unit_idx += 1
                    return True
            for x in range(5):
                if (x, y) not in occupied:
                    occupied.add((x, y))
                    positioned.append({'id': f"bot_{name}_{unit_idx}", 'name': name, 'star': st, 'x': x, 'y': y})
                    unit_idx += 1
                    return True
            return False

        # Frontline tanks: row y=3, center columns
        for name, st in frontline:
            place(name, st, 3, [2, 1, 3, 0, 4])

        # Flankers/assassins: outer columns x=0, 4 on y=3 or y=4
        for name, st in flankers:
            if not place(name, st, 3, [0, 4, 1, 3]):
                place(name, st, 4, [0, 4, 2, 1, 3])

        # Backline carries: row y=5, corners & spread
        for name, st in backline:
            place(name, st, 5, [0, 4, 1, 3, 2])

        # Midline bruisers/supports: row y=4
        for name, st in midline:
            if not place(name, st, 4, [2, 1, 3, 0, 4]):
                if not place(name, st, 5, [2, 1, 3, 0, 4]):
                    place(name, st, 3, [2, 1, 3, 0, 4])

        return positioned

    def _player_has_backline_carry(self, champion_data):
        if not self.prev_player_champs:
            return False
        for c in self.prev_player_champs:
            c_name = c.get('name')
            c_y = c.get('y', 3)
            if c_y >= 5: # Backline
                tmpl = champion_data.get(c_name, {})
                if tmpl.get('attack_range', 1) >= 3 or tmpl.get('attack', 0) > 3000:
                    return True
        return False
