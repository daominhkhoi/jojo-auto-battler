// static/js/combat.js
import { CONFIG, STATE, getCanvasCoords, CHAMPION_POOL } from './globals.js';
import { updateGold, refreshShop } from './shop.js';
import { showNotification } from './notifications.js';

export function updatePhysics() {
    if (!STATE.hitEffects) STATE.hitEffects = [];

    STATE.champions.forEach(champ => {
        const targetCoords = getCanvasCoords(champ.targetX, champ.targetY);

        if (champ.pixelX === undefined) champ.pixelX = targetCoords.x;
        if (champ.pixelY === undefined) champ.pixelY = targetCoords.y;

        champ.pixelX += (targetCoords.x - champ.pixelX) * 0.12;
        champ.pixelY += (targetCoords.y - champ.pixelY) * 0.12;

        if (champ.shakeTimer > 0) champ.shakeTimer--;
    });

    for (let i = STATE.activeProjectiles.length - 1; i >= 0; i--) {
        const proj = STATE.activeProjectiles[i];

        if (proj.type === 'melee') {
            proj.lifeTime--;
            if (proj.lifeTime === 8) {
                const target = STATE.champions.find(c => c.id === proj.targetId);
                if (target) target.shakeTimer = 12;
                STATE.hitEffects.push({ x: proj.targetX, y: proj.targetY, lifeTime: 8, maxLife: 8 });
            }
            if (proj.lifeTime <= 0) STATE.activeProjectiles.splice(i, 1);
        } else {
            const dx = proj.targetX - proj.x;
            const dy = proj.targetY - proj.y;
            const dist = Math.hypot(dx, dy);

            if (dist < proj.speed) {
                const target = STATE.champions.find(c => c.id === proj.targetId);
                if (target) target.shakeTimer = 12;

                STATE.hitEffects.push({ x: proj.targetX, y: proj.targetY, lifeTime: 12, maxLife: 12 });
                STATE.activeProjectiles.splice(i, 1);
            } else {
                proj.x += (dx / dist) * proj.speed;
                proj.y += (dy / dist) * proj.speed;
            }
        }
    }

    for (let i = STATE.hitEffects.length - 1; i >= 0; i--) {
        STATE.hitEffects[i].lifeTime--;
        if (STATE.hitEffects[i].lifeTime <= 0) STATE.hitEffects.splice(i, 1);
    }
}

export function syncTickData(data) {
    if (data.opponent_lp !== undefined) {
        STATE.botLP = data.opponent_lp;
        updateLpUI();
    }

    data.champions.forEach(serverChamp => {
        let localChamp = STATE.champions.find(c => c.id === serverChamp.id);

        if (localChamp) {
            localChamp.targetX = serverChamp.x;
            localChamp.targetY = serverChamp.y;
            localChamp.hp = serverChamp.hp;
            localChamp.mana = serverChamp.mana;
            localChamp.is_alive = serverChamp.is_alive;
            localChamp.buffs = serverChamp.buffs || [];
        } else {
            const template = CHAMPION_POOL.find(t => t.name === serverChamp.name) || {};

            STATE.champions.push({
                id: serverChamp.id,
                name: serverChamp.name,
                team: "Team2",
                star: serverChamp.star || 1,
                targetX: serverChamp.x,
                targetY: serverChamp.y,
                hp: serverChamp.hp,
                max_hp: serverChamp.max_hp,
                mana: serverChamp.mana,
                max_mana: serverChamp.max_mana,
                attack_range: template.attack_range || 1,
                is_alive: serverChamp.is_alive,
                shakeTimer: 0
            });
        }
    });

    if (!STATE.hitEffects) STATE.hitEffects = [];

    data.events.forEach(event => {
        // NẾU LÀ KỸ NĂNG (TUNG CHIÊU MẠNH)
        // NẾU LÀ KỸ NĂNG (TUNG CHIÊU MẠNH)
        if (event.type === 'skill') {
            const caster = STATE.champions.find(c => c.id === event.casterId);
            const target = STATE.champions.find(c => c.id === event.targetId);
            if (!caster) return;

            // Nếu là buff/heal thì mục tiêu là chính nó
            const targetChamp = target || caster;
            const tarSize = getCanvasCoords(targetChamp.targetX, targetChamp.targetY);

            // --- KIỂM TRA: NẾU LÀ SKILL VÙNG THÌ CHO TỒN TẠI LÂU HƠN (~4 GIÂY) ---
            let fxLife = 30; // Mặc định 0.5s cho sát thương nổ
            if (['aoe_dot', 'aoe_heal', 'mana_lock'].includes(event.skill_type)) {
                fxLife = 240; // Đóng đinh vùng này trên mặt đất trong 240 ticks (4s)
            }

            STATE.hitEffects.push({
                x: targetChamp.pixelX + tarSize.w / 2,
                y: targetChamp.pixelY + tarSize.h / 2,
                lifeTime: fxLife,
                maxLife: fxLife,
                effectType: event.skill_type // Gắn loại Skill để Canvas biết vẽ màu gì
            });

            // Nếu là dame thì địch rung bần bật
            if (event.skill_type === 'damage' && target) target.shakeTimer = 30;

        }
        // NẾU CHỈ LÀ ĐÁNH THƯỜNG / BẮN ĐẠN
        else if (event.type === 'attack') {
            const attacker = STATE.champions.find(c => c.id === event.attackerId);
            const target = STATE.champions.find(c => c.id === event.targetId);
            if (!attacker || !target || !attacker.is_alive) return;

            const attSize = getCanvasCoords(attacker.targetX, attacker.targetY);
            const tarSize = getCanvasCoords(target.targetX, target.targetY);
            const isRanged = attacker.attack_range > 1.5;

            STATE.activeProjectiles.push({
                x: attacker.pixelX + attSize.w / 2, y: attacker.pixelY + attSize.h / 2,
                targetX: target.pixelX + tarSize.w / 2, targetY: target.pixelY + tarSize.h / 2,
                targetId: event.targetId,
                type: isRanged ? 'projectile' : 'melee',
                speed: isRanged ? 16 : 0,
                lifeTime: isRanged ? 0 : 15
            });
        }
    });
}

