import sys
if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO
from engine.game_logic import (
    Champion, find_closest_target, calculate_distance, move_towards,
    register_champion_costs, CRIT_CHANCE, CRIT_MULTIPLIER
)
from engine.bot_ai import SmartBot, BOT_ARCHETYPES
import os
import random
import time
import uuid
import urllib.request
import ssl
import requests
import io
import pandas as pd
import gevent.lock

app = Flask(__name__)
# FIX: Secret key from environment variable — never hardcode secrets
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24))
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
socketio = SocketIO(app, cors_allowed_origins="*")

# ======================================================================
# CHAMPION DATA — Single source of truth, loaded once at startup
# ======================================================================
_CHAMPION_DATA = {}   # name → full stat dict
_CHAMPION_TRAITS = {} # name → list of trait strings

# Balanced skill damage floor (at least 20% - 35% of same-cost average HP)
_SKILL_BALANCE_OVERRIDES = {
    # 1. Chiêu gây sát thương tức thì (damage & blink_strike): 26% - 35% HP trung bình cùng cost
    'Planet Waves': 17500,
    'Green, Green Grass of Home': 18000,
    'Stray Cat': 18200,
    'Lovers': 18800,
    'High Priestess': 19200,
    'Marilyn Manson': 19800,
    'Cheap Trick': 26000,
    'Dragon\'s Dream': 26500,
    'Red Hot Chili Pepper': 25800,
    'Clash': 35000,
    'Beach Boy': 36500,
    'Stone Free': 36800,
    'Hanged Man': 37500,
    'Geb': 38000,
    'Aerosmith': 38500,

    # 2. Chiêu Execute: Ngưỡng HP kết liễu tỷ lệ theo Cost (Cost 1: 10%, Cost 2: 20%, Cost 3: 25%, Cost 4: 30%)
    'Rolling Stones': {'power': 21500, 'percent': 0.20},
    'Black Sabbath': {'power': 28500, 'percent': 0.25},
    'Killer Queen': {'power': 37500, 'percent': 0.30},

    # 3. Chiêu Đạn nảy (ricochet): 19% - 21.5% HP mỗi phát nảy (tổng 3 phát = ~60% HP)
    'Manhattan Transfer': 12800,
    'Emperor': 13000,
    'Sex Pistols': 23200,
    'Hierophant Green': 23800,

    # 4. Chiêu Sát thương đốt đơn mục tiêu (dot): 6.9% - 8.0% HP/giây (tổng đốt qua duration = 30% - 56% HP)
    'Empress': 4500,
    'Sky High': 4800,
    'Ratt': 6400,
    'Yo-Yo Ma': 6500,
    'Magician\'s Red': 8800,
    'Metallica': 11500,

    # 5. Chiêu Sát thương diện rộng (aoe_dot): 6.0% - 7.5% HP/giây (tổng đốt = 27% - 56% HP)
    'Strength': 4000,
    'Sun': 4000,
    'Under World': 4200,
    'Dark Blue Moon': 6200,
    'The Grateful Dead': 7600,
    'Bad Company': 10600,
    'Purple Haze': 10800,
    'Green Day': 6800,

    # 6. Chiêu Hồi máu, Hồi phục & Hút máu
    'Crazy Diamond': {'power': 55000, 'duration': 0},
    'Gold Experience': 6800,
    'Mr.President': 7600,
    'Foo Fighters': 4600,
    'Highway Star': 3500,

    # 7. Chiêu Lá chắn (hp_shield): Giảm % khiên nhưng kéo dài thời gian tồn tại gấp đôi (6.5s - 7.5s)
    'Kraft Work': {'percent': 0.25, 'duration': 6.5},
    'Spice Girl': {'percent': 0.25, 'duration': 6.5},
    'Yellow Temperance': {'percent': 0.25, 'duration': 6.5},
    'Diver Down': {'percent': 0.30, 'duration': 7.0},
    'The Fool': {'percent': 0.30, 'duration': 7.0},
    'White Album': {'percent': 0.35, 'duration': 7.5},

    # 8. Kéo & Đổi chỗ đơn mục tiêu (pull & swap)
    'The Hand': 36000,
    'Sticky Fingers': 32000,

    # 9. Tinh chỉnh thời gian khống chế (CC) & Mana
    'Death Thirteen': {'duration': 3.8, 'mana': 100},
    'Weather Report': {'duration': 4.8, 'mana': 100},
    'Justice': {'duration': 2.8},
    'Aqua Necklace': {'duration': 2.2},
    'Heaven\'s Door': {'duration': 2.2},

    # 10. Return to Zero: Gây sát thương = 10% Max HP bản thân cho toàn địch
    'Gold Experience Requiem': {'percent': 0.10},
}

_LAST_CHAMPION_SYNC_TIME = 0

