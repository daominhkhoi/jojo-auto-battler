ÂM THANH TÙY CHỈNH (ghi đè âm thanh mặc định)
=============================================

Thả file âm thanh (.wav / .mp3 / .ogg / .m4a) vào thư mục này, đặt TÊN FILE
trùng với tên âm thanh muốn thay. Tải lại trang (Ctrl+F5) là game tự dùng file
của bạn — không cần sửa code. Xóa file đi là quay về âm thanh mặc định.

Lưu ý bản quyền: chỉ dùng file bạn có quyền sử dụng (tự thu, tự làm, hoặc
thư viện SFX miễn phí bản quyền như freesound.org loại CC0). Âm thanh cắt từ
anime/phim thuộc bản quyền của chủ sở hữu.

Ví dụ:
  The World.mp3        -> thay tiếng The World dừng thời gian
  attack_rush.wav      -> thay tiếng đấm liên hoàn

Tên có thể dùng (không phân biệt hoa thường):

  Giao diện / trận đấu:
    buy, sell, roll, levelup, starup,
    battle_start, round_win, round_lose,
    menacing        (tiếng ゴゴゴ lúc 5 giây soi đội hình)
    time_stop, time_resume

  Chiến đấu:
    hit_normal, hit_crit, death, skill_cast,
    attack_rush, attack_blade, attack_bullet, attack_orb, attack_strike

  Chiêu riêng của Stand:
    The World, Star Platinum, Killer Queen, King Crimson,
    Gold Experience Requiem, Gold Experience, Crazy Diamond, The Hand,
    Sticky Fingers, Aerosmith, Hierophant Green, Magician's Red,
    Silver Chariot, Sex Pistols, Purple Haze, White Album,
    Red Hot Chili Pepper, Bad Company, Weather Report, Cream,
    Whitesnake, C-MOON, Made in Heaven

  Chiêu chung theo loại (cho Stand không có âm riêng):
    archetype_slash, archetype_bullet, archetype_shield, archetype_heal,
    archetype_mind, archetype_submerge, archetype_clone

Muốn tạo lại bộ âm thanh mặc định:  python engine/generate_anime_sfx.py
