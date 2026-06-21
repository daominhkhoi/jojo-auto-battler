from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room
from engine.game_logic import Champion, find_closest_target, calculate_distance, move_towards
import os
import time
import pandas as pd
from flask import jsonify

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

        # ĐÃ SỬA MÁU 100 THÀNH ĐIỂM SỐ BẮT ĐẦU TỪ 0
        games[room_name] = {
            'player1': p1['sid'], 'p1_name': p1['name'],
            'player2': p2['sid'], 'p2_name': p2['name'],
            'board_state': [], 'ready_count': 0, 
            'p1_lp': 0, 'p2_lp': 0 
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
    # ĐÃ SỬA ĐIỂM MẶC ĐỊNH TỪ 50 VỀ 0
    current_lp = data.get('lp', 0) 
    
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
            start_mana=champ.get('start_mana', 0),
            active_buffs=champ.get('active_buffs', [])
        )
        game['board_state'].append(new_champ)

    game['ready_count'] += 1
    
    if game['ready_count'] == 2:
        print(f"🔒 CẢ 2 ĐÃ SẴN SÀNG! Khởi động 5 giây soi đội hình cho {room_name}")
        socketio.emit('match_locked', to=room_name)
        
        base_champions = [c.to_dict() for c in game['board_state']]

        socketio.emit('sync_tick', {
            "champions": base_champions, 
            "events": [],
            "opponent_lp": game.get('p2_lp', 0) # SỬA 50 THÀNH 0
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
            "opponent_lp": game.get('p1_lp', 0) # SỬA 50 THÀNH 0
        }, to=game['player2'])

        def delay_start():
            socketio.sleep(5)
            print(f"🔥 HẾT GIỜ SOI BÀI! BẮT ĐẦU CHIẾN ĐẤU tại {room_name}")
            socketio.emit('combat_start', to=room_name)
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
        new_clones = []
        
        for champ in game['board_state']:
            if not champ.is_alive: continue
            
            # 1. CẬP NHẬT BUFF TRƯỚC
            buff_events = champ.update_buffs(game['board_state']) 
            if buff_events: all_tick_events.extend(buff_events)
            
            target = find_closest_target(champ, game['board_state'])
            if target:
                dist = calculate_distance(champ.x, champ.y, target.x, target.y)
                
                if dist <= champ.attack_range:
                    if champ.can_attack():
                        
                        # 2. TUNG CHIÊU (CÓ TRUYỀN board_state ĐỂ DÙNG CLONE/AOE)
                        if champ.mana >= champ.max_mana:
                            skill_event = champ.cast_skill(target, game['board_state'])
                            if skill_event: 
                                if 'spawned_clones' in skill_event:
                                    new_clones.extend(skill_event.pop('spawned_clones'))
                                if 'extra_events' in skill_event:
                                    all_tick_events.extend(skill_event.pop('extra_events'))
                                all_tick_events.append(skill_event)
                            champ.reset_attack_cooldown()
                        
                        # 3. NẾU CHƯA ĐẦY THÌ ĐÁNH THƯỜNG
                        else:
                            # CHỈ HỒI MANA KHI KHÔNG BỊ CẤM PHÉP (mana_lock)
                            if not getattr(champ, 'is_mana_locked', False):
                                champ.mana += 15
                            
                            damage = champ.attack
                            actual_damage, evs = target.take_damage(damage, champ, game['board_state'])
                            all_tick_events.append({'type': 'attack', 'attackerId': champ.id, 'targetId': target.id, 'damage': actual_damage})
                            all_tick_events.extend(evs)
                            champ.reset_attack_cooldown()
                            
                else:
                    # TƯỚNG CHỈ DI CHUYỂN KHI KHÔNG BỊ CHOÁNG
                    if not getattr(champ, 'is_stunned', False):
                        move_towards(champ, target.x, target.y)

        if new_clones:
            game['board_state'].extend(new_clones)

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

        # Kiểm tra điều kiện kết thúc vòng đấu (Đánh đến khi 1 bên chết hết)
        team1_alive = any(c.team == 'Team1' and c.is_alive for c in game['board_state'])
        team2_alive = any(c.team == 'Team2' and c.is_alive for c in game['board_state'])

        if not team1_alive or not team2_alive:
            game['ready_count'] = 0
            game['board_state'] = []
            
            # TRỌNG TÀI QUYẾT ĐỊNH THẮNG THUA CHÍNH XÁC 100%
            if team1_alive and not team2_alive:
                winner = 'Team1'
            elif team2_alive and not team1_alive:
                winner = 'Team2'
            else:
                winner = 'Draw'
                
            # Gửi kết quả CỤ THỂ ('win', 'loss', 'draw') cho từng người chơi
            socketio.emit('combat_end', {'result': 'win' if winner == 'Team1' else ('loss' if winner == 'Team2' else 'draw')}, to=game['player1'])
            socketio.emit('combat_end', {'result': 'win' if winner == 'Team2' else ('loss' if winner == 'Team1' else 'draw')}, to=game['player2'])
            break