def _fetch_google_sheets_csv(url):
    """
    Fetch CSV text from Google Sheets via standard urllib.request with robust SSL context
    to completely prevent gevent/urllib3 'maximum recursion depth exceeded' recursion loop on Render.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
    }
    req = urllib.request.Request(url, headers=headers)
    
    # 1. Try standard verified SSL context with urllib.request
    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=12, context=ctx) as resp:
            if resp.status == 200:
                raw = resp.read()
                return raw.decode('utf-8', errors='replace')
    except Exception as e1:
        # 2. Try unverified SSL context (fallback if OS CA certs missing)
        try:
            unverified_ctx = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=12, context=unverified_ctx) as resp:
                if resp.status == 200:
                    raw = resp.read()
                    return raw.decode('utf-8', errors='replace')
        except Exception as e2:
            # 3. Fallback to requests if available
            try:
                r = requests.get(url, timeout=12, headers=headers)
                if r.status_code == 200 and len(r.text) > 100:
                    return r.text
            except Exception as e3:
                raise Exception(f"urllib error: {e1} / {e2}; requests error: {e3}")
    return None

def _load_champion_data(force_remote=False):
    """
    Load champion data from Google Sheets (source of truth) or local fallback CSV.
    Caches to champions.csv so offline play is supported.
    """
    global _CHAMPION_DATA, _CHAMPION_TRAITS, _LAST_CHAMPION_SYNC_TIME

    local_csv = os.path.join(os.path.dirname(__file__), 'champions.csv')
    df = None
    source = None
    fetch_error = None

    # 1. Fetch from Google Sheets first (with cache-buster parameter)
    url = (
        "https://docs.google.com/spreadsheets/d/e/"
        "2PACX-1vREGk7FjfrTa0W2mzlWKfzeJX-JOPEu7CsNgt8ksH6RxoRyo9EfS7JSoFxamK8KOdwGYZp8h7oOC9uw"
        f"/pub?gid=1700806245&single=true&output=csv&_t={int(time.time())}"
    )
    try:
        csv_text = _fetch_google_sheets_csv(url)
        if csv_text and len(csv_text) > 100:
            df = pd.read_csv(io.StringIO(csv_text), sep=',', encoding='utf-8')
            source = "Google Sheets (Live)"
            # Cache locally to champions.csv for offline backup
            try:
                with open(local_csv, 'w', encoding='utf-8') as f:
                    f.write(csv_text)
                print(f"[OK] Cached Google Sheets to local '{os.path.basename(local_csv)}'.")
            except Exception as save_err:
                print(f"[WARN] Local CSV cache write failed: {save_err}")
        else:
            fetch_error = "Dữ liệu Google Sheets trả về rỗng"
    except Exception as e:
        fetch_error = str(e)
        print(f"[WARN] Google Sheets fetch failed ({e}). Checking local CSV fallback...")

    is_live = (source == "Google Sheets (Live)")

    # 2. Fallback to local CSV if network call fails
    if df is None:
        if os.path.exists(local_csv):
            try:
                df = pd.read_csv(local_csv, sep=',', encoding='utf-8')
                source = f"local '{os.path.basename(local_csv)}'"
            except Exception as e:
                print(f"[WARN] Local CSV load failed: {e}")
        else:
            alt_csv = os.path.join(os.path.dirname(__file__), 'champions - champions.csv')
            if os.path.exists(alt_csv):
                try:
                    df = pd.read_csv(alt_csv, sep=',', encoding='utf-8')
                    source = f"local '{os.path.basename(alt_csv)}'"
                except Exception as e:
                    print(f"[WARN] Alt CSV load failed: {e}")

    if df is None:
        print("[ERR] Cannot load champion data from Google Sheets or local CSV.")
        return False, "Failed to load from both Google Sheets and local CSV"

    df.columns = df.columns.str.replace('\ufeff', '').str.strip()
    df = df.fillna('')

    new_champ_data = {}
    new_champ_traits = {}

    for _, row in df.iterrows():
        name = str(row.get('Name', '')).strip()
        if not name or name in ('nan', 'None'):
            continue

        traits_str = str(row.get('Traits', ''))
        traits = [t.strip() for t in traits_str.split(',')] if traits_str and traits_str != 'nan' else []

        skill_type = str(row.get('SkillType', 'damage')).strip()
        skill = {'type': skill_type if skill_type and skill_type != 'nan' else 'damage'}

        power_val = row.get('SkillStat', '')
        dur_val = row.get('SkillDuration', '')

        # User's sheet SkillStat takes precedence over _SKILL_BALANCE_OVERRIDES
        if power_val != '' and str(power_val) != 'nan':
            val = float(power_val)
            if val <= 2:
                skill['percent'] = val
            else:
                skill['power'] = int(val)
        elif name in _SKILL_BALANCE_OVERRIDES:
            ov = _SKILL_BALANCE_OVERRIDES[name]
            if isinstance(ov, dict):
                if 'power' in ov: skill['power'] = int(ov['power'])
                if 'percent' in ov: skill['percent'] = float(ov['percent'])
            elif isinstance(ov, (int, float)):
                if ov <= 2: skill['percent'] = float(ov)
                else:       skill['power']   = int(ov)

        # Default execute percent threshold by cost if not explicitly provided
        if skill.get('type') == 'execute' and 'percent' not in skill:
            cost_val = int(row.get('Cost', 1)) if row.get('Cost') != '' else 1
            cost_thresholds = {1: 0.10, 2: 0.20, 3: 0.25, 4: 0.30, 5: 0.35}
            skill['percent'] = cost_thresholds.get(cost_val, 0.20)

        # Duration: user sheet takes precedence
        if dur_val != '' and str(dur_val) != 'nan':
            skill['duration'] = float(dur_val)
        elif name in _SKILL_BALANCE_OVERRIDES and isinstance(_SKILL_BALANCE_OVERRIDES[name], dict) and 'duration' in _SKILL_BALANCE_OVERRIDES[name]:
            skill['duration'] = float(_SKILL_BALANCE_OVERRIDES[name]['duration'])
        else:
            skill['duration'] = 0.0

        rad_val = row.get('Radius', '')
        if rad_val != '' and str(rad_val) != 'nan':
            skill['radius'] = float(rad_val)

        tgt_val = str(row.get('Target', 'enemy_closest')).strip()
        skill['target'] = tgt_val if tgt_val and tgt_val != 'nan' else 'enemy_closest'

        # Mana: user sheet takes precedence
        sheet_mana = row.get('Mana', '')
        if sheet_mana != '' and str(sheet_mana) != 'nan':
            final_mana = int(sheet_mana)
        elif name in _SKILL_BALANCE_OVERRIDES and isinstance(_SKILL_BALANCE_OVERRIDES[name], dict) and 'mana' in _SKILL_BALANCE_OVERRIDES[name]:
            final_mana = int(_SKILL_BALANCE_OVERRIDES[name]['mana'])
        else:
            final_mana = 200

        new_champ_data[name] = {
            'name': name,
            'cost':         int(row.get('Cost', 1))     if row.get('Cost')  != '' else 1,
            'hp':           int(row.get('HP', 1000))    if row.get('HP')    != '' else 1000,
            'attack':       int(row.get('ATK', 100))    if row.get('ATK')   != '' else 100,
            'attack_range': float(row.get('Range', 1))  if row.get('Range') != '' else 1,
            'speed':        float(row.get('Speed', 1))  if row.get('Speed') != '' else 1,
            'max_mana':     final_mana,
            'traits': traits,
            'skill':  skill,
        }
        new_champ_traits[name] = traits

    _CHAMPION_DATA.clear()
    _CHAMPION_DATA.update(new_champ_data)
    _CHAMPION_TRAITS.clear()
    _CHAMPION_TRAITS.update(new_champ_traits)
    _LAST_CHAMPION_SYNC_TIME = time.time()

    # Register costs into game_logic for soul_swap cost lookups
    register_champion_costs({n: d['cost'] for n, d in _CHAMPION_DATA.items()})
    if is_live:
        msg = f"Đã đồng bộ thành công {len(_CHAMPION_DATA)} tướng trực tiếp từ Google Sheets!"
        print(f"[OK] {msg}")
        return True, msg
    else:
        msg = f"Cảnh báo: Không thể tải trực tiếp từ Google Sheets ({fetch_error}). Đang dùng dữ liệu lưu tạm {source}!"
        print(f"[WARN] {msg}")
        return False, msg

# Load immediately at import time (before first request)
_load_champion_data()

# ======================================================================
# TRAIT BUFF COMPUTATION — server-side (moved from network.js)
# ======================================================================
def _compute_trait_buffs(board_champs_raw, trait_counts):
    """
    Given a list of raw champion dicts (name, x, y, star, id, etc.)
    and precomputed trait counts, return a list of Champion-ready dicts
    with all stat buffs applied.
    This is the Python mirror of the old declareReady() JS logic.
    """
    # Global HP buff (applies to ALL allies regardless of traits)
    global_hp_buff = 0
    if trait_counts.get("Team Bucciarati", 0) >= 6: global_hp_buff += 70000
    elif trait_counts.get("Team Bucciarati", 0) >= 4: global_hp_buff += 35000
    elif trait_counts.get("Team Bucciarati", 0) >= 2: global_hp_buff += 15000

    result = []
    for c in board_champs_raw:
        name     = c['name']
        template = _CHAMPION_DATA.get(name, {})
        traits   = _CHAMPION_TRAITS.get(name, [])

        # Base stats from SERVER data — client values are IGNORED except star/position/id
        star   = c.get('star', 1)
        base_hp  = template.get('hp', 1000)
        base_atk = template.get('attack', 100)

        # Apply star multiplier (same formula as the client merge)
        star_mult = 1.8 ** (star - 1)
        base_hp  = round(base_hp  * star_mult)
        base_atk = round(base_atk * star_mult)

        final_hp    = base_hp + global_hp_buff
        final_attack = base_atk
        final_range  = template.get('attack_range', 1.0)
        final_speed  = template.get('speed', 1.0)
        final_mana   = 0
        mana_refund_ratio = 0.0
        double_cast_chance = 0.0

        # Star scaling for skill attributes (power, duration, radius, percent)
        skill_power_mult = 1.6 ** (star - 1)
        skill_dur_mult   = 1.2 ** (star - 1)
        skill_rad_mult   = 1.2 ** (star - 1)
        skill_pct_mult   = 1.3 ** (star - 1)

        final_skill = dict(template.get('skill', {'type': 'damage', 'power': 50, 'duration': 0}))
        if 'power' in final_skill and final_skill['power']:
            final_skill['power'] = round(final_skill['power'] * skill_power_mult)
        if 'duration' in final_skill and final_skill['duration']:
            final_skill['duration'] = round(final_skill['duration'] * skill_dur_mult, 1)
        if 'radius' in final_skill and final_skill['radius']:
            final_skill['radius'] = round(final_skill['radius'] * skill_rad_mult, 1)
        if 'percent' in final_skill and final_skill['percent']:
            final_skill['percent'] = min(0.85, round(final_skill['percent'] * skill_pct_mult, 2))

        # Store pre-trait baseline stats (scaled strictly by star level)
        raw_hp = base_hp
        raw_attack = base_atk
        raw_range = round(float(template.get('attack_range', 1.0)), 2)
        raw_speed = round(float(template.get('speed', 1.0)), 2)
        raw_skill = dict(final_skill)

        final_buffs  = []

        # === FACTIONS ===
        if "Stardust" in traits:
            tc = trait_counts.get("Stardust", 0)
            if tc >= 6:   final_hp *= 1.9; final_attack *= 1.9
            elif tc >= 4: final_hp *= 1.5; final_attack *= 1.5
            elif tc >= 2: final_hp *= 1.2; final_attack *= 1.2

        if "Tarot" in traits:
            tc = trait_counts.get("Tarot", 0)
            if tc >= 6:   final_mana = 100
            elif tc >= 4: final_mana = 60
            elif tc >= 2: final_mana = 30

        if "Morioh" in traits:
            tc = trait_counts.get("Morioh", 0)
            if tc >= 6:   final_hp *= 2.2
            elif tc >= 4: final_hp *= 1.6
            elif tc >= 2: final_hp *= 1.25

        if "Bucciarati" in traits:
            tc = trait_counts.get("Bucciarati", 0)
            if tc >= 6:
                double_cast_chance = 1.00
                if final_skill.get('power'):
                    final_skill['power'] = round(final_skill['power'] * 1.60)
            elif tc >= 4:
                double_cast_chance = 0.66
                if final_skill.get('power'):
                    final_skill['power'] = round(final_skill['power'] * 1.40)
            elif tc >= 2:
                double_cast_chance = 0.33
                if final_skill.get('power'):
                    final_skill['power'] = round(final_skill['power'] * 1.20)

        if "La Squadra" in traits:
            tc = trait_counts.get("La Squadra", 0)
            if tc >= 6:   final_attack *= 2.2
            elif tc >= 4: final_attack *= 1.6
            elif tc >= 2: final_attack *= 1.25

        if "Unita Speciale" in traits:
            tc = trait_counts.get("Unita Speciale", 0)
            if tc >= 4:
                final_speed *= 1.6
                if final_skill.get('power'): final_skill['power'] = round(final_skill['power'] * 1.6)
            elif tc >= 2:
                final_speed *= 1.3
                if final_skill.get('power'): final_skill['power'] = round(final_skill['power'] * 1.3)

        if "Green Dolphin" in traits:
            tc = trait_counts.get("Green Dolphin", 0)
            reflect = 0
            if tc >= 6:   reflect = 0.9
            elif tc >= 4: reflect = 0.5
            elif tc >= 2: reflect = 0.2
            if reflect > 0:
                final_buffs.append({'type': 'reflect_shield', 'power': reflect})

        if "Requiem" in traits:
            tc = trait_counts.get("Requiem", 0)
            if tc >= 2:   final_hp *= 1.8; final_attack *= 2.0
            elif tc >= 1: final_attack *= 1.5

        # === CLASSES ===
        if "Power Type" in traits:
            tc = trait_counts.get("Power Type", 0)
            if tc >= 6:   final_speed *= 1.9
            elif tc >= 4: final_speed *= 1.5
            elif tc >= 2: final_speed *= 1.2

        if "Long-Distance" in traits:
            tc = trait_counts.get("Long-Distance", 0)
            if tc >= 6:
                final_attack *= 1.30
                final_speed *= 1.75
            elif tc >= 4:
                final_attack *= 1.20
                final_speed *= 1.50
            elif tc >= 2:
                final_attack *= 1.10
                final_speed *= 1.25

        if "Automatic" in traits:
            tc = trait_counts.get("Automatic", 0)
            if tc >= 6:   final_attack *= 2.5
            elif tc >= 4: final_attack *= 1.9
            elif tc >= 2: final_attack *= 1.4

        if "Phenomenon" in traits:
            tc = trait_counts.get("Phenomenon", 0)
            if tc >= 6:
                if final_skill.get('duration'): final_skill['duration'] = round(final_skill['duration'] * 2.3, 1)
                if final_skill.get('radius'):   final_skill['radius']   = round(final_skill['radius']   * 2.3, 1)
            elif tc >= 4:
                if final_skill.get('duration'): final_skill['duration'] = round(final_skill['duration'] * 1.7, 1)
                if final_skill.get('radius'):   final_skill['radius']   = round(final_skill['radius']   * 1.7, 1)
            elif tc >= 2:
                if final_skill.get('duration'): final_skill['duration'] = round(final_skill['duration'] * 1.3, 1)
                if final_skill.get('radius'):   final_skill['radius']   = round(final_skill['radius']   * 1.3, 1)

        if "Bound" in traits:
            tc = trait_counts.get("Bound", 0)
            if tc >= 6:   final_hp *= 2.2
            elif tc >= 4: final_hp *= 1.7
            elif tc >= 2: final_hp *= 1.3

        if "Utility" in traits:
            tc = trait_counts.get("Utility", 0)
            if tc >= 6:   mana_refund_ratio = 0.60
            elif tc >= 4: mana_refund_ratio = 0.40
            elif tc >= 2: mana_refund_ratio = 0.20

        applied_traits = []
        if global_hp_buff > 0:
            if trait_counts.get("Team Bucciarati", 0) >= 2:
                applied_traits.append(f"Team Bucciarati ({trait_counts['Team Bucciarati']})")

        for t in traits:
            if t == "Requiem" and trait_counts.get("Requiem", 0) >= 1:
                applied_traits.append(f"Requiem ({trait_counts['Requiem']})")
            elif trait_counts.get(t, 0) >= 2:
                applied_traits.append(f"{t} ({trait_counts[t]})")

        result.append({
            'id':           c['id'],
            'name':         name,
            'star':         star,
            'x':            c['x'],
            'y':            c['y'],
            'max_hp':       round(final_hp),
            'attack':       round(final_attack),
            'attack_range': round(final_range, 2),
            'speed':        round(final_speed, 2),
            'max_mana':     template.get('max_mana', 200),
            'start_mana':   final_mana,
            'skill':        final_skill,
            'raw_skill':    raw_skill,
            'active_buffs': final_buffs,
            'raw_hp':       raw_hp,
            'raw_attack':   raw_attack,
            'raw_range':    raw_range,
            'raw_speed':    raw_speed,
            'applied_traits': list(dict.fromkeys(applied_traits)),
            'mana_refund_ratio': mana_refund_ratio,
            'double_cast_chance': double_cast_chance,
        })

    return result


# ======================================================================
# STATE
# ======================================================================
_matchmaking_lock = gevent.lock.RLock()   # FIX: guard waiting_players
waiting_players = []
games = {}

MAX_BOARD_UNITS = 10
WIN_SCORE = 10            # rounds needed to win a match
COMBAT_TIME_LIMIT = 120   # seconds before a round is decided on survivors / HP


def _enter_room(sid, room):
    # FIX: flask_socketio.join_room() needs a request context, so calling it from
    # background tasks (the 25s PvP -> bot fallback) raised and left the player
    # stuck on "SEARCHING..." forever. The server-level API works anywhere.
    socketio.server.enter_room(sid, room, namespace='/')


def _leave_room(sid, room):
    try:
        socketio.server.leave_room(sid, room, namespace='/')
    except Exception:
        pass


def _human_opponent(game, sid):
    """The other player's sid if it is a real client (not a bot), else None."""
    if game.get('bot') or game.get('is_bot_vs_bot'):
        return None
    return game['player2'] if game['player1'] == sid else game['player1']


