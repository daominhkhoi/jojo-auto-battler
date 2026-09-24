from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, join_room, leave_room
from engine.game_logic import (
    Champion, find_closest_target, calculate_distance, move_towards,
    register_champion_costs
)
import os
import time
import pandas as pd
import gevent.lock

app = Flask(__name__)
# FIX: Secret key from environment variable — never hardcode secrets
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', os.urandom(24))
socketio = SocketIO(app, cors_allowed_origins="*")

# ======================================================================
# CHAMPION DATA — Single source of truth, loaded once at startup
# ======================================================================
_CHAMPION_DATA = {}   # name → full stat dict
_CHAMPION_TRAITS = {} # name → list of trait strings

def _load_champion_data():
    """
    Load champion data from Google Sheets on startup.
    Falls back to local champions.csv if the network call fails.
    """
    global _CHAMPION_DATA, _CHAMPION_TRAITS

    url = ("https://docs.google.com/spreadsheets/d/e/"
           "2PACX-1vREGk7FjfrTa0W2mzlWKfzeJX-JOPEu7CsNgt8ksH6RxoRyo9EfS7JSoFxamK8KOdwGYZp8h7oOC9uw"
           "/pub?gid=1700806245&single=true&output=csv")
    try:
        df = pd.read_csv(url, sep=',', encoding='utf-8')
    except Exception as e:
        print(f"[WARN]  Google Sheets unavailable, falling back to champions.csv: {e}")
        csv_path = os.path.join(os.path.dirname(__file__), 'champions.csv')
        try:
            df = pd.read_csv(csv_path, sep=';')
        except Exception as e2:
            print(f"[ERR] Cannot load champion data at all: {e2}")
            return

    df.columns = df.columns.str.replace('\ufeff', '').str.strip()
    df = df.fillna('')

    for _, row in df.iterrows():
        name = str(row.get('Name', '')).strip()
        if not name or name in ('nan', 'None'):
            continue

        traits_str = str(row.get('Traits', ''))
        traits = [t.strip() for t in traits_str.split(',')] if traits_str and traits_str != 'nan' else []

        skill_type = str(row.get('SkillType', 'damage')).strip()
        skill = {'type': skill_type if skill_type and skill_type != 'nan' else 'damage'}

        power_val = row.get('SkillStat', '')
        if power_val != '' and str(power_val) != 'nan':
            val = float(power_val)
            if val <= 2: skill['percent'] = val
            else:        skill['power']   = int(val)

        dur_val = row.get('SkillDuration', '')
        if dur_val != '' and str(dur_val) != 'nan':
            skill['duration'] = float(dur_val)

        rad_val = row.get('Radius', '')
        if rad_val != '' and str(rad_val) != 'nan':
            skill['radius'] = float(rad_val)

        tgt_val = str(row.get('Target', 'enemy_closest')).strip()
        skill['target'] = tgt_val if tgt_val and tgt_val != 'nan' else 'enemy_closest'

        _CHAMPION_DATA[name] = {
            'name': name,
            'cost':         int(row.get('Cost', 1))     if row.get('Cost')  != '' else 1,
            'hp':           int(row.get('HP', 1000))    if row.get('HP')    != '' else 1000,
            'attack':       int(row.get('ATK', 100))    if row.get('ATK')   != '' else 100,
            'attack_range': float(row.get('Range', 1))  if row.get('Range') != '' else 1,
            'speed':        float(row.get('Speed', 1))  if row.get('Speed') != '' else 1,
            'max_mana':     int(row.get('Mana', 200))   if row.get('Mana')  != '' else 200,
            'traits': traits,
            'skill':  skill,
        }
        _CHAMPION_TRAITS[name] = traits

    # Register costs into game_logic for soul_swap cost lookups
    register_champion_costs({n: d['cost'] for n, d in _CHAMPION_DATA.items()})
    print(f"[OK] Loaded {len(_CHAMPION_DATA)} champions from data source.")

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

    if trait_counts.get("Utility", 0) >= 6: global_hp_buff += 50000
    elif trait_counts.get("Utility", 0) >= 4: global_hp_buff += 25000
    elif trait_counts.get("Utility", 0) >= 2: global_hp_buff += 10000

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
        final_skill  = dict(template.get('skill', {'type': 'damage', 'power': 50, 'duration': 0}))
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
            if tc >= 6:   final_hp += 120000
            elif tc >= 4: final_hp += 60000
            elif tc >= 2: final_hp += 25000

        if "Bucciarati" in traits:
            tc = trait_counts.get("Bucciarati", 0)
            if final_skill.get('power'):
                if tc >= 6:   final_skill['power'] = round(final_skill['power'] * 2.3)
                elif tc >= 4: final_skill['power'] = round(final_skill['power'] * 1.7)
                elif tc >= 2: final_skill['power'] = round(final_skill['power'] * 1.3)

        if "La Squadra" in traits:
            tc = trait_counts.get("La Squadra", 0)
            if tc >= 6:   final_attack += 80000
            elif tc >= 4: final_attack += 40000
            elif tc >= 2: final_attack += 15000

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
            if tc >= 2:   final_hp += 100000; final_attack += 30000
            elif tc >= 1: final_attack += 30000

        # === CLASSES ===
        if "Power Type" in traits:
            tc = trait_counts.get("Power Type", 0)
            if tc >= 6:   final_speed *= 1.9
            elif tc >= 4: final_speed *= 1.5
            elif tc >= 2: final_speed *= 1.2

        if "Long-Distance" in traits:
            tc = trait_counts.get("Long-Distance", 0)
            if tc >= 6:   final_range += 1; final_attack *= 2.0
            elif tc >= 4: final_range += 1; final_attack *= 1.5
            elif tc >= 2: final_range += 1; final_attack *= 1.2

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
            'active_buffs': final_buffs,
        })

    return result


