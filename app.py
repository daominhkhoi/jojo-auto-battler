from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room
from engine.game_logic import Champion, find_closest_target, calculate_distance, move_towards
import os
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'minhkhoigame_secret'
socketio = SocketIO(app, cors_allowed_origins="*")

# Lưu trữ danh sách người chơi chờ và các phòng đang đấu
waiting_players = [] # Dạng Dict: {'sid': request.sid, 'name': player_name}
games = {}

@app.route('/')
def index():
    return render_template('index.html')

# ==========================================
# 1. HỆ THỐNG TÌM TRẬN & NGẮT KẾT NỐI
# ==========================================
@socketio.on('find_match')
def handle_find_match(data=None):
    data = data or {}
    player_id = request.sid
    player_name = data.get('name', 'Player')

    global waiting_players
    waiting_players = [p for p in waiting_players if p['sid'] != player_id]

    # Dọn phòng cũ nếu có
    rooms_to_delete = []
    for room_name, game in games.items():
        if game['player1'] == player_id or game['player2'] == player_id:
            leave_room(room_name, sid=player_id)
            other = game['player2'] if game['player1'] == player_id else game['player1']
            socketio.emit('opponent_disconnected', to=other)
            rooms_to_delete.append(room_name)
            
    for r in rooms_to_delete:
        del games[r]

    waiting_players.append({'sid': player_id, 'name': player_name})
    print(f"🔍 {player_name} đang tìm trận...")

    while len(waiting_players) >= 2:
        p1 = waiting_players.pop(0)
        p2 = waiting_players.pop(0)
        room_name = f"room_{p1['sid'][:5]}_{p2['sid'][:5]}"
        
        try:
            join_room(room_name, sid=p1['sid'])
            join_room(room_name, sid=p2['sid'])
        except KeyError:
            print("⚠️ Một người chơi đã thoát khi đang ghép trận, bỏ qua cặp này...")
            continue 

        games[room_name] = {
            'player1': p1['sid'], 'p1_name': p1['name'],
            'player2': p2['sid'], 'p2_name': p2['name'],
            'board_state': [], 'ready_count': 0, 
            'p1_lp': 100, 'p2_lp': 100 
        }
        
        socketio.emit('match_found', {'room': room_name, 'opponentName': p2['name']}, to=p1['sid'])
        socketio.emit('match_found', {'room': room_name, 'opponentName': p1['name']}, to=p2['sid'])
        break

@socketio.on('disconnect')
def handle_disconnect():
    global waiting_players
    player_id = request.sid

    waiting_players = [p for p in waiting_players if p['sid'] != player_id]

    rooms_to_delete = []
    for room_name, game in games.items():
        if game['player1'] == player_id or game['player2'] == player_id:
            other = game['player2'] if game['player1'] == player_id else game['player1']
            socketio.emit('opponent_disconnected', to=other)
            rooms_to_delete.append(room_name)

    for r in rooms_to_delete:
        del games[r]
        
    print(f"❌ Client {player_id} ngắt kết nối.")

# ==========================================
# 2. XỬ LÝ SẴN SÀNG & KHỞI ĐỘNG SOI BÀI
# ==========================================
@socketio.on('submit_board')
def handle_submit_board(data):
    room_name = data['room']
    player_id = request.sid
    champs_data = data['champions']
    current_lp = data.get('lp', 50) 
    
    game = games.get(room_name)
    if not game: return

    is_player_1 = (player_id == game['player1'])
    team_name = "Team1" if is_player_1 else "Team2"

    if is_player_1:
        game['p1_lp'] = current_lp
    else:
        game['p2_lp'] = current_lp

    for champ in champs_data:
        final_x = champ['x'] if is_player_1 else (4 - float(champ['x']))
        final_y = champ['y'] if is_player_1 else (5 - float(champ['y']))
        
        new_champ = Champion(
            id=champ['id'], name=champ['name'], team=team_name,
            x=final_x, y=final_y, hp=champ['max_hp'],
            attack=champ['attack'], attack_range=champ['attack_range'],
            speed=champ['speed'], max_mana=champ['max_mana'],
            star=champ.get('star', 1),
            skill=champ.get('skill'),
            start_mana=champ.get('start_mana', 0) 
        )
        game['board_state'].append(new_champ)

    game['ready_count'] += 1
    
    if game['ready_count'] == 2:
        print(f"🔒 CẢ 2 ĐÃ SẴN SÀNG! Khởi động 10 giây soi đội hình cho {room_name}")
        socketio.emit('match_locked', room=room_name)
        
        base_champions = [c.to_dict() for c in game['board_state']]

        socketio.emit('sync_tick', {
            "champions": base_champions, 
            "events": [],
            "opponent_lp": game.get('p2_lp', 50)
        }, to=game['player1'])

        p2_champions = []
        for c in base_champions:
            c_copy = c.copy()
            c_copy['x'] = 4 - float(c_copy['x'])
            c_copy['y'] = 5 - float(c_copy['y'])
            p2_champions.append(c_copy)
            
        socketio.emit('sync_tick', {
            "champions": p2_champions, 
            "events": [],
            "opponent_lp": game.get('p1_lp', 50)
        }, to=game['player2'])

        def delay_start():
            socketio.sleep(10)
            print(f"🔥 HẾT GIỜ SOI BÀI! BẮT ĐẦU CHIẾN ĐẤU tại {room_name}")
            socketio.emit('combat_start', room=room_name)
            socketio.start_background_task(run_game_loop, room_name)
            
        socketio.start_background_task(delay_start)