def _count_traits(champs_raw):
    """Trait counts from unique champion names (duplicates don't stack)."""
    counted = set()
    counts = {}
    for c in champs_raw:
        if c['name'] in counted:
            continue
        counted.add(c['name'])
        for t in _CHAMPION_TRAITS.get(c['name'], []):
            counts[t] = counts.get(t, 0) + 1
    return counts


def _deploy_team(board_state, champs_raw, team, mirror):
    """Apply trait buffs and append Champion objects for one side of the board."""
    for champ in _compute_trait_buffs(champs_raw, _count_traits(champs_raw)):
        x, y = float(champ['x']), float(champ['y'])
        if mirror:
            x, y = 4 - x, 5 - y
        board_state.append(Champion(
            id=champ['id'], name=champ['name'], team=team,
            x=x, y=y,
            hp=champ['max_hp'], attack=champ['attack'],
            attack_range=champ['attack_range'], speed=champ['speed'],
            max_mana=champ['max_mana'], star=champ.get('star', 1),
            skill=champ.get('skill'), raw_skill=champ.get('raw_skill'),
            start_mana=champ.get('start_mana', 0),
            active_buffs=champ.get('active_buffs', []),
            raw_hp=champ.get('raw_hp'), raw_attack=champ.get('raw_attack'),
            raw_range=champ.get('raw_range'), raw_speed=champ.get('raw_speed'),
            applied_traits=champ.get('applied_traits', []),
            mana_refund_ratio=champ.get('mana_refund_ratio', 0.0),
            double_cast_chance=champ.get('double_cast_chance', 0.0)
        ))