export function handleCombatEnd() {
    // CHỐT CHẶN BẢO VỆ: Nếu trận đấu đã kết thúc rồi (isCombatPhase = false) thì thoát ngay, không tính toán lại
    if (!STATE.isCombatPhase) return;

    const myTeam = STATE.champions.filter(c => c.team === 'Team1' && c.targetY < 6 && c.is_alive);
    const enemyTeam = STATE.champions.filter(c => c.team === 'Team2' && c.targetY < 6 && c.is_alive);

    let playerWon = false;
    let isDraw = false;

    // Phân định thắng thua theo số lượng tàn quân
    if (myTeam.length > enemyTeam.length) {
        playerWon = true;
    } else if (myTeam.length < enemyTeam.length) {
        playerWon = false;
    } else {
        // Nếu số lượng quân bằng nhau -> Đếm tổng lượng máu còn lại của các quân trên sân
        const myHp = myTeam.reduce((sum, c) => sum + c.hp, 0);
        const enemyHp = enemyTeam.reduce((sum, c) => sum + c.hp, 0);
        if (myHp > enemyHp) playerWon = true;
        else if (myHp < enemyHp) playerWon = false;
        else isDraw = true; // Hòa tuyệt đối khi cả số quân lẫn tổng máu bằng khít nhau
    }

    handleRoundResult(playerWon, isDraw, myTeam, enemyTeam);
}

function handleRoundResult(playerWon, isDraw, myTeam, enemyTeam) {
    if (isDraw) {
        showNotification("TIME UP! IT'S A DRAW! No LP lost.");
    } else {
        const survivors = playerWon ? myTeam : enemyTeam;
        let damage = 0;

        survivors.forEach(c => {
            const template = CHAMPION_POOL.find(t => t.name === c.name) || {};
            const baseCost = template.cost || 1;
            const copies = Math.pow(3, (c.star || 1) - 1);
            damage += baseCost * copies;
        });

        // Trừ máu trực tiếp vào lượng LP hiện tại (Không có lệnh hồi máu nào ở đây cả)
        if (!playerWon) {
            STATE.playerLP -= damage;
            showNotification(`Defeat! You lost ${damage} LP`);
        } else {
            STATE.botLP -= damage;
            showNotification(`Victory! Opponent lost ${damage} LP`);
        }
    }

    updateLpUI();
    resetBoardForNextRound();
    refreshShop();
    showNotification("Shop refreshed!");
    STATE.isCombatPhase = false;

    const readyBtn = document.getElementById('readyBtn');
    const findBtn = document.getElementById('findMatchBtn');

    // --- KIỂM TRA ĐIỀU KIỆN KẾT THÚC TRẬN ĐẤU (LP VỀ 0) ---
    if (STATE.playerLP <= 0 || STATE.botLP <= 0) {
        // Máy ai có STATE.playerLP <= 0 sẽ hiện YOU LOST, máy còn lại sẽ hiện YOU WON!
        const resultMsg = STATE.playerLP <= 0 ? "YOU LOST!" : "YOU WON!";
        showNotification(`GAME OVER. ${resultMsg}`);

        // Khóa nút Ready lại không cho đấu tiếp vòng mới nữa
        if (readyBtn) readyBtn.style.display = 'none';

        // Hiện nút cho phép bấm để quay ra hàng chờ tìm trận mới
        if (findBtn) {
            findBtn.style.display = 'inline-block';
            findBtn.innerText = "FIND NEW MATCH";
            findBtn.disabled = false;
        }
    } else {
        // Nếu cả 2 vẫn còn LP thì mới nhảy sang vòng tiếp theo và phát vàng
        STATE.currentRound++;
        updateRoundUI();
        const income = 10 * STATE.currentRound;
        updateGold(income);
        showNotification(`Round ${STATE.currentRound}: Received ${income} gold`);

        if (findBtn) findBtn.style.display = 'none';
        if (readyBtn) {
            readyBtn.style.display = 'inline-block';
            readyBtn.innerText = "READY";
            readyBtn.style.backgroundColor = "#2ecc71";
            readyBtn.disabled = false;
        }
    }
}

function resetBoardForNextRound() {
    STATE.champions = STATE.champions.filter(c => c.team === 'Team1');
    STATE.champions.forEach(champ => {
        champ.hp = champ.max_hp;
        champ.mana = 0;
        champ.is_alive = true;

        // ---> THÊM DÒNG NÀY ĐỂ DỌN SẠCH CÁNH, KIẾM, ĐẦU LÂU KHI HẾT TRẬN <---
        champ.buffs = [];

        if (champ.originalX !== undefined && champ.originalY !== undefined) {
            champ.targetX = champ.originalX;
            champ.targetY = champ.originalY;
        }
        champ.shakeTimer = 0;
    });

    STATE.activeProjectiles = [];
    STATE.hitEffects = []; // (Dòng dọn vùng độc ở bước trước vẫn giữ nguyên nhé)
}
export function updateRoundUI() {
    const roundText = document.getElementById('roundText');
    if (roundText) roundText.innerText = STATE.currentRound;
}

export function updateLpUI() {
    const playerText = document.getElementById('playerLpText');
    const botText = document.getElementById('botLpText');
    if (playerText && botText) {
        playerText.innerText = STATE.playerLP;
        botText.innerText = STATE.botLP;
    }
}