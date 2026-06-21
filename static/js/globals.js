import { CHAMPION_POOL } from './entities.js';
import { IMAGES } from './assets.js';

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
    roomId: null,
    playerId: null,
    playerGold: 10,
    playerLevel: 1,
    levelCost: 5,
    currentXp: 0,
    xpToNextLevel: 2,
    champions: [],
    activeProjectiles: [],
    particles: [],
    floatingTexts: [],
    isCombatPhase: false,
    playerLP: 100, 
    botLP: 100,   
    currentRound: 1
};


export { CHAMPION_POOL };

export const IMAGE_CACHE = {};
CHAMPION_POOL.forEach(champ => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = champ.img;
    IMAGE_CACHE[champ.name] = img;
});

if (IMAGES["Background"]) {
    const bgImg = new Image();
    bgImg.crossOrigin = "anonymous";
    bgImg.src = IMAGES["Background"];
    IMAGE_CACHE["Background"] = bgImg;
}

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
    // === FACTIONS (PARTS) ===
    "Stardust": {
        desc: "Jotaro's companions (Part 3). Travel the world.",
        thresholds: [
            { req: 2, effect: "+20% HP and ATK" },
            { req: 4, effect: "+50% HP and ATK" },
            { req: 6, effect: "+90% HP and ATK" }
        ]
    },
    "Tarot": {
        desc: "DIO's minions (Part 3). Striking from the shadows.",
        thresholds: [
            { req: 2, effect: "Start combat with 30 Mana" },
            { req: 4, effect: "Start combat with 60 Mana" },
            { req: 6, effect: "Start combat with 100 Mana" }
        ]
    },
    "Morioh": {
        desc: "Protectors of the crazy, noisy, bizarre town (Part 4).",
        thresholds: [
            { req: 2, effect: "+25.000 HP" },
            { req: 4, effect: "+60.000 HP" },
            { req: 6, effect: "+120.000 HP" }
        ]
    },
    "Bucciarati": {
        desc: "The golden wind (Part 5).",
        thresholds: [
            { req: 2, effect: "+30% Skill Power" },
            { req: 4, effect: "+70% Skill Power" },
            { req: 6, effect: "+130% Skill Power" }
        ]
    },
    "La Squadra": {
        desc: "The execution squad (Part 5).",
        thresholds: [
            { req: 2, effect: "+15.000 Attack" },
            { req: 4, effect: "+40.000 Attack" },
            { req: 6, effect: "+80.000 Attack" }
        ]
    },
    "Unita Speciale": {
        desc: "The Boss's elite guard (Part 5).",
        thresholds: [
            { req: 2, effect: "+30% Attack Speed & Skill Power" },
            { req: 4, effect: "+60% Attack Speed & Skill Power" }
        ]
    },
    "Green Dolphin": {
        desc: "Inmates of Stone Ocean (Part 6).",
        thresholds: [
            { req: 2, effect: "Reflect 20% Damage" },
            { req: 4, effect: "Reflect 50% Damage" },
            { req: 6, effect: "Reflect 90% Damage" }
        ]
    },
    "Requiem": {
        desc: "Pierced by the Stand Arrow.",
        thresholds: [
            { req: 1, effect: "+30.000 Attack" },
            { req: 2, effect: "+100.000 HP & +30.000 Attack" }
        ]
    },

    // === CLASSES (STAND TYPES) ===
    "Power Type": {
        desc: "Close-range power (Brawler).",
        thresholds: [
            { req: 2, effect: "+20% Attack Speed" },
            { req: 4, effect: "+50% Attack Speed" },
            { req: 6, effect: "+90% Attack Speed" }
        ]
    },
    "Long-Distance": {
        desc: "Ranged operation (Sniper).",
        thresholds: [
            { req: 2, effect: "+1 Range, +20% Attack" },
            { req: 4, effect: "+1 Range, +50% Attack" },
            { req: 6, effect: "+1 Range, +100% Attack" }
        ]
    },
    "Automatic": {
        desc: "Tracking stands (Assassin).",
        thresholds: [
            { req: 2, effect: "+40% Attack" },
            { req: 4, effect: "+90% Attack" },
            { req: 6, effect: "+150% Attack" }
        ]
    },
    "Phenomenon": {
        desc: "Environment manipulation (Mage).",
        thresholds: [
            { req: 2, effect: "+30% Skill Duration & Radius" },
            { req: 4, effect: "+70% Skill Duration & Radius" },
            { req: 6, effect: "+130% Skill Duration & Radius" }
        ]
    },
    "Utility": {
        desc: "Special abilities (Support).",
        thresholds: [
            { req: 2, effect: "+10.000 HP for ALL ALLIES" },
            { req: 4, effect: "+25.000 HP for ALL ALLIES" },
            { req: 6, effect: "+50.000 HP for ALL ALLIES" }
        ]
    },
    "Bound": {
        desc: "Materialized stands (Vanguard).",
        thresholds: [
            { req: 2, effect: "+30% Max HP" },
            { req: 4, effect: "+70% Max HP" },
            { req: 6, effect: "+120% Max HP" }
        ]
    }
};