def _sanitize_board(champs_raw):
    """
    Keep only well-formed, known champions placed on the player's half of the
    board (rows 3-5). Stars are clamped to 1-3, duplicate ids/cells dropped.
    """
    clean, seen_ids, seen_cells = [], set(), set()
    for c in champs_raw:
        if not isinstance(c, dict):
            continue
        name = c.get('name')
        if name not in _CHAMPION_DATA:
            continue
        try:
            x, y = int(c.get('x')), int(c.get('y'))
            star = int(c.get('star', 1))
        except (TypeError, ValueError):
            continue
        cid = str(c.get('id', ''))[:64]
        if not cid or cid in seen_ids or not (0 <= x <= 4 and 3 <= y <= 5) or (x, y) in seen_cells:
            continue
        seen_ids.add(cid)
        seen_cells.add((x, y))
        clean.append({'id': cid, 'name': name, 'star': max(1, min(3, star)), 'x': x, 'y': y})
        if len(clean) >= MAX_BOARD_UNITS:
            break
    return clean

# ======================================================================
# ROUTES
# ======================================================================
@app.route('/')
def index():
    return render_template('index.html')

_reload_in_progress = False

def _schedule_background_reload():
    global _reload_in_progress
    if _reload_in_progress:
        return
    _reload_in_progress = True

    def _task():
        global _reload_in_progress
        try:
            _load_champion_data()
        finally:
            _reload_in_progress = False

    socketio.start_background_task(_task)


