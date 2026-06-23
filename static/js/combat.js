// static/js/combat.js
import { CONFIG, STATE, getCanvasCoords, CHAMPION_POOL } from './globals.js';
import { updateGold, refreshShop } from './shop.js';
import { startPrepTimer, stopPrepTimer } from './network.js';
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

                // Spawn sparks
                if (!STATE.particles) STATE.particles = [];
                for (let p = 0; p < 5; p++) {
                    STATE.particles.push({
                        x: proj.targetX, y: proj.targetY,
                        vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
                        color: '#e74c3c', size: Math.random() * 3 + 1, life: 15 + Math.random() * 10
                    });
                }
            }
            if (proj.lifeTime <= 0) STATE.activeProjectiles.splice(i, 1);
        } else {
            const dx = proj.targetX - proj.x;
            const dy = proj.targetY - proj.y;
            const dist = Math.hypot(dx, dy);

            // Spawn trail particles for ranged
            if (Math.random() < 0.5) {
                if (!STATE.particles) STATE.particles = [];
                STATE.particles.push({
                    x: proj.x, y: proj.y,
                    vx: -dx / dist * 2 + (Math.random() - 0.5), vy: -dy / dist * 2 + (Math.random() - 0.5),
                    color: '#00ffff', size: 2, life: 10
                });
            }

            if (dist < proj.speed) {
                const target = STATE.champions.find(c => c.id === proj.targetId);
                if (target) target.shakeTimer = 12;

                STATE.hitEffects.push({ x: proj.targetX, y: proj.targetY, lifeTime: 12, maxLife: 12 });
                STATE.activeProjectiles.splice(i, 1);

                // Spawn impact spark
                if (!STATE.particles) STATE.particles = [];
                for (let p = 0; p < 8; p++) {
                    STATE.particles.push({
                        x: proj.targetX, y: proj.targetY,
                        vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
                        color: '#00ffff', size: Math.random() * 4 + 1, life: 20 + Math.random() * 10
                    });
                }
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

    if (!STATE.particles) STATE.particles = [];
    for (let i = STATE.particles.length - 1; i >= 0; i--) {
        const p = STATE.particles[i];
        p.x += p.vx; p.y += p.vy;
        p.life--;
        if (p.life <= 0) STATE.particles.splice(i, 1);
    }

    if (!STATE.floatingTexts) STATE.floatingTexts = [];
    for (let i = STATE.floatingTexts.length - 1; i >= 0; i--) {
        const t = STATE.floatingTexts[i];
        t.y -= t.speed;
        t.life--;
        if (t.life <= 0) STATE.floatingTexts.splice(i, 1);
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
            if (localChamp.is_alive && !serverChamp.is_alive) {
                if (!STATE.particles) STATE.particles = [];
                const tarSize = getCanvasCoords(localChamp.targetX, localChamp.targetY);
                for (let p = 0; p < 20; p++) {
                    STATE.particles.push({
                        x: (localChamp.pixelX || tarSize.x) + tarSize.w / 2,
                        y: (localChamp.pixelY || tarSize.y) + tarSize.h / 2,
                        vx: (Math.random() - 0.5) * 8,
                        vy: (Math.random() - 0.5) * 8,
                        color: '#f1c40f',
                        size: Math.random() * 5 + 2,
                        life: 30 + Math.random() * 20
                    });
                }
            }

            localChamp.hp = serverChamp.hp;
            localChamp.mana = serverChamp.mana;
            localChamp.shield = serverChamp.shield || 0;
            localChamp.is_alive = serverChamp.is_alive;
            localChamp.team = serverChamp.team;
            localChamp.buffs = serverChamp.buffs || [];
            localChamp.buff_details = serverChamp.buff_details || [];
        } else {
            const template = CHAMPION_POOL.find(t => t.name === serverChamp.name) || {};

            STATE.champions.push({
                id: serverChamp.id,
                name: serverChamp.name,
                team: serverChamp.team || "Team2",
                star: serverChamp.star || 1,
                targetX: serverChamp.x,
                targetY: serverChamp.y,
                hp: serverChamp.hp,
                max_hp: serverChamp.max_hp,
                mana: serverChamp.mana,
                max_mana: serverChamp.max_mana,
                shield: serverChamp.shield || 0,
                attack: serverChamp.attack || template.attack,
                speed: serverChamp.speed || template.speed,
                attack_range: serverChamp.attack_range || template.attack_range,
                is_alive: serverChamp.is_alive,
                shakeTimer: 0,
                buffs: serverChamp.buffs || []
            });
        }
    });

    if (!STATE.hitEffects) STATE.hitEffects = [];

    data.events.forEach(event => {
        if (event.type === 'skill') {
            const caster = STATE.champions.find(c => c.id === event.casterId);
            const target = STATE.champions.find(c => c.id === event.targetId);
            if (!caster) return;

            const targetChamp = target || caster;
            const tarSize = getCanvasCoords(targetChamp.targetX, targetChamp.targetY);

            // TỰ ĐỘNG CHUYỂN GIÂY (DURATION) THÀNH FRAME CANCHÚA (60 FPS)
            let fxLife = 30; // Mặc định 0.5s cho kỹ năng bộc phá ngay lập tức
            if (event.duration && event.duration > 0) {
                fxLife = Math.round(event.duration * 60);
            }

            if (event.skill_type === 'ricochet') {
                STATE.hitEffects.push({
                    x: 0, y: 0, // Dùng tọa độ thực khi vẽ
                    effectType: 'ricochet_chain',
                    path: event.bounce_path || [targetChamp.id],
                    casterId: caster.id,
                    lifeTime: 30, maxLife: 30
                });
            } else {
                STATE.hitEffects.push({
                    x: targetChamp.pixelX + tarSize.w / 2,
                    y: targetChamp.pixelY + tarSize.h / 2,
                    lifeTime: fxLife,
                    maxLife: fxLife,
                    effectType: event.skill_type,
                    radius: event.radius || 1.5 // Nhận bán kính ô cờ từ Server gửi xuống
                });
            }

            if (event.skill_type === 'damage' && target) target.shakeTimer = 30;
        }
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
        else if (['evasion', 'reflect', 'damage_link_proc', 'revive'].includes(event.type)) {
            const target = STATE.champions.find(c => c.id === event.targetId || c.id === event.target_id);
            if (!target) return;
            const tarSize = getCanvasCoords(target.targetX, target.targetY);

            STATE.hitEffects.push({
                x: target.pixelX + tarSize.w / 2,
                y: target.pixelY + tarSize.h / 2,
                lifeTime: 30,
                maxLife: 30,
                effectType: event.type,
                damage: event.damage
            });
        }
    });
}