# ======================================================================
# STATE
# ======================================================================
_matchmaking_lock = gevent.lock.RLock()   # FIX: guard waiting_players
waiting_players = []
games = {}

# ======================================================================
# ROUTES
# ======================================================================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/champions')
def get_champions_api():
    """Serve champion data to the client (for the shop/pool)."""
    if not _CHAMPION_DATA:
        _load_champion_data()
    return jsonify(list(_CHAMPION_DATA.values()))


# ==========================================
# 1. HỆ THỐNG TÌM TRẬN & NGẮT KẾT NỐI
# ==========================================
@socketio.on('find_match')
def handle_find_match(data=None):
    data      = data or {}
    player_id = request.sid
    player_name = data.get('name', 'Player')

    with _matchmaking_lock:
        global waiting_players
        # Remove player from waiting list if already there
        waiting_players = [p for p in waiting_players if p['sid'] != player_id]

        # Clean up any existing room for this player
        rooms_to_delete = []
        for room_name, game in games.items():
            if game['player1'] == player_id or game['player2'] == player_id:
                game['aborted'] = True   # FIX: signal running game loop to stop
                leave_room(room_name, sid=player_id)
                other = game['player2'] if game['player1'] == player_id else game['player1']
                socketio.emit('opponent_disconnected', to=other)
                rooms_to_delete.append(room_name)
        for r in rooms_to_delete:
            del games[r]

        waiting_players.append({'sid': player_id, 'name': player_name})
        print(f"[SEARCH] {player_name} đang tìm trận...")

        # FIX: changed while → if to prevent over-popping in concurrent calls
        if len(waiting_players) >= 2:
            p1 = waiting_players.pop(0)
            p2 = waiting_players.pop(0)
            room_name = f"room_{p1['sid'][:5]}_{p2['sid'][:5]}"

            try:
                join_room(room_name, sid=p1['sid'])
                join_room(room_name, sid=p2['sid'])
            except KeyError:
                print("[WARN] One player disconnected during matchmaking.")
                return

            games[room_name] = {
                'player1': p1['sid'], 'p1_name': p1['name'],
                'player2': p2['sid'], 'p2_name': p2['name'],
                'board_state': [], 'ready_count': 0,
                'p1_lp': 0, 'p2_lp': 0,
                'aborted': False,   # FIX: abort flag
            }

            socketio.emit('match_found', {'room': room_name, 'opponentName': p2['name']}, to=p1['sid'])
            socketio.emit('match_found', {'room': room_name, 'opponentName': p1['name']}, to=p2['sid'])


@socketio.on('disconnect')
def handle_disconnect():
    global waiting_players
    player_id = request.sid

    with _matchmaking_lock:
        waiting_players = [p for p in waiting_players if p['sid'] != player_id]

        rooms_to_delete = []
        for room_name, game in games.items():
            if game['player1'] == player_id or game['player2'] == player_id:
                game['aborted'] = True   # FIX: abort flag stops running game loop
                other = game['player2'] if game['player1'] == player_id else game['player1']
                socketio.emit('opponent_disconnected', to=other)
                rooms_to_delete.append(room_name)

        for r in rooms_to_delete:
            del games[r]

    print(f"[ERR] Client {player_id} ngắt kết nối.")