@app.route('/api/champions')
def get_champions_api():
    """Serve champion data to the client (for the shop/pool). Auto-syncs if older than 60s or file changed."""
    global _LAST_CHAMPION_SYNC_TIME
    force_reload = request.args.get('reload') == '1'
    local_csv = os.path.join(os.path.dirname(__file__), 'champions.csv')

    # Detect if another worker on Render updated champions.csv
    file_updated = False
    if os.path.exists(local_csv):
        try:
            if os.path.getmtime(local_csv) > _LAST_CHAMPION_SYNC_TIME:
                file_updated = True
        except Exception:
            pass

    if not _CHAMPION_DATA or force_reload:
        _load_champion_data()
    elif file_updated or (time.time() - _LAST_CHAMPION_SYNC_TIME > 60):
        # FIX: refresh in the background instead of blocking this request on a
        # Google Sheets fetch (up to 3 x 12s timeouts) — serve the cached data now
        _schedule_background_reload()

    resp = jsonify(list(_CHAMPION_DATA.values()))
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp

@app.route('/api/custom_sounds')
def custom_sounds_api():
    """List user-provided sound overrides in static/sounds/custom/ (see README there)."""
    folder = os.path.join(app.static_folder, 'sounds', 'custom')
    files = []
    if os.path.isdir(folder):
        files = sorted(f for f in os.listdir(folder)
                       if f.lower().endswith(('.wav', '.mp3', '.ogg', '.m4a', '.webm')))
    resp = jsonify(files)
    resp.headers['Cache-Control'] = 'no-cache'
    return resp


@app.route('/api/reload_champions', methods=['GET', 'POST'])
def reload_champions_api():
    """Force an immediate reload from Google Sheets and return sync status."""
    success, msg = _load_champion_data(force_remote=True)
    try:
        socketio.emit('champions_updated', {
            'count': len(_CHAMPION_DATA),
            'timestamp': int(time.time()),
            'status': 'ok' if success else 'warning',
            'message': msg
        })
    except Exception as sock_err:
        print(f"[WARN] Socket emit failed: {sock_err}")

    resp = jsonify({
        'status': 'ok' if success else 'warning',
        'message': msg,
        'count': len(_CHAMPION_DATA),
        'timestamp': int(time.time()),
        'is_live': success
    })
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


# ==========================================
# 1. MATCHMAKING & DISCONNECTION SYSTEM
# ==========================================
def _new_game(player1, p1_name, player2, p2_name, **extra):
    game = {
        'player1': player1, 'p1_name': p1_name,
        'player2': player2, 'p2_name': p2_name,
        'board_state': [],
        'submitted': set(),   # FIX: who has readied this round (a double submit used to count as both players)
        'in_combat': False,
        'p1_lp': 0, 'p2_lp': 0,
        'aborted': False,
    }
    game.update(extra)
    return game


def _abort_games_of(player_id):
    """Abort and delete every room the player is in. Caller must hold _matchmaking_lock."""
    for room_name, game in list(games.items()):
        if player_id not in (game['player1'], game['player2']):
            continue
        game['aborted'] = True   # signal running game loop to stop
        _leave_room(player_id, room_name)
        other = _human_opponent(game, player_id)
        if other:
            socketio.emit('opponent_disconnected', to=other)
            _leave_room(other, room_name)
        del games[room_name]


