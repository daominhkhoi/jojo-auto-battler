// static/js/network.js
import { STATE, CONFIG, CHAMPION_POOL, TRAITS_INFO } from './globals.js';
import { showNotification } from './notifications.js';

export const socket = io();

// ==========================================
// CÁC SỰ KIỆN LẮNG NGHE TỪ SERVER
// ==========================================
socket.on('connect', () => {
    console.log('Connected to Server!');
});

socket.on('match_found', (data) => {
    STATE.roomId = data.room;

    // --- CHUYỂN TỪ MÁU (LP) SANG ĐIỂM THẮNG (WINS), BẮT ĐẦU TỪ 0 ---
    STATE.playerLP = 0;
    STATE.botLP = 0;
    const pText = document.getElementById('playerLpText');
    const bText = document.getElementById('botLpText');
    if (pText) pText.innerText = "0/10"; // Hiện điểm số chạm 10
    if (bText) bText.innerText = "0/10";

    showNotification(`Match found with ${data.opponentName}!`);

    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) readyBtn.style.display = 'inline-block';

    const findBtn = document.getElementById('findMatchBtn');
    if (findBtn) findBtn.style.display = 'none';

    // HIỆN CỬA HÀNG KHI ĐÃ CÓ TRẬN
    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'flex';
    
    startPrepTimer();
});

socket.on('opponent_disconnected', () => {
    showNotification("Opponent disconnected! Match cancelled.");

    STATE.isCombatPhase = false;
    STATE.champions = [];

    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'none';

    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) readyBtn.style.display = 'none';

    const findBtn = document.getElementById('findMatchBtn');
    if (findBtn) {
        findBtn.style.display = 'inline-block';
        findBtn.innerText = "FIND MATCH";
        findBtn.disabled = false;
    }

    const nameInput = document.getElementById('playerNameInput');
    if (nameInput) nameInput.disabled = false;
});

socket.on('match_locked', () => {
    showNotification("Both ready! 5s to inspect opponent!");
});

let prepTimerInterval;

export function startPrepTimer() {
    clearInterval(prepTimerInterval);
    let timeLeft = 120; // 2 phút
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.style.display = 'inline-block';
        timerDisplay.innerText = "02:00";
    }

    prepTimerInterval = setInterval(() => {
        timeLeft--;
        if (timerDisplay) {
            const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const s = (timeLeft % 60).toString().padStart(2, '0');
            timerDisplay.innerText = `${m}:${s}`;
        }

        if (timeLeft <= 0) {
            clearInterval(prepTimerInterval);
            const readyBtn = document.getElementById('readyBtn');
            if (readyBtn && !readyBtn.disabled) {
                readyBtn.click();
            }
        }
    }, 1000);
}

export function stopPrepTimer() {
    clearInterval(prepTimerInterval);
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) timerDisplay.style.display = 'none';
}

let combatTimerInterval;

socket.on('combat_start', () => {
    showNotification("FIGHT!");

    let timeElapsed = 0; // Đổi từ đếm lùi 30 sang đếm tiến từ 0
    const timerText = document.getElementById('timerText');
    if (timerText) timerText.innerText = timeElapsed;

    clearInterval(combatTimerInterval);
    combatTimerInterval = setInterval(() => {
        timeElapsed++;

        if (timerText) {
            timerText.innerText = timeElapsed;
        }

        // Đã xóa hoàn toàn đoạn if (timeLeft <= 0) tự động gọi handleCombatEnd()
    }, 1000);
});

// Chuyển toàn bộ dữ liệu (Bao gồm Buffs và Events) sang cho combat.js xử lý
socket.on('sync_tick', (data) => {
    import('./combat.js').then(module => {
        module.syncTickData(data);
    });
});

// Nhớ dừng đồng hồ nếu trận đấu kết thúc sớm (trước 30s)
socket.on('combat_end', (data) => {
    clearInterval(combatTimerInterval);
    import('./combat.js').then(module => {
        // Truyền thẳng phán quyết của Server ('win', 'loss', 'draw') vào hàm
        module.handleCombatEnd(data ? data.result : 'draw');
    });
});
// ==========================================
// CÁC HÀM GỬI LỆNH LÊN SERVER
// ==========================================
export function findMatch() {
    const nameInput = document.getElementById('playerNameInput');
    const pName = nameInput && nameInput.value.trim() !== "" ? nameInput.value : "Player";

    if (nameInput) nameInput.disabled = true;

    socket.emit('find_match', { name: pName });

    const btn = document.getElementById('findMatchBtn');
    if (btn) {
        btn.innerText = "SEARCHING...";
        btn.disabled = true;
    }
}

