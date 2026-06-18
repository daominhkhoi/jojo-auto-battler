// static/js/entities.js
import { IMAGES } from './assets.js';

export const CHAMPION_POOL = [
    // --- TƯỚNG 1 VÀNG ---
    {
        name: "Soft Machine", cost: 1, img: IMAGES["Soft Machine"],
        hp: 100000, attack: 1500, attack_range: 1, speed: 0.6, max_mana: 50,
        // Lore: Đâm đối thủ xẹp lép như bong bóng -> Choáng (Stun)
        traits: ["Renegade", "Assassin"], skill: { type: 'stun', duration: 2.5 }
    },
    {
        name: "Kraft Work", cost: 1, img: IMAGES["Kraft Work"],
        hp: 80000, attack: 2000, attack_range: 1, speed: 0.9, max_mana: 60,
        // Lore: Cố định động năng -> Tăng tốc độ đánh (Speed Buff)
        traits: ["Renegade", "Brawler"], skill: { type: 'speed_buff', power: 60, duration: 4.0 }
    },
    {
        name: "Little Feet", cost: 1, img: IMAGES["Little Feet"],
        hp: 70000, attack: 2500, attack_range: 1, speed: 1.2, max_mana: 50,
        // Lore: Thu nhỏ dần mục tiêu -> Rút máu từ từ (DoT)
        traits: ["La Squadra", "Assassin"], skill: { type: 'dot', power: 3500, duration: 4.0 }
    },
    {
        name: "Talking Head", cost: 1, img: IMAGES["Talking Head"],
        hp: 60000, attack: 2000, attack_range: 1, speed: 1.2, max_mana: 60,
        // Lore: Bám vào lưỡi nói dối -> Cấm dùng chiêu (Mana Lock)
        traits: ["Unita Speciale", "Support"], skill: { type: 'mana_lock', duration: 3.0 }
    },
    {
        name: "Rolling Stones", cost: 1, img: IMAGES["Rolling Stones"],
        hp: 50000, attack: 1000, attack_range: 1, speed: 0.5, max_mana: 40,
        // Lore: Tảng đá định mệnh -> Sát thương bạo kích thẳng mặt
        traits: ["Renegade", "Support"], skill: { type: 'damage', power: 8000, duration: 0 }
    },

    // --- TƯỚNG 2 VÀNG ---
    {
        name: "Sex Pistols", cost: 2, img: IMAGES["Sex Pistols"],
        hp: 60000, attack: 4000, attack_range: 5, speed: 1.5, max_mana: 60,
        // Lore: Chuyền đạn liên tục -> Tăng mạnh tốc đánh
        traits: ["Team Bucciarati", "Sniper"], skill: { type: 'speed_buff', power: 100, duration: 4.0 }
    },
    {
        name: "Black Sabbath", cost: 2, img: IMAGES["Black Sabbath"],
        hp: 60000, attack: 3500, attack_range: 1.5, speed: 0.7, max_mana: 80,
        // Lore: Kéo linh hồn trong bóng tối -> Khóa mana toàn bản đồ
        traits: ["Renegade", "Mage"], skill: { type: 'mana_lock', duration: 4.0 }
    },
    {
        name: "Baby Face", cost: 2, img: IMAGES["Baby Face"],
        hp: 60000, attack: 3000, attack_range: 2, speed: 1.0, max_mana: 70,
        // Lore: Sinh ra Homunculus -> Tạo phân thân mang 40% sức mạnh
        traits: ["La Squadra", "Mage"], skill: { type: 'clone', percent: 0.4 }
    },
    {
        name: "Man in the Mirror", cost: 2, img: IMAGES["Man in the Mirror"],
        hp: 50000, attack: 3500, attack_range: 1.5, speed: 1.1, max_mana: 60,
        // Lore: Kéo địch vào thế giới trong gương -> Đổi vị trí với mục tiêu
        traits: ["La Squadra", "Mage"], skill: { type: 'swap' }
    },
    {
        name: "Beach Boy", cost: 2, img: IMAGES["Beach Boy"],
        hp: 60000, attack: 4500, attack_range: 4, speed: 0.9, max_mana: 60,
        // Lore: Lưỡi câu móc thẳng tim -> Choáng (Mắc câu)
        traits: ["La Squadra", "Sniper"], skill: { type: 'stun', duration: 3.5 }
    },

    // --- TƯỚNG 3 VÀNG ---
    {
        name: "Moody Blues", cost: 3, img: IMAGES["Moody Blues"],
        hp: 80000, attack: 4500, attack_range: 1, speed: 0.8, max_mana: 70,
        // Lore: Tua lại quá khứ -> Tạo phân thân sao chép 60% chỉ số
        traits: ["Team Bucciarati", "Support"], skill: { type: 'clone', percent: 0.6 }
    },
    {
        name: "Silver Chariot", cost: 3, img: IMAGES["Silver Chariot"],
        hp: 70000, attack: 6000, attack_range: 1, speed: 2.0, max_mana: 60,
        // Lore: Cởi áo giáp -> Tăng 150% tốc đánh (Chém mù mắt)
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'speed_buff', power: 150, duration: 4.0 }
    },
    {
        name: "Stand Arrow", cost: 3, img: IMAGES["Stand Arrow"],
        hp: 40000, attack: 1000, attack_range: 1, speed: 0.5, max_mana: 40,
        // Lore: Khai mở tiềm năng -> Hồi máu diện rộng cho đồng minh
        traits: ["Artifact", "Support"], skill: { type: 'aoe_heal', radius: 1.5, power: 8000 }
    },

    // --- TƯỚNG 4 VÀNG ---
    {
        name: "Sticky Fingers", cost: 4, img: IMAGES["Sticky Fingers"],
        hp: 70000, attack: 7000, attack_range: 1, speed: 1.3, max_mana: 80,
        // Lore: Mở khóa kéo chui xuống đất -> Đổi vị trí đột ngột để áp sát
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'swap' }
    },
    {
        name: "Purple Haze", cost: 4, img: IMAGES["Purple Haze"],
        hp: 60000, attack: 7500, attack_range: 1, speed: 1.0, max_mana: 90,
        // Lore: Đập vỡ viên nhộng virus -> Rải độc diện rộng (AoE DoT)
        traits: ["Team Bucciarati", "Assassin"], skill: { type: 'aoe_dot', radius: 1.5, power: 8000, duration: 4.0 }
    },
    {
        name: "Aerosmith", cost: 4, img: IMAGES["Aerosmith"],
        hp: 70000, attack: 6500, attack_range: 4, speed: 1.8, max_mana: 100,
        // Lore: Rải bom xả đạn máy bay -> Sát thương khổng lồ (Burst)
        traits: ["Team Bucciarati", "Sniper"], skill: { type: 'damage', power: 18000, duration: 0 }
    },
    {
        name: "Spice Girl", cost: 4, img: IMAGES["Spice Girl"],
        hp: 90000, attack: 6000, attack_range: 1, speed: 1.2, max_mana: 75,
        // Lore: Làm mọi thứ mềm nhũn -> Choáng đối phương khá lâu
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'stun', duration: 4.0 }
    },
    {
        name: "Metallica", cost: 4, img: IMAGES["Metallica"],
        hp: 80000, attack: 7000, attack_range: 2, speed: 1.3, max_mana: 80,
        // Lore: Lưỡi lam sinh ra trong máu -> Rút máu cực đau (DoT)
        traits: ["La Squadra", "Assassin"], skill: { type: 'dot', power: 16000, duration: 4.0 }
    },
    {
        name: "The Grateful Dead", cost: 4, img: IMAGES["The Grateful Dead"],
        hp: 90000, attack: 5000, attack_range: 1, speed: 0.8, max_mana: 90,
        // Lore: Lão hóa trên diện rộng -> Khí độc lan tỏa
        traits: ["La Squadra", "Support"], skill: { type: 'aoe_dot', radius: 2.5, power: 6000, duration: 5.0 }
    },
    {
        name: "White Album", cost: 4, img: IMAGES["White Album"],
        hp: 100000, attack: 5500, attack_range: 1, speed: 1.0, max_mana: 80,
        // Lore: Đóng băng tuyệt đối Nhiệt độ âm -> Khóa Mana toàn bản đồ
        traits: ["La Squadra", "Brawler"], skill: { type: 'mana_lock', duration: 5.0 }
    },
    {
        name: "Oasis", cost: 4, img: IMAGES["Oasis"],
        hp: 100000, attack: 6500, attack_range: 1, speed: 1.5, max_mana: 70,
        // Lore: Hóa bùn lặn xuống đất -> Hồi máu bản thân mạnh mẽ
        traits: ["Unita Speciale", "Brawler"], skill: { type: 'regen', power: 10000, duration: 5.0 }
    },
    {
        name: "Green Day", cost: 4, img: IMAGES["Green Day"],
        hp: 100000, attack: 7000, attack_range: 3, speed: 1.0, max_mana: 80,
        // Lore: Nấm mốc ăn mòn kẻ thấp hơn -> Vòng tròn nấm mốc AoE
        traits: ["Unita Speciale", "Mage"], skill: { type: 'aoe_dot', radius: 2.0, power: 8000, duration: 5.0 }
    },
    {
        name: "Notorious B.I.G", cost: 4, img: IMAGES["Notorious B.I.G"],
        hp: 200000, attack: 5500, attack_range: 1, speed: 0.4, max_mana: 50,
        // Lore: Bất tử, ăn năng lượng phình to -> Tạo bóng ma phân thân 80% sức mạnh
        traits: ["Unita Speciale", "Assassin"], skill: { type: 'clone', percent: 0.8 }
    },
    {
        name: "Undead Bruno", cost: 4, img: IMAGES["Undead Bruno"],
        hp: 80000, attack: 7500, attack_range: 1, speed: 1.2, max_mana: 70,
        // Lore: Zombie không cảm thấy đau -> Tự Hồi phục điên cuồng
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'regen', power: 12000, duration: 5.0 }
    },

    // --- TƯỚNG 5 VÀNG ---
    {
        name: "Gold Experience", cost: 5, img: IMAGES["Gold Experience"],
        hp: 50000, attack: 8000, attack_range: 1, speed: 1.2, max_mana: 100,
        // Lore: Truyền sự sống sinh học -> Bơm máu diện rộng cực khủng
        traits: ["Team Bucciarati", "Support"], skill: { type: 'aoe_heal', radius: 2.0, power: 20000 }
    },
    {
        name: "King Crimson", cost: 5, img: IMAGES["King Crimson"],
        hp: 60000, attack: 14000, attack_range: 1, speed: 1.4, max_mana: 100,
        // Lore: Đấm xuyên bụng (Donut) -> Sát thương đơn mục tiêu tuyệt đối
        traits: ["Unita Speciale", "Assassin"], skill: { type: 'damage', power: 35000, duration: 0 }
    },
    {
        name: "G.E. Requiem", cost: 5, img: IMAGES["G.E. Requiem"],
        hp: 150000, attack: 12000, attack_range: 2, speed: 1.5, max_mana: 120,
        // Lore: Trở về số 0 (Return to Zero) -> Cấm dùng phép cả map 8 GIÂY!
        traits: ["Team Bucciarati", "Brawler"], skill: { type: 'mana_lock', duration: 8.0 }
    },
    {
        name: "Chariot Requiem", cost: 5, img: IMAGES["Chariot Requiem"],
        hp: 60000, attack: 9000, attack_range: 2, speed: 1.0, max_mana: 90,
        // Lore: Kéo linh hồn người khác / Chìm vào giấc ngủ -> Choáng 6 giây
        traits: ["Team Bucciarati", "Support"], skill: { type: 'stun', duration: 6.0 }
    },
    {
        name: "True King Crimson", cost: 5, img: IMAGES["True King Crimson"],
        hp: 85000, attack: 15000, attack_range: 1, speed: 1.5, max_mana: 90,
        // Lore: Xóa bỏ thời gian, chém liên hoàn -> Tăng 300% tốc độ đánh
        traits: ["Unita Speciale", "Assassin"], skill: { type: 'speed_buff', power: 300, duration: 5.0 }
    },
    {
        name: "Requiem Arrow", cost: 5, img: IMAGES["Requiem Arrow"],
        hp: 50000, attack: 1000, attack_range: 1, speed: 0.5, max_mana: 50,
        // Lore: Thức tỉnh sức mạnh tối thượng -> Hồi sinh lực diện rộng toàn sàn (Radius 3.0)
        traits: ["Artifact", "Support"], skill: { type: 'aoe_heal', radius: 3.0, power: 35000 }
    }
];