def _create_bot_game(player_id, player_name):
    """Instantiate a SmartBot game room for solo play or fallback."""
    bot = SmartBot()
    room_name = f"room_{uuid.uuid4().hex[:10]}_bot"
    try:
        _enter_room(player_id, room_name)
    except Exception:
        return  # client vanished in the meantime

    games[room_name] = _new_game(player_id, player_name, f"bot_{player_id[:5]}", bot.name, bot=bot)

    socketio.emit('match_found', {
        'room': room_name,
        'opponentName': bot.name,
        'isBot': True,
        'your_team': 'Team1'
    }, to=player_id)
    print(f"[BOT MATCH] {player_name!a} matched with {bot.name!a} in {room_name}")


def _create_bot_vs_bot_game(player_id, player_name):
    """Instantiate a Bot vs Bot spectator match where 2 smart bots battle autonomously."""
    keys = list(BOT_ARCHETYPES.keys())
    random.shuffle(keys)
    bot1 = SmartBot(keys[0])
    bot2 = SmartBot(keys[1])
    room_name = f"room_{uuid.uuid4().hex[:10]}_bvb"

    try:
        _enter_room(player_id, room_name)
    except Exception:
        return

    game = _new_game(player_id, bot1.name, f"bot2_{player_id[:5]}", bot2.name,
                     bot1=bot1, bot2=bot2, is_bot_vs_bot=True, round_number=1)
    games[room_name] = game

    socketio.emit('match_found', {
        'room': room_name,
        'opponentName': bot2.name,
        'playerName': bot1.name,
        'isBot': True,
        'isBotVsBot': True,
        'your_team': 'Team1'
    }, to=player_id)

    print(f"[BOT VS BOT] {player_name!a} watching {bot1.name!a} VS {bot2.name!a} in {room_name}")

    def sleep_unless_aborted(seconds):
        """Sleep in 0.1s slices; returns False as soon as the game is aborted."""
        for _ in range(int(seconds * 10)):
            if game.get('aborted'):
                return False
            socketio.sleep(0.1)
        return not game.get('aborted')

    def bot_vs_bot_match_flow():
        socketio.sleep(0.5)

        while not game.get('aborted'):
            if game.get('p1_lp', 0) >= WIN_SCORE or game.get('p2_lp', 0) >= WIN_SCORE:
                winner_name = bot1.name if game['p1_lp'] >= WIN_SCORE else bot2.name
                socketio.emit('bvb_game_over', {
                    'winner': winner_name,
                    'p1_lp': game['p1_lp'],
                    'p2_lp': game['p2_lp']
                }, to=player_id)
                break

            round_num = game.get('round_number', 1)

            # Both bots independently purchase champions, level up, and position units
            game['board_state'] = []
            _deploy_team(game['board_state'], bot1.build_team(_CHAMPION_DATA, _CHAMPION_TRAITS), 'Team1', mirror=False)
            _deploy_team(game['board_state'], bot2.build_team(_CHAMPION_DATA, _CHAMPION_TRAITS), 'Team2', mirror=True)

            # Sync prep board state to spectator immediately
            socketio.emit('bvb_round_prep', {
                'round': round_num,
                'champions': [c.to_dict() for c in game['board_state']],
                'bot1_name': bot1.name,
                'bot2_name': bot2.name,
                'p1_lp': game.get('p1_lp', 0),
                'p2_lp': game.get('p2_lp', 0),
                'seconds': 10
            }, to=player_id)

            # 10s countdown between rounds (10 down to 0)
            for sec_left in range(10, -1, -1):
                if game.get('aborted'):
                    return
                socketio.emit('bvb_countdown_tick', {'seconds': sec_left}, to=player_id)
                socketio.sleep(1.0)

            # Lock inspection for 2s
            socketio.emit('match_locked', to=room_name)
            if not sleep_unless_aborted(2):
                return

            # Start combat
            socketio.emit('combat_start', to=room_name)
            run_game_loop(room_name)

            # 6s post-round review so the spectator can inspect the battlefield
            if not sleep_unless_aborted(6):
                return

            game['round_number'] = round_num + 1

    socketio.start_background_task(bot_vs_bot_match_flow)


@socketio.on('find_match')
def handle_find_match(data=None):
    global waiting_players
    data        = data if isinstance(data, dict) else {}
    player_id   = request.sid
    player_name = str(data.get('name') or 'Player').strip()[:20] or 'Player'

    with _matchmaking_lock:
        # Remove player from waiting list and any room they were in
        waiting_players = [p for p in waiting_players if p['sid'] != player_id]
        _abort_games_of(player_id)

        # 1. Direct BOT VS BOT spectator request
        if data.get('bot_vs_bot'):
            _create_bot_vs_bot_game(player_id, player_name)
            return

        # 2. Direct VS BOT request
        if data.get('vs_bot'):
            _create_bot_game(player_id, player_name)
            return

        # 3. PVP Queue
        waiting_players.append({'sid': player_id, 'name': player_name})
        print(f"[SEARCH] {player_name!a} is searching for a match...")

        if len(waiting_players) >= 2:
            p1 = waiting_players.pop(0)
            p2 = waiting_players.pop(0)
            room_name = f"room_{uuid.uuid4().hex[:10]}_pvp"

            try:
                _enter_room(p1['sid'], room_name)
                _enter_room(p2['sid'], room_name)
            except Exception:
                print("[WARN] One player disconnected during matchmaking.")
                return

            games[room_name] = _new_game(p1['sid'], p1['name'], p2['sid'], p2['name'])

            socketio.emit('match_found', {'room': room_name, 'opponentName': p2['name'], 'isInitiator': True, 'isBot': False, 'your_team': 'Team1'}, to=p1['sid'])
            socketio.emit('match_found', {'room': room_name, 'opponentName': p1['name'], 'isInitiator': False, 'isBot': False, 'your_team': 'Team2'}, to=p2['sid'])
        # Otherwise keep waiting in the PvP queue until a human opponent arrives
        # (no automatic fallback to a bot — use VS BOT for that).