export function declareReady() {
    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) {
        readyBtn.innerText = "WAITING FOR OPPONENT...";
        readyBtn.disabled = true;
    }
    STATE.isCombatPhase = true;
    stopPrepTimer();

    // ---> BẮT ĐẦU ĐOẠN CODE SỬA LỖI TRÙNG ID <---
    // 0. CẤP TIỀN TỐ ĐỘC QUYỀN CHO NGƯỜI CHƠI NÀY ĐỂ ID KHÔNG BAO GIỜ TRÙNG VỚI ĐỊCH
    if (!STATE.myPlayerPrefix) {
        // Tạo một chuỗi ngẫu nhiên (Ví dụ: "p_a1b2c3_")
        STATE.myPlayerPrefix = "p_" + Math.random().toString(36).substr(2, 6) + "_";
    }
    STATE.champions.forEach(c => {
        // Nếu ID của tướng chưa có tiền tố này thì gắn vào
        if (!c.id.toString().startsWith(STATE.myPlayerPrefix)) {
            c.id = STATE.myPlayerPrefix + c.id;
        }
    });

    // 1. TÍNH TOÁN TỘC / HỆ
    const uniqueChamps = [];
    const countedNames = new Set();
    const boardChampsRaw = STATE.champions.filter(c => c.targetY < 6);

    boardChampsRaw.forEach(c => {
        if (!countedNames.has(c.name)) {
            countedNames.add(c.name);
            uniqueChamps.push(c);
        }
    });

    const traitCounts = {};
    uniqueChamps.forEach(c => {
        const template = CHAMPION_POOL.find(t => t.name === c.name);
        if (template && template.traits) {
            template.traits.forEach(t => {
                traitCounts[t] = (traitCounts[t] || 0) + 1;
            });
        }
    });

    // 2. ÉP CHỈ SỐ BUFF VÀO TƯỚNG TRƯỚC KHI GỬI ĐI ĐÁNH NHAU
    // --- BUFF TOÀN ĐỘI (GLOBAL BUFFS) ---
    let globalHpBuff = 0;

    // Team Bucciarati buff máu cho CẢ ĐỘI
    if (traitCounts["Team Bucciarati"] >= 6) globalHpBuff += 70000;
    else if (traitCounts["Team Bucciarati"] >= 4) globalHpBuff += 35000;
    else if (traitCounts["Team Bucciarati"] >= 2) globalHpBuff += 15000;

    // Global buffs (Utility Class)
    if (traitCounts["Utility"] >= 6) globalHpBuff += 50000;
    else if (traitCounts["Utility"] >= 4) globalHpBuff += 25000;
    else if (traitCounts["Utility"] >= 2) globalHpBuff += 10000;

    const boardChamps = boardChampsRaw.map(c => {
        const template = CHAMPION_POOL.find(t => t.name === c.name) || {};

        let finalHp = c.max_hp + globalHpBuff;
        let finalAttack = c.attack;
        let finalRange = c.attack_range;
        let finalSpeed = c.speed;
        let finalMana = 0;
        let finalSkill = JSON.parse(JSON.stringify(c.skill || template.skill || { type: 'damage', power: 50, duration: 0 }));
        let finalBuffs = [];

        if (template.traits) {

            // === FACTIONS ===
            if (template.traits.includes("Stardust")) {
                if (traitCounts["Stardust"] >= 6) { finalHp *= 1.9; finalAttack *= 1.9; }
                else if (traitCounts["Stardust"] >= 4) { finalHp *= 1.5; finalAttack *= 1.5; }
                else if (traitCounts["Stardust"] >= 2) { finalHp *= 1.2; finalAttack *= 1.2; }
            }

            if (template.traits.includes("Tarot")) {
                if (traitCounts["Tarot"] >= 6) finalMana = 100;
                else if (traitCounts["Tarot"] >= 4) finalMana = 60;
                else if (traitCounts["Tarot"] >= 2) finalMana = 30;
            }

            if (template.traits.includes("Morioh")) {
                if (traitCounts["Morioh"] >= 6) finalHp += 120000;
                else if (traitCounts["Morioh"] >= 4) finalHp += 60000;
                else if (traitCounts["Morioh"] >= 2) finalHp += 25000;
            }

            if (template.traits.includes("Bucciarati")) {
                if (traitCounts["Bucciarati"] >= 6) { if (finalSkill.power) finalSkill.power *= 2.3; }
                else if (traitCounts["Bucciarati"] >= 4) { if (finalSkill.power) finalSkill.power *= 1.7; }
                else if (traitCounts["Bucciarati"] >= 2) { if (finalSkill.power) finalSkill.power *= 1.3; }
            }

            if (template.traits.includes("La Squadra")) {
                if (traitCounts["La Squadra"] >= 6) finalAttack += 80000;
                else if (traitCounts["La Squadra"] >= 4) finalAttack += 40000;
                else if (traitCounts["La Squadra"] >= 2) finalAttack += 15000;
            }

            if (template.traits.includes("Unita Speciale")) {
                if (traitCounts["Unita Speciale"] >= 4) { finalSpeed *= 1.6; if (finalSkill.power) finalSkill.power *= 1.6; }
                else if (traitCounts["Unita Speciale"] >= 2) { finalSpeed *= 1.3; if (finalSkill.power) finalSkill.power *= 1.3; }
            }

            if (template.traits.includes("Green Dolphin")) {
                let reflectPercent = 0;
                if (traitCounts["Green Dolphin"] >= 6) reflectPercent = 0.9;
                else if (traitCounts["Green Dolphin"] >= 4) reflectPercent = 0.5;
                else if (traitCounts["Green Dolphin"] >= 2) reflectPercent = 0.2;
                
                if (reflectPercent > 0) {
                    finalBuffs.push({ type: 'reflect_shield', power: reflectPercent });
                }
            }

            if (template.traits.includes("Requiem")) {
                if (traitCounts["Requiem"] >= 2) { finalHp += 100000; finalAttack += 100000; }
                else if (traitCounts["Requiem"] >= 1) { finalAttack += 30000; }
            }

            // === CLASSES ===
            if (template.traits.includes("Power Type")) {
                if (traitCounts["Power Type"] >= 6) finalSpeed *= 1.9;
                else if (traitCounts["Power Type"] >= 4) finalSpeed *= 1.5;
                else if (traitCounts["Power Type"] >= 2) finalSpeed *= 1.2;
            }

            if (template.traits.includes("Long-Distance")) {
                if (traitCounts["Long-Distance"] >= 6) { finalRange += 1; finalAttack *= 2.0; }
                else if (traitCounts["Long-Distance"] >= 4) { finalRange += 1; finalAttack *= 1.5; }
                else if (traitCounts["Long-Distance"] >= 2) { finalRange += 1; finalAttack *= 1.2; }
            }

            if (template.traits.includes("Automatic")) {
                if (traitCounts["Automatic"] >= 6) finalAttack *= 2.5;
                else if (traitCounts["Automatic"] >= 4) finalAttack *= 1.9;
                else if (traitCounts["Automatic"] >= 2) finalAttack *= 1.4;
            }

            if (template.traits.includes("Phenomenon")) {
                if (traitCounts["Phenomenon"] >= 6) { 
                    if (finalSkill.duration) finalSkill.duration *= 2.3;
                    if (finalSkill.radius) finalSkill.radius *= 2.3;
                }
                else if (traitCounts["Phenomenon"] >= 4) {
                    if (finalSkill.duration) finalSkill.duration *= 1.7;
                    if (finalSkill.radius) finalSkill.radius *= 1.7;
                }
                else if (traitCounts["Phenomenon"] >= 2) {
                    if (finalSkill.duration) finalSkill.duration *= 1.3;
                    if (finalSkill.radius) finalSkill.radius *= 1.3;
                }
            }

            if (template.traits.includes("Bound")) {
                if (traitCounts["Bound"] >= 6) finalHp *= 2.2;
                else if (traitCounts["Bound"] >= 4) finalHp *= 1.7;
                else if (traitCounts["Bound"] >= 2) finalHp *= 1.3;
            }
        }

        // Đảm bảo làm tròn số sau khi tính toán %
        if (finalSkill.power) finalSkill.power = Math.round(finalSkill.power);
        if (finalSkill.duration) finalSkill.duration = parseFloat(finalSkill.duration.toFixed(1));
        if (finalSkill.radius) finalSkill.radius = parseFloat(finalSkill.radius.toFixed(1));

        return {
            id: c.id, name: c.name, star: c.star,
            x: c.targetX, y: c.targetY,
            max_hp: Math.round(finalHp),
            attack: Math.round(finalAttack),
            attack_range: finalRange,
            speed: parseFloat(finalSpeed.toFixed(2)),
            max_mana: c.max_mana, start_mana: finalMana,
            skill: finalSkill,
            active_buffs: finalBuffs
        };
    });

    socket.emit('submit_board', {
        room: STATE.roomId,
        champions: boardChamps,
        lp: STATE.playerLP
    });
}