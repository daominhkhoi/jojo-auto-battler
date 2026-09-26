import { CHAMPION_POOL } from './entities.js';
import { IMAGES } from './assets.js';

export const CONFIG = {
    BOARD_COLS: 5,            // 5 board columns
    BOARD_ROWS: 6,            // 6 rows total (3 player rows, 3 enemy rows)
    BOARD_CELL_WIDTH: 108,    // Cell width (540 / 5)
    BOARD_CELL_HEIGHT: 130,   // Cell height

    BENCH_SLOTS: 9,           // 9 bench slots
    BENCH_CELL_WIDTH: 60,     // Bench slot width
    BENCH_CELL_HEIGHT: 90,    // Bench slot height
    BENCH_START_Y: 780        // Bench Y start position (6 rows * 130px)
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
    hitEffects: [],
    screenShake: 0,
    screenFlash: null,
    isCombatPhase: false,
    playerLP: 0,   // FIX: was 100 — score starts at 0, win condition is 10
    botLP: 0,      // FIX: same
    currentRound: 1,
    myTeam: 'Team1'
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

// Convert grid coordinates to canvas pixel coordinates
export function getCanvasCoords(gridX, gridY) {
    if (gridY >= 6) { // Bench slot (Y = 6)
        return {
            x: gridX * CONFIG.BENCH_CELL_WIDTH,
            y: CONFIG.BENCH_START_Y,
            w: CONFIG.BENCH_CELL_WIDTH,
            h: CONFIG.BENCH_CELL_HEIGHT
        };
    } else { // Board slot (Y 0 to 5)
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
            { req: 2, effect: "+25% Max HP" },
            { req: 4, effect: "+60% Max HP" },
            { req: 6, effect: "+120% Max HP" }
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
            { req: 2, effect: "+25% Attack" },
            { req: 4, effect: "+60% Attack" },
            { req: 6, effect: "+120% Attack" }
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
            { req: 1, effect: "+50% Attack" },
            { req: 2, effect: "+80% Max HP & +100% Attack" }
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