@socketio.on('voice_signal')
def handle_voice_signal(data):
    """
    Relay WebRTC signaling messages (offer, answer, candidate) between peers in a 1v1 match.
    """
    if not isinstance(data, dict):
        return
    signal_data = data.get('signal')
    if not signal_data:
        return

    sender_id = request.sid
    game = games.get(data.get('room'))
    if not game or sender_id not in (game['player1'], game['player2']):
        # Fallback: search active games by sender's socket ID
        game = next((g for g in games.values() if sender_id in (g['player1'], g['player2'])), None)
    if not game:
        return

    recipient_id = _human_opponent(game, sender_id)
    if recipient_id:
        socketio.emit('voice_signal', {
            'sender': sender_id,
            'signal': signal_data
        }, to=recipient_id)


@socketio.on('leave_match')
def handle_leave_match(data=None):
    global waiting_players
    player_id = request.sid
    with _matchmaking_lock:
        waiting_players = [p for p in waiting_players if p['sid'] != player_id]
        # FIX: the opponent is now told the match ended instead of waiting forever
        _abort_games_of(player_id)
    socketio.emit('match_left', to=player_id)


@socketio.on('disconnect')
def handle_disconnect(*args):
    global waiting_players
    player_id = request.sid

    with _matchmaking_lock:
        waiting_players = [p for p in waiting_players if p['sid'] != player_id]
        _abort_games_of(player_id)

    print(f"[DISCONNECT] Client {player_id} disconnected.")


# ==========================================
# 2. READY STATE & PRE-COMBAT INSPECTION
# ==========================================
def _emit_board(game, events):
    """Send the current board to player 1 as-is and (if human) mirrored to player 2."""
    # Bandwidth: full unit data only the first time a unit appears on this board
    # (~9 KB/tick -> ~2 KB/tick); afterwards only the fields that change.
    board = game['board_state']
    sent = game.get('_sent')
    if not sent or sent[0] is not board:
        sent = (board, set())
        game['_sent'] = sent
    base_champions = []
    for c in board:
        if c.id in sent[1]:
            base_champions.append(c.to_tick_dict())
        else:
            sent[1].add(c.id)
            base_champions.append(c.to_dict())

    socketio.emit('sync_tick', {
        "champions":   base_champions,
        "events":      events,
        "opponent_lp": game.get('p2_lp', 0),
        "your_team":   "Team1"
    }, to=game['player1'])

    p2 = _human_opponent(game, game['player1'])
    if p2:
        p2_champions = []
        for c in base_champions:
            c_copy = dict(c)
            c_copy['x'] = 4 - float(c_copy['x'])
            c_copy['y'] = 5 - float(c_copy['y'])
            p2_champions.append(c_copy)

        socketio.emit('sync_tick', {
            "champions":   p2_champions,
            "events":      events,
            "opponent_lp": game.get('p1_lp', 0),
            "your_team":   "Team2"
        }, to=p2)

    return base_champions


@socketio.on('submit_board')
def handle_submit_board(data):
    if not isinstance(data, dict):
        return
    room_name  = data.get('room')
    player_id  = request.sid
    champs_raw = data.get('champions', [])
    if not isinstance(champs_raw, list):
        return

    game = games.get(room_name)
    if not game or game.get('is_bot_vs_bot') or player_id not in (game['player1'], game['player2']):
        return
    # FIX: ignore double submits (auto-ready timer + click, or ready during combat)
    if game['in_combat'] or player_id in game['submitted']:
        return

    is_player_1 = (player_id == game['player1'])
    team_name   = "Team1" if is_player_1 else "Team2"

    # Only well-formed board units (bench y == 6 is dropped); stats come from server data
    board_only = _sanitize_board(champs_raw)
    if not board_only:
        socketio.emit('submit_rejected', {'reason': 'Deploy at least 1 unit on the board!'}, to=player_id)
        return

    # Player 2's coordinates are mirrored so both teams face each other
    _deploy_team(game['board_state'], board_only, team_name, mirror=not is_player_1)
    game['submitted'].add(player_id)

    # IF THIS IS A BOT GAME: auto-deploy SmartBot's composition
    if game.get('bot') and game['player2'] not in game['submitted']:
        bot = game['bot']
        bot.prev_player_champs = board_only
        _deploy_team(game['board_state'], bot.build_team(_CHAMPION_DATA, _CHAMPION_TRAITS), 'Team2', mirror=True)
        game['submitted'].add(game['player2'])

    if len(game['submitted']) < 2:
        other = _human_opponent(game, player_id)
        if other:
            socketio.emit('opponent_ready', to=other)
        return

    game['in_combat'] = True
    print(f"[LOCK] BOTH READY! Starting 5s inspection for {room_name}")
    socketio.emit('match_locked', to=room_name)
    _emit_board(game, [])

    def delay_start():
        socketio.sleep(5)
        if game.get('aborted'):
            return
        print(f"[FIRE] INSPECTION OVER! COMBAT STARTED at {room_name}")
        socketio.emit('combat_start', to=room_name)
        run_game_loop(room_name)

    socketio.start_background_task(delay_start)


# ==========================================
# 3. COMBAT LOOP (SERVER REFEREE)
# ==========================================
def _cast(champ, target, board_state, events, new_clones, is_bonus_cast=False):
    skill_event = champ.cast_skill(target, board_state, is_bonus_cast=is_bonus_cast)
    if not skill_event:
        return None
    if 'spawned_clones' in skill_event:
        new_clones.extend(skill_event.pop('spawned_clones'))
    if 'extra_events' in skill_event:
        events.extend(skill_event.pop('extra_events'))
    events.append(skill_event)
    return skill_event