# ==========================================
# 2. XỬ LÝ SẴN SÀNG & KHỞI ĐỘNG SOI BÀI
# ==========================================
@socketio.on('submit_board')
def handle_submit_board(data):
    room_name   = data.get('room')
    player_id   = request.sid
    champs_raw  = data.get('champions', [])
    current_lp  = data.get('lp', 0)

    if not isinstance(champs_raw, list):
        return

    game = games.get(room_name)
    if not game:
        return

    is_player_1 = (player_id == game['player1'])
    team_name   = "Team1" if is_player_1 else "Team2"

    if is_player_1:
        game['p1_lp'] = current_lp
    else:
        game['p2_lp'] = current_lp

    # FIX: Strictly skip any champion that was on the bench (y == 6)
    board_only = [c for c in champs_raw if c.get('y', 6) != 6]

    # ----------------------------------------------------------------
    # SERVER-SIDE TRAIT COMPUTATION (moved from network.js)
    # ----------------------------------------------------------------
    # Count traits from unique champion names
    counted_names = set()
    unique_champs = []
    for c in board_only:
        if c['name'] not in counted_names:
            counted_names.add(c['name'])
            unique_champs.append(c)

    trait_counts = {}
    for c in unique_champs:
        for trait in _CHAMPION_TRAITS.get(c['name'], []):
            trait_counts[trait] = trait_counts.get(trait, 0) + 1

    # Apply all trait buffs server-side
    buffed_champs = _compute_trait_buffs(board_only, trait_counts)

    # ----------------------------------------------------------------
    # Build Champion objects on the board
    # ----------------------------------------------------------------
    for champ in buffed_champs:
        # Mirror Player 2's coordinates so both teams face each other
        final_x = champ['x'] if is_player_1 else (4 - float(champ['x']))
        final_y = champ['y'] if is_player_1 else (5 - float(champ['y']))

        new_champ = Champion(
            id=champ['id'], name=champ['name'], team=team_name,
            x=final_x, y=final_y,
            hp=champ['max_hp'],
            attack=champ['attack'],
            attack_range=champ['attack_range'],
            speed=champ['speed'],
            max_mana=champ['max_mana'],
            star=champ.get('star', 1),
            skill=champ.get('skill'),
            start_mana=champ.get('start_mana', 0),
            active_buffs=champ.get('active_buffs', [])
        )
        game['board_state'].append(new_champ)

    game['ready_count'] += 1

    if game['ready_count'] == 2:
        print(f"[LOCK] CẢ 2 ĐÃ SẴN SÀNG! Khởi động 5 giây soi đội hình cho {room_name}")
        socketio.emit('match_locked', to=room_name)

        base_champions = [c.to_dict() for c in game['board_state']]

        # Player 1 sees board as-is
        socketio.emit('sync_tick', {
            "champions": base_champions,
            "events":    [],
            "opponent_lp": game.get('p2_lp', 0)
        }, to=game['player1'])

        # Player 2 gets mirrored coordinates
        p2_champions = []
        for c in base_champions:
            c_copy = c.copy()
            c_copy['x'] = 4 - float(c_copy['x'])
            c_copy['y'] = 5 - float(c_copy['y'])
            p2_champions.append(c_copy)

        socketio.emit('sync_tick', {
            "champions": p2_champions,
            "events":    [],
            "opponent_lp": game.get('p1_lp', 0)
        }, to=game['player2'])

        def delay_start():
            socketio.sleep(5)
            if game.get('aborted'):
                return
            print(f"[FIRE] HẾT GIỜ SOI BÀI! BẮT ĐẦU CHIẾN ĐẤU tại {room_name}")
            socketio.emit('combat_start', to=room_name)
            socketio.start_background_task(run_game_loop, room_name)

        socketio.start_background_task(delay_start)


# ==========================================
# 3. VÒNG LẶP CHIẾN ĐẤU (TRỌNG TÀI)
# ==========================================
def run_game_loop(room_name):
    game = games.get(room_name)
    if not game:
        return

    start_time = time.time()

    while True:
        socketio.sleep(0.1)

        # FIX: Abort check — stops loop when room deleted (disconnect mid-game)
        if game.get('aborted'):
            print(f"[WARN] Game loop aborted for {room_name}")
            break

        all_tick_events = []
        new_clones = []

        for champ in game['board_state']:
            if not champ.is_alive:
                continue

            # 1. Update buffs first
            buff_events = champ.update_buffs(game['board_state'])
            if buff_events:
                all_tick_events.extend(buff_events)

            target = find_closest_target(champ, game['board_state'])
            if target:
                dist = calculate_distance(champ.x, champ.y, target.x, target.y)

                if dist <= champ.attack_range:
                    if champ.can_attack():
                        if champ.mana >= champ.max_mana:
                            # 2. Cast skill
                            skill_event = champ.cast_skill(target, game['board_state'])
                            if skill_event:
                                if 'spawned_clones' in skill_event:
                                    new_clones.extend(skill_event.pop('spawned_clones'))
                                if 'extra_events' in skill_event:
                                    all_tick_events.extend(skill_event.pop('extra_events'))
                                all_tick_events.append(skill_event)
                            champ.reset_attack_cooldown()
                        else:
                            # 3. Normal attack — only gain mana if not mana-locked
                            if not getattr(champ, 'is_mana_locked', False):
                                champ.mana += 10
                            damage = champ.attack
                            actual_damage, evs = target.take_damage(damage, champ, game['board_state'])
                            all_tick_events.append({
                                'type': 'attack', 'attackerId': champ.id,
                                'targetId': target.id, 'damage': actual_damage
                            })
                            all_tick_events.extend(evs)
                            champ.reset_attack_cooldown()
                else:
                    # Move toward target only if not stunned
                    if not getattr(champ, 'is_stunned', False):
                        move_towards(champ, target.x, target.y)

        if new_clones:
            game['board_state'].extend(new_clones)

        # Broadcast state to both players
        base_champions = [c.to_dict() for c in game['board_state']]

        socketio.emit('sync_tick', {
            "champions": base_champions,
            "events":    all_tick_events
        }, to=game['player1'])

        p2_champions = []
        for c in base_champions:
            c_copy = c.copy()
            c_copy['x'] = 4 - float(c_copy['x'])
            c_copy['y'] = 5 - float(c_copy['y'])
            p2_champions.append(c_copy)

        socketio.emit('sync_tick', {
            "champions": p2_champions,
            "events":    all_tick_events
        }, to=game['player2'])

        # Check end conditions
        team1_alive = any(c.team == 'Team1' and c.is_alive for c in game['board_state'])
        team2_alive = any(c.team == 'Team2' and c.is_alive for c in game['board_state'])
        elapsed_time = time.time() - start_time
        time_out = elapsed_time > 120

        if not team1_alive or not team2_alive or time_out:
            if team1_alive and not team2_alive:
                winner = 'Team1'
            elif team2_alive and not team1_alive:
                winner = 'Team2'
            elif time_out:
                t1_count = sum(1 for c in game['board_state'] if c.team == 'Team1' and c.is_alive)
                t2_count = sum(1 for c in game['board_state'] if c.team == 'Team2' and c.is_alive)
                if t1_count > t2_count:       winner = 'Team1'
                elif t2_count > t1_count:     winner = 'Team2'
                else:
                    t1_hp = sum(c.hp for c in game['board_state'] if c.team == 'Team1' and c.is_alive)
                    t2_hp = sum(c.hp for c in game['board_state'] if c.team == 'Team2' and c.is_alive)
                    if t1_hp > t2_hp:         winner = 'Team1'
                    elif t2_hp > t1_hp:       winner = 'Team2'
                    else:                     winner = 'Draw'
            else:
                winner = 'Draw'

            # Reset for next round
            game['ready_count'] = 0
            game['board_state'] = []

            p1_result = 'win' if winner == 'Team1' else ('loss' if winner == 'Team2' else 'draw')
            p2_result = 'win' if winner == 'Team2' else ('loss' if winner == 'Team1' else 'draw')

            socketio.emit('combat_end', {'result': p1_result}, to=game['player1'])
            socketio.emit('combat_end', {'result': p2_result}, to=game['player2'])

            # FIX: Room stays in games{} for the next round (players are still connected).
            # It will be deleted when either player disconnects or finds a new match.
            break


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, debug=False, host='0.0.0.0', port=port)