# ==========================================
# 3. VÒNG LẶP CHIẾN ĐẤU (TRỌNG TÀI)
# ==========================================
def run_game_loop(room_name):
    game = games.get(room_name)
    if not game: return
    
    start_time = time.time()

    while True:
        socketio.sleep(0.1) 
        all_tick_events = []
        
        for champ in game['board_state']:
            if not champ.is_alive: continue
            
            # 1. TRỪ GIỜ CÁC BÙA LỢI & CẬP NHẬT TRẠNG THÁI CHOÁNG/CẤM MANA
            champ.update_buffs() 
            
            target = find_closest_target(champ, game['board_state'])
            if target:
                dist = calculate_distance(champ.x, champ.y, target.x, target.y)
                
                if dist <= champ.attack_range:
                    if champ.can_attack():
                        
                        # 2. TUNG CHIÊU (CÓ TRUYỀN board_state ĐỂ DÙNG CLONE/AOE)
                        if champ.mana >= champ.max_mana:
                            skill_event = champ.cast_skill(target, game['board_state'])
                            if skill_event: all_tick_events.append(skill_event)
                            champ.reset_attack_cooldown()
                        
                        # 3. NẾU CHƯA ĐẦY THÌ ĐÁNH THƯỜNG
                        else:
                            target.hp -= champ.attack
                            
                            # CHỈ HỒI MANA KHI KHÔNG BỊ CẤM PHÉP (mana_lock)
                            if not getattr(champ, 'is_mana_locked', False):
                                champ.mana += 15
                                
                            if target.hp <= 0:
                                target.is_alive = False; target.hp = 0
                            
                            champ.reset_attack_cooldown()
                            all_tick_events.append({
                                'type': 'attack', 
                                'attackerId': champ.id,
                                'targetId': target.id
                            })
                else:
                    # TƯỚNG CHỈ DI CHUYỂN KHI KHÔNG BỊ CHOÁNG
                    if not getattr(champ, 'is_stunned', False):
                        move_towards(champ, target.x, target.y)

        # Phát tín hiệu Tọa độ và Sự kiện đánh nhau về cho 2 máy
        base_champions = [c.to_dict() for c in game['board_state']]

        socketio.emit('sync_tick', {
            "champions": base_champions, 
            "events": all_tick_events
        }, to=game['player1'])

        p2_champions = []
        for c in base_champions:
            c_copy = c.copy()
            c_copy['x'] = 4 - float(c_copy['x'])
            c_copy['y'] = 5 - float(c_copy['y'])
            p2_champions.append(c_copy)

        socketio.emit('sync_tick', {
            "champions": p2_champions, 
            "events": all_tick_events
        }, to=game['player2'])

        team1_alive = any(c.team == 'Team1' and c.is_alive for c in game['board_state'])
        team2_alive = any(c.team == 'Team2' and c.is_alive for c in game['board_state'])

        if not team1_alive or not team2_alive:
            game['ready_count'] = 0
            game['board_state'] = []
            socketio.emit('combat_end', to=room_name)
            break

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, debug=False, host='0.0.0.0', port=port)