def _decide_winner(board_state, time_out):
    team1_alive = [c for c in board_state if c.team == 'Team1' and c.is_alive]
    team2_alive = [c for c in board_state if c.team == 'Team2' and c.is_alive]
    if team1_alive and not team2_alive:
        return 'Team1'
    if team2_alive and not team1_alive:
        return 'Team2'
    if not time_out:
        return 'Draw'
    # Timeout: more survivors wins, then more total HP
    if len(team1_alive) != len(team2_alive):
        return 'Team1' if len(team1_alive) > len(team2_alive) else 'Team2'
    t1_hp = sum(c.hp for c in team1_alive)
    t2_hp = sum(c.hp for c in team2_alive)
    if t1_hp != t2_hp:
        return 'Team1' if t1_hp > t2_hp else 'Team2'
    return 'Draw'


def run_game_loop(room_name):
    game = games.get(room_name)
    if not game:
        return

    start_time = time.time()

    while True:
        socketio.sleep(0.1)

        # Abort check — stops loop when room deleted (disconnect mid-game)
        if game.get('aborted'):
            print(f"[WARN] Game loop aborted for {room_name}")
            return

        board = game['board_state']
        all_tick_events = []
        new_clones = []

        for champ in board:
            if not champ.is_alive:
                continue

            # 1. Update buffs first
            buff_events = champ.update_buffs(board)
            if buff_events:
                all_tick_events.extend(buff_events)

            # FIX: banished units are out of the fight entirely (they used to keep walking)
            if not champ.is_alive or champ.is_banished:
                continue

            # Pending Bucciarati Double Cast (1.0s delay = 10 ticks)
            if champ.pending_double_cast_ticks > 0:
                champ.pending_double_cast_ticks -= 1
                if champ.pending_double_cast_ticks == 0 and not champ.is_stunned:
                    second_target = find_closest_target(champ, board)
                    if second_target:
                        second_event = _cast(champ, second_target, board, all_tick_events, new_clones, is_bonus_cast=True)
                        if second_event:
                            second_event['is_double_cast'] = True
                            all_tick_events.append({'type': 'double_cast', 'casterId': champ.id})
                        champ.reset_attack_cooldown()
                continue

            target = find_closest_target(champ, board)
            if not target:
                continue

            dist = calculate_distance(champ.x, champ.y, target.x, target.y)
            if dist > champ.attack_range:
                # Move toward target only if not stunned
                if not champ.is_stunned:
                    move_towards(champ, target.x, target.y)
                continue

            if not champ.can_attack():
                continue

            if champ.mana >= champ.max_mana:
                # 2. Cast skill
                _cast(champ, target, board, all_tick_events, new_clones)

                # Bucciarati Trait: Schedule Double Cast after 1.0s (10 ticks)
                dc_chance = champ.double_cast_chance
                if dc_chance > 0 and random.random() < dc_chance and champ.is_alive \
                        and not champ.is_stunned and not champ.is_banished:
                    champ.pending_double_cast_ticks = 10
                    all_tick_events.append({'type': 'double_cast_charge', 'casterId': champ.id})
            else:
                # 3. Normal attack — only gain mana if not mana-locked
                if not champ.is_mana_locked:
                    champ.mana = min(champ.max_mana, champ.mana + 10)
                is_crit = random.random() < CRIT_CHANCE
                damage = champ.attack * (CRIT_MULTIPLIER if is_crit else 1)
                actual_damage, evs = target.take_damage(damage, champ, board)
                all_tick_events.append({
                    'type': 'attack', 'attackerId': champ.id,
                    'targetId': target.id, 'damage': round(actual_damage),
                    'is_crit': is_crit
                })
                all_tick_events.extend(evs)
            champ.reset_attack_cooldown()

        if new_clones:
            board.extend(new_clones)

        # Broadcast state to both players
        _emit_board(game, all_tick_events)

        # Check end conditions
        team1_alive = any(c.team == 'Team1' and c.is_alive for c in board)
        team2_alive = any(c.team == 'Team2' and c.is_alive for c in board)
        time_out = (time.time() - start_time) > COMBAT_TIME_LIMIT

        if team1_alive and team2_alive and not time_out:
            continue

        winner = _decide_winner(board, time_out)
        base_champions = [c.to_dict() for c in board]  # full data for the bots' next-round logic

        if winner == 'Team1':
            game['p1_lp'] = game.get('p1_lp', 0) + 1
        elif winner == 'Team2':
            game['p2_lp'] = game.get('p2_lp', 0) + 1

        if game.get('bot'):
            game['bot'].on_round_end(winner=winner, player_board=base_champions)
        elif game.get('is_bot_vs_bot'):
            flipped = {'Team1': 'Team2', 'Team2': 'Team1'}.get(winner, 'Draw')
            game['bot1'].on_round_end(winner=winner, player_board=base_champions)
            game['bot2'].on_round_end(winner=flipped, player_board=base_champions)

        # Reset for next round
        game['submitted'] = set()
        game['in_combat'] = False
        game['board_state'] = []

        p1_lp, p2_lp = game.get('p1_lp', 0), game.get('p2_lp', 0)
        p1_result = 'win' if winner == 'Team1' else ('loss' if winner == 'Team2' else 'draw')
        socketio.emit('combat_end', {
            'result': p1_result,
            'winner': winner,
            'isBotVsBot': game.get('is_bot_vs_bot', False),
            # Server is the referee for the score — clients display these values
            'your_lp': p1_lp,
            'opponent_lp': p2_lp,
            'p1_lp': p1_lp,
            'p2_lp': p2_lp,
            'bot1_name': game.get('p1_name', 'Bot 1'),
            'bot2_name': game.get('p2_name', 'Bot 2')
        }, to=game['player1'])

        p2 = _human_opponent(game, game['player1'])
        if p2:
            p2_result = 'win' if winner == 'Team2' else ('loss' if winner == 'Team1' else 'draw')
            socketio.emit('combat_end', {
                'result': p2_result,
                'winner': winner,
                'your_lp': p2_lp,
                'opponent_lp': p1_lp,
            }, to=p2)

        # Room stays in games{} for the next round (players are still connected).
        # It is deleted when either player disconnects, leaves or finds a new match.
        return


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, debug=False, host='0.0.0.0', port=port)