# ==========================================
# 4. API TẢI DỮ LIỆU TƯỚNG TỪ EXCEL/CSV
# ==========================================
@app.route('/api/champions')
def get_champions_api():
    champions = []
    try:
        # 1. Tìm vị trí chuẩn xác của file (Nằm chung thư mục với app.py)
        current_dir = os.path.dirname(os.path.abspath(__file__))
        excel_path = os.path.join(current_dir, 'champions.xlsx')
        csv_path = os.path.join(current_dir, 'champions.csv')
        manage_excel_path = os.path.join(current_dir, 'manage.xlsx')
        manage_csv_path = os.path.join(current_dir, 'manage.csv')
        
        # 2. Ưu tiên đọc Excel, nếu không có thì tự động nhảy sang tìm CSV
        if os.path.exists(excel_path):
            try: df = pd.read_excel(excel_path)
            except: df = pd.read_csv(excel_path, sep=';', encoding='utf-8-sig')
        elif os.path.exists(manage_excel_path):
            try: df = pd.read_excel(manage_excel_path)
            except: df = pd.read_csv(manage_excel_path, sep=';', encoding='utf-8-sig')
        elif os.path.exists(csv_path):
            df = pd.read_csv(csv_path, sep=';', encoding='utf-8-sig')
        elif os.path.exists(manage_csv_path):
            df = pd.read_csv(manage_csv_path, sep=';', encoding='utf-8-sig')
        else:
            print(f"❌ KHÔNG TÌM THẤY FILE: Hãy bỏ file champions.csv hoặc manage.csv vào thư mục: {current_dir}")
            return jsonify([])
            
        # 3. Dọn dẹp tên cột (Xóa ký tự ẩn BOM, gọt khoảng trắng thừa 2 đầu)
        df.columns = df.columns.str.replace('\ufeff', '').str.strip()
        df = df.fillna('')
        
        # 4. Bắt đầu quét từng dòng dữ liệu
        for _, row in df.iterrows():
            name = str(row.get('Name', '')).strip()
            # Bỏ qua dòng trống hoặc dòng bị lỗi nan
            if not name or name == 'nan' or name == 'None': continue
            
            traits_str = str(row.get('Traits', ''))
            traits = [t.strip() for t in traits_str.split(',')] if traits_str and traits_str != 'nan' else []
            
            skill_type = str(row.get('SkillType', 'damage')).strip()
            skill = {'type': skill_type if skill_type and skill_type != 'nan' else 'damage'}
            
            power_val = row.get('SkillStat', '')
            if power_val != '' and str(power_val) != 'nan':
                val = float(power_val)
                if val <= 2: skill['percent'] = val
                else: skill['power'] = int(val)
                    
            duration_val = row.get('SkillDuration', '')
            if duration_val != '' and str(duration_val) != 'nan': skill['duration'] = float(duration_val)
                
            radius_val = row.get('Radius', '')
            if radius_val != '' and str(radius_val) != 'nan': skill['radius'] = float(radius_val)

            # ---> THÊM 2 DÒNG NÀY VÀO ĐỂ ĐỌC CỘT MỤC TIÊU <---
            target_val = str(row.get('Target', 'enemy_closest')).strip()
            skill['target'] = target_val if target_val and target_val != 'nan' else 'enemy_closest'

            champ = {
                'name': name,
                'cost': int(row.get('Cost', 1)) if row.get('Cost') != '' else 1,
                'hp': int(row.get('HP', 1000)) if row.get('HP') != '' else 1000,
                'attack': int(row.get('ATK', 100)) if row.get('ATK') != '' else 100,
                'attack_range': float(row.get('Range', 1)) if row.get('Range') != '' else 1,
                'speed': float(row.get('Speed', 1)) if row.get('Speed') != '' else 1,
                'max_mana': int(row.get('Mana', 200)) if row.get('Mana') != '' else 200,
                'traits': traits,
                'skill': skill
            }
            champions.append(champ)
            
    except Exception as e:
        # IN RA LỖI RÕ RÀNG Ở CỬA SỔ CMD NẾU VẪN THẤT BẠI
        print(f"\n❌ LỖI ĐỌC FILE: {e}\n")
        
    return jsonify(champions)

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, debug=False, host='0.0.0.0', port=port)