export function handleCombatEnd(serverResult) {
    if (!STATE.isCombatPhase) return;

    // --- 1. DÙNG KẾT QUẢ TỪ TRỌNG TÀI SERVER ĐỂ PHÂN ĐỊNH ---
    if (serverResult === 'draw') {
        showNotification("TIME UP! IT'S A DRAW! No points awarded.");
    } else if (serverResult === 'win') {
        STATE.playerLP += 1;
        showNotification("Victory! You won this round!");
    } else if (serverResult === 'loss') {
        STATE.botLP += 1;
        showNotification("Defeat! Opponent won this round!");
    }

    updateLpUI();
    resetBoardForNextRound();
    refreshShop();
    STATE.isCombatPhase = false;

    const readyBtn = document.getElementById('readyBtn');
    const findBtn = document.getElementById('findMatchBtn');

    // --- 2. KIỂM TRA ĐIỀU KIỆN CHẠM MỐC 10 ĐIỂM ---
    if (STATE.playerLP >= 10 || STATE.botLP >= 10) {
        stopPrepTimer();
        const isWinner = STATE.playerLP >= 10;
        const resultMsg = isWinner ? "🏆 YOU WON THE MATCH! 🏆" : "💀 YOU LOST THE MATCH! 💀";

        // TẠO MÀN HÌNH GAME OVER ĐEN MỜ ĐÈ LÊN TOÀN BỘ TRÒ CHƠI
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0'; overlay.style.left = '0';
        overlay.style.width = '100vw'; overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.85)'; // Nền đen mờ 85%
        overlay.style.color = isWinner ? '#f1c40f' : '#e74c3c';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '9999'; // Đảm bảo đè lên mọi thứ

        overlay.innerHTML = `
            <h1 style="font-size: 70px; margin-bottom: 20px; text-shadow: 0 0 20px ${isWinner ? '#f1c40f' : '#e74c3c'};">${resultMsg}</h1>
            <p style="font-size: 30px; color: white; margin-bottom: 50px;">Final Score: <span style="color:#2ecc71">${STATE.playerLP}</span> - <span style="color:#e74c3c">${STATE.botLP}</span></p>
            <button id="restartBtn" style="padding: 15px 40px; font-size: 24px; font-weight: bold; cursor: pointer; background: #3498db; color: #fff; border: none; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">FIND NEW MATCH</button>
        `;
        document.body.appendChild(overlay);

        // Chức năng cho nút chơi ván mới (Lưu tên -> F5)
        document.getElementById('restartBtn').addEventListener('click', () => {
            // 1. Lấy tên người chơi hiện tại trên ô input
            const nameInput = document.getElementById('playerNameInput');
            const currentPlayerName = nameInput && nameInput.value.trim() !== "" ? nameInput.value : "Player1";

            // 2. Cất tên và trạng thái muốn tự động tìm trận vào bộ nhớ tạm
            sessionStorage.setItem('savedPlayerName', currentPlayerName);
            sessionStorage.setItem('autoFindMatch', 'true');

            // 3. F5 Refresh lại trang Web
            window.location.reload();
        });

    } else {
        // --- 3. NẾU CHƯA AI ĐƯỢC 10 ĐIỂM THÌ ĐÁNH TIẾP ---
        STATE.currentRound++;
        updateRoundUI();

        let baseIncome = (STATE.currentRound * 5) + 5;
        updateGold(baseIncome);
        let notifMsg = `Round ${STATE.currentRound} Start: +${baseIncome} Gold`;
        showNotification(notifMsg);

        if (findBtn) findBtn.style.display = 'none';
        if (readyBtn) {
            readyBtn.style.display = 'inline-block';
            readyBtn.innerText = "READY";
            readyBtn.style.backgroundColor = "#2ecc71";
            readyBtn.disabled = false;
        }
        startPrepTimer();
    }
}

function resetBoardForNextRound() {
    // Chỉ giữ lại những tướng gốc của người chơi (có originalX)
    STATE.champions = STATE.champions.filter(c => c.originalX !== undefined);
    STATE.champions.forEach(champ => {
        champ.hp = champ.max_hp;
        champ.mana = 0;
        champ.shield = 0;
        champ.is_alive = true;
        champ.team = 'Team1'; // Trả lại đội hình gốc lỡ bị mind_control hay soul_swap

        // ---> THÊM DÒNG NÀY ĐỂ DỌN SẠCH CÁNH, KIẾM, ĐẦU LÂU KHI HẾT TRẬN <---
        champ.buffs = [];
        champ.buff_details = [];

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
        // Hiển thị dạng "Điểm hiện tại / 10"
        playerText.innerText = `${STATE.playerLP}/10`;
        botText.innerText = `${STATE.botLP}/10`;
    }
}