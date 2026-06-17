import { CHAMPION_POOL } from './entities.js';

export const CONFIG = {
    BOARD_COLS: 5,            // 5 cột ngang trên sân
    BOARD_ROWS: 6,            // 6 hàng dọc tổng cộng (3 hàng phe mình, 3 hàng phe địch)
    BOARD_CELL_WIDTH: 108,    // Rộng ô bàn cờ (540 / 5)
    BOARD_CELL_HEIGHT: 130,   // Cao ô bàn cờ (Siêu to)

    BENCH_SLOTS: 9,           // 9 ô hàng chờ giữ nguyên
    BENCH_CELL_WIDTH: 60,     // Rộng ô hàng chờ (540 / 9)
    BENCH_CELL_HEIGHT: 90,    // Cao ô hàng chờ
    BENCH_START_Y: 780        // Vị trí bắt đầu hàng chờ (6 hàng sân đấu * 130px)
};

export const STATE = {
    roomId: null, playerId: null, playerGold: 20, playerLevel: 1, currentXp: 0,
    xpToNextLevel: 2, champions: [], activeProjectiles: [], isCombatPhase: false,
    playerLP: 50, botLP: 50, currentRound: 1
};

export { CHAMPION_POOL };

export const IMAGE_CACHE = {};
CHAMPION_POOL.forEach(champ => {
    const img = new Image();
    img.src = champ.img;
    IMAGE_CACHE[champ.name] = img;
});

// Hàm ma thuật tự động chuyển tọa độ lưới sang vị trí Pixel chính xác trên màn hình
export function getCanvasCoords(gridX, gridY) {
    if (gridY >= 6) { // Nếu nằm ở hàng chờ (Y = 6)
        return {
            x: gridX * CONFIG.BENCH_CELL_WIDTH,
            y: CONFIG.BENCH_START_Y,
            w: CONFIG.BENCH_CELL_WIDTH,
            h: CONFIG.BENCH_CELL_HEIGHT
        };
    } else { // Nếu nằm trên sân đấu (Y từ 0 đến 5)
        return {
            x: gridX * CONFIG.BOARD_CELL_WIDTH,
            y: gridY * CONFIG.BOARD_CELL_HEIGHT,
            w: CONFIG.BOARD_CELL_WIDTH,
            h: CONFIG.BOARD_CELL_HEIGHT
        };
    }
}

export const TRAITS_INFO = {
    // === PHE PHÁI (FACTIONS) ===
    "Team Bucciarati": {
        desc: "Protagonists seeking to overthrow the Boss.",
        thresholds: [
            { req: 2, effect: "All team members gain +15.000 HP" },
            { req: 4, effect: "All team members gain +35.000 HP" },
            { req: 6, effect: "All team members gain +70.000 HP" }
        ]
    },
    "La Squadra": {
        desc: "Execution Squad. Lethal and ruthless.",
        thresholds: [
            { req: 2, effect: "All La Squadra gain +6.000 Attack" },
            { req: 4, effect: "All La Squadra gain +15.000 Attack" },
            { req: 6, effect: "All La Squadra gain +30.000 Attack" }
        ]
    },
    "Unita Speciale": {
        desc: "The Boss's elite guard. Absolute loyalty.",
        thresholds: [
            { req: 2, effect: "Gain +30% Attack Speed & Skill Power" },
            { req: 4, effect: "Gain +60% Attack Speed & Skill Power" }
        ]
    },
    "Renegade": {
        desc: "Rogue stand users.",
        thresholds: [
            { req: 2, effect: "Gain +20.000 HP and +5.000 Attack" }
        ]
    },

    // === HỆ PHÁI (CLASSES) ===
    "Sniper": {
        desc: "Ranged attackers.",
        thresholds: [{ req: 2, effect: "+1 Range, +20% Attack" }]
    },
    "Brawler": {
        desc: "Close-combat specialists.",
        thresholds: [{ req: 2, effect: "+30% Attack Speed" }]
    },
    "Support": {
        desc: "Tactical advantage.",
        thresholds: [{ req: 2, effect: "Start combat with 30 Mana" }]
    },
    "Assassin": {
        desc: "Lethal strikes.",
        thresholds: [{ req: 2, effect: "+50% Attack Damage" }]
    },
    "Mage": {
        desc: "Stand powers focused on magic/abilities.",
        thresholds: [{ req: 1, effect: "Skills deal +30% power" }]
    }
};