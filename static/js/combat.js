// static/js/combat.js
import { CONFIG, STATE, getCanvasCoords, CHAMPION_POOL } from './globals.js';
import { updateGold, refreshShop } from './shop.js';
import { startPrepTimer, stopPrepTimer } from './network.js';
import { showNotification } from './notifications.js';

export function spawnFloatingText(x, y, text, type = 'normal', options = {}) {
    if (!STATE.floatingTexts) STATE.floatingTexts = [];

    // Jitter X slightly so multiple simultaneous hits do not overlap illegibly
    const jitterX = (Math.random() - 0.5) * 22;
    const startX = x + jitterX;
    const startY = y - 10;

    let color = '#ffffff';
    let baseScale = 1.0;
    let glow = false;
    let glowColor = '';
    let font = 'bold 20px "Segoe UI", Arial, sans-serif';

    switch (type) {
        case 'crit':
            color = '#ff3838';
            baseScale = 1.45;
            glow = true;
            glowColor = '#ff3838';
            font = '900 24px "Segoe UI", Arial, sans-serif';
            break;
        case 'skill':
            color = '#ffa502';
            baseScale = 1.35;
            glow = true;
            glowColor = '#ffa502';
            font = 'bold 22px "Segoe UI", Arial, sans-serif';
            break;
        case 'heal':
            color = '#2ecc71';
            baseScale = 1.2;
            glow = true;
            glowColor = '#2ecc71';
            font = 'bold 20px "Segoe UI", Arial, sans-serif';
            break;
        case 'shield':
            color = '#ecf0f1';
            baseScale = 1.1;
            font = 'bold 18px "Segoe UI", Arial, sans-serif';
            break;
        case 'status':
            color = options.color || '#f1c40f';
            baseScale = options.scale || 1.3;
            glow = true;
            glowColor = options.glowColor || color;
            font = '900 21px "Segoe UI", Arial, sans-serif';
            break;
        case 'normal':
        default:
            color = options.color || '#ffffff';
            baseScale = 1.0;
            font = 'bold 19px "Segoe UI", Arial, sans-serif';
            break;
    }

    if (options.color) color = options.color;
    if (options.scale) baseScale = options.scale;

    STATE.floatingTexts.push({
        x: startX,
        y: startY,
        vx: (Math.random() - 0.5) * 0.7,
        vy: 2.2,
        text: text,
        color: color,
        life: 48,
        maxLife: 48,
        baseScale: baseScale,
        scale: baseScale * 1.35,
        scaleProgress: 0,
        glow: glow,
        glowColor: glowColor,
        font: font
    });
}

export function updatePhysics() {
    if (!STATE.hitEffects) STATE.hitEffects = [];

    STATE.champions.forEach(champ => {
        const targetCoords = getCanvasCoords(champ.targetX, champ.targetY);

        if (champ.pixelX === undefined) champ.pixelX = targetCoords.x;
        if (champ.pixelY === undefined) champ.pixelY = targetCoords.y;

        champ.pixelX += (targetCoords.x - champ.pixelX) * 0.12;
        champ.pixelY += (targetCoords.y - champ.pixelY) * 0.12;

        if (champ.shakeTimer > 0) champ.shakeTimer--;

        // Ghost HP bar smoothly drains towards current HP
        if (champ.ghostHp === undefined || champ.ghostHp < champ.hp) {
            champ.ghostHp = champ.hp;
        } else if (champ.ghostHp > champ.hp) {
            champ.ghostHp -= (champ.ghostHp - champ.hp) * 0.08;
        }
    });

    for (let i = STATE.activeProjectiles.length - 1; i >= 0; i--) {
        const proj = STATE.activeProjectiles[i];

        if (proj.type === 'melee') {
            proj.lifeTime--;
            if (proj.lifeTime === 8) {
                const target = STATE.champions.find(c => c.id === proj.targetId);
                if (target) {
                    target.shakeTimer = 12;
                    const dmg = proj.damage || 0;
                    if (dmg > 0) {
                        const isCrit = dmg >= 10000;
                        spawnFloatingText(proj.targetX, proj.targetY, (isCrit ? `CRIT! -${dmg.toLocaleString()}` : `-${dmg.toLocaleString()}`), isCrit ? 'crit' : 'normal');
                        if (isCrit) {
                            STATE.screenShake = Math.max(STATE.screenShake || 0, 5);
                        }
                    }
                }
                STATE.hitEffects.push({ x: proj.targetX, y: proj.targetY, lifeTime: 8, maxLife: 8 });

                // Spawn blood & impact sparks
                if (!STATE.particles) STATE.particles = [];
                for (let p = 0; p < 8; p++) {
                    STATE.particles.push({
                        x: proj.targetX, y: proj.targetY,
                        vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12,
                        color: Math.random() < 0.6 ? '#e74c3c' : '#f39c12',
                        size: Math.random() * 3 + 1, life: 15 + Math.random() * 10
                    });
                }
            }
            if (proj.lifeTime <= 0) STATE.activeProjectiles.splice(i, 1);
        } else {
            const dx = proj.targetX - proj.x;
            const dy = proj.targetY - proj.y;
            const dist = Math.hypot(dx, dy);

            // Spawn luminous energy trail particles for ranged
            if (Math.random() < 0.6) {
                if (!STATE.particles) STATE.particles = [];
                STATE.particles.push({
                    x: proj.x, y: proj.y,
                    vx: -dx / dist * 2 + (Math.random() - 0.5), vy: -dy / dist * 2 + (Math.random() - 0.5),
                    color: Math.random() < 0.5 ? '#00ffff' : '#ffffff',
                    size: Math.random() * 2.5 + 1, life: 12
                });
            }

            if (dist < proj.speed) {
                const target = STATE.champions.find(c => c.id === proj.targetId);
                if (target) {
                    target.shakeTimer = 12;
                    const dmg = proj.damage || 0;
                    if (dmg > 0) {
                        const isCrit = dmg >= 10000;
                        spawnFloatingText(proj.targetX, proj.targetY, (isCrit ? `CRIT! -${dmg.toLocaleString()}` : `-${dmg.toLocaleString()}`), isCrit ? 'crit' : 'normal');
                        if (isCrit) {
                            STATE.screenShake = Math.max(STATE.screenShake || 0, 5);
                        }
                    }
                }

                STATE.hitEffects.push({ x: proj.targetX, y: proj.targetY, lifeTime: 12, maxLife: 12 });
                STATE.activeProjectiles.splice(i, 1);

                // Spawn impact spark explosion
                if (!STATE.particles) STATE.particles = [];
                for (let p = 0; p < 10; p++) {
                    STATE.particles.push({
                        x: proj.targetX, y: proj.targetY,
                        vx: (Math.random() - 0.5) * 14, vy: (Math.random() - 0.5) * 14,
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
        t.x += (t.vx || 0);
        t.y -= (t.vy || 1.4);
        if (t.vy > 0.4) t.vy *= 0.95; // Gentle upward deceleration
        if (t.scaleProgress !== undefined && t.scaleProgress < 1.0) {
            t.scaleProgress += 0.12;
            t.scale = (t.baseScale || 1.0) * (1.35 - 0.35 * Math.sin(t.scaleProgress * Math.PI));
        }
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

            // Death particle burst & soul wisp
            if (localChamp.is_alive && !serverChamp.is_alive) {
                STATE.screenShake = Math.max(STATE.screenShake || 0, 6);
                if (!STATE.particles) STATE.particles = [];
                const tarSize = getCanvasCoords(localChamp.targetX, localChamp.targetY);
                const deathCenterX = (localChamp.pixelX || tarSize.x) + tarSize.w / 2;
                const deathCenterY = (localChamp.pixelY || tarSize.y) + tarSize.h / 2;

                // 25 Shatter spark particles
                for (let p = 0; p < 25; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    const spd = Math.random() * 8 + 2;
                    STATE.particles.push({
                        x: deathCenterX,
                        y: deathCenterY,
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        color: Math.random() < 0.5 ? '#f39c12' : '#e74c3c',
                        size: Math.random() * 5 + 2,
                        life: 30 + Math.random() * 20
                    });
                }
                // Soul wisp ascending to sky
                STATE.particles.push({
                    x: deathCenterX,
                    y: deathCenterY,
                    vx: 0,
                    vy: -2.8,
                    color: '#ffffff',
                    size: 6,
                    life: 45
                });
            }
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
                ghostHp: serverChamp.hp,
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
            const tarCenterX = targetChamp.pixelX + tarSize.w / 2;
            const tarCenterY = targetChamp.pixelY + tarSize.h / 2;

            // Automatically convert duration into animation frames (60 FPS)
            let fxLife = 30; // Default 0.5s for burst skill
            if (event.duration && event.duration > 0) {
                fxLife = Math.round(event.duration * 60);
            }

            if (event.skill_type === 'ricochet') {
                STATE.hitEffects.push({
                    x: 0, y: 0,
                    effectType: 'ricochet_chain',
                    path: event.bounce_path || [targetChamp.id],
                    casterId: caster.id,
                    lifeTime: 30, maxLife: 30
                });
            } else {
                STATE.hitEffects.push({
                    x: tarCenterX,
                    y: tarCenterY,
                    lifeTime: fxLife,
                    maxLife: fxLife,
                    effectType: event.skill_type,
                    radius: event.radius || 1.5
                });
            }

            // Cinematic visual triggers & floating text for skills
            if (event.skill_type === 'damage') {
                if (target) target.shakeTimer = 30;
                STATE.screenShake = Math.max(STATE.screenShake || 0, 7);
                if (event.power) {
                    spawnFloatingText(tarCenterX, tarCenterY - 20, `💥 -${event.power.toLocaleString()}`, 'skill', { color: '#ffa502', scale: 1.4 });
                }
            } else if (event.skill_type === 'execute') {
                if (target) target.shakeTimer = 40;
                STATE.screenShake = Math.max(STATE.screenShake || 0, 12);
                STATE.screenFlash = { color: 'rgba(231, 76, 60, 0.45)', alpha: 1.0, decay: 0.04 };
                spawnFloatingText(tarCenterX, tarCenterY - 25, '☠️ EXECUTED!', 'status', { color: '#ff4757', scale: 1.5 });
            } else if (event.skill_type === 'time_stop') {
                STATE.screenShake = Math.max(STATE.screenShake || 0, 14);
                STATE.screenFlash = { color: 'rgba(255, 255, 255, 0.5)', alpha: 1.0, decay: 0.035 };
                spawnFloatingText(tarCenterX, tarCenterY - 30, '⏳ TIME STOP!', 'status', { color: '#ffffff', glowColor: '#00ffff', scale: 1.5 });
            } else if (event.skill_type === 'return_to_zero') {
                STATE.screenShake = Math.max(STATE.screenShake || 0, 16);
                STATE.screenFlash = { color: 'rgba(255, 215, 0, 0.5)', alpha: 1.0, decay: 0.03 };
                spawnFloatingText(tarCenterX, tarCenterY - 30, '✨ RETURN TO ZERO!', 'status', { color: '#ffd700', glowColor: '#f39c12', scale: 1.6 });
            } else if (['heal', 'aoe_heal', 'regen'].includes(event.skill_type)) {
                const healVal = event.power ? `+${event.power.toLocaleString()}` : '+HP';
                spawnFloatingText(tarCenterX, tarCenterY - 20, `💚 ${healVal}`, 'heal');
            } else if (event.skill_type === 'stun') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '⚡ STUNNED!', 'status', { color: '#ffd32a' });
            } else if (event.skill_type === 'hp_shield') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '🛡️ SHIELD!', 'shield');
            } else if (event.skill_type === 'polymorph') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '🐌 POLYMORPH!', 'status', { color: '#a29bfe' });
            } else if (event.skill_type === 'mind_control') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '💔 CHARMED!', 'status', { color: '#ff6b81' });
            } else if (event.skill_type === 'banish') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '🌀 BANISHED!', 'status', { color: '#70a1ff' });
            } else if (event.skill_type === 'blink_strike') {
                STATE.screenShake = Math.max(STATE.screenShake || 0, 6);
                const dmgStr = event.power ? `⚡ -${event.power.toLocaleString()}` : '⚡ BLINK STRIKE';
                spawnFloatingText(tarCenterX, tarCenterY - 20, dmgStr, 'crit');
            }
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
                damage: event.damage || 0,
                type: isRanged ? 'projectile' : 'melee',
                speed: isRanged ? 16 : 0,
                lifeTime: isRanged ? 0 : 15
            });
        }
        else if (['evasion', 'reflect', 'damage_link_proc', 'revive'].includes(event.type)) {
            const target = STATE.champions.find(c => c.id === event.targetId || c.id === event.target_id);
            if (!target) return;
            const tarSize = getCanvasCoords(target.targetX, target.targetY);
            const tarCenterX = target.pixelX + tarSize.w / 2;
            const tarCenterY = target.pixelY + tarSize.h / 2;

            STATE.hitEffects.push({
                x: tarCenterX,
                y: tarCenterY,
                lifeTime: 30,
                maxLife: 30,
                effectType: event.type,
                damage: event.damage
            });

            if (event.type === 'evasion') {
                spawnFloatingText(tarCenterX, tarCenterY - 20, 'MISS!', 'status', { color: '#ced6e0', scale: 1.1 });
            } else if (event.type === 'reflect') {
                spawnFloatingText(tarCenterX, tarCenterY - 20, `💥 REFLECT -${Math.round(event.damage || 0).toLocaleString()}`, 'skill', { color: '#9b59b6' });
            } else if (event.type === 'revive') {
                STATE.screenFlash = { color: 'rgba(241, 196, 15, 0.45)', alpha: 1.0, decay: 0.035 };
                spawnFloatingText(tarCenterX, tarCenterY - 30, '🌟 REVIVED!', 'status', { color: '#ffd700', scale: 1.4 });
            }
        }
    });
}

export function handleCombatEnd(serverResult) {
    if (!STATE.isCombatPhase) return;

    // --- 1. USE SERVER REFEREE RESULT ---
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

    // --- 2. CHECK 10-POINT WIN CONDITION ---
    if (STATE.playerLP >= 10 || STATE.botLP >= 10) {
        stopPrepTimer();
        const bottomBar = document.getElementById('bottomBar');
        if (bottomBar) bottomBar.style.display = 'none';

        const isWinner = STATE.playerLP >= 10;
        const resultMsg = isWinner ? "🏆 YOU WON THE MATCH! 🏆" : "💀 YOU LOST THE MATCH! 💀";

        // Create full-screen game over overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0'; overlay.style.left = '0';
        overlay.style.width = '100vw'; overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.85)'; // 85% opacity dark backdrop
        overlay.style.color = isWinner ? '#f1c40f' : '#e74c3c';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '9999'; // High z-index overlay

        overlay.innerHTML = `
            <h1 style="font-size: 70px; margin-bottom: 20px; text-shadow: 0 0 20px ${isWinner ? '#f1c40f' : '#e74c3c'};">${resultMsg}</h1>
            <p style="font-size: 30px; color: white; margin-bottom: 50px;">Final Score: <span style="color:#2ecc71">${STATE.playerLP}</span> - <span style="color:#e74c3c">${STATE.botLP}</span></p>
            <button id="restartBtn" style="padding: 15px 40px; font-size: 24px; font-weight: bold; cursor: pointer; background: #3498db; color: #fff; border: none; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">FIND NEW MATCH</button>
        `;
        document.body.appendChild(overlay);

        // Play again button handler (Save name -> Reload)
        document.getElementById('restartBtn').addEventListener('click', () => {
            // 1. Read current player name
            const nameInput = document.getElementById('playerNameInput');
            const currentPlayerName = nameInput && nameInput.value.trim() !== "" ? nameInput.value : "Player1";

            // 2. Save auto-find match preference to session storage
            sessionStorage.setItem('savedPlayerName', currentPlayerName);
            sessionStorage.setItem('autoFindMatch', 'true');

            // 3. Reload game page
            window.location.reload();
        });

    } else {
        // --- 3. Continue to next round ---
        STATE.currentRound++;
        updateRoundUI();

        // FIX: Capped income formula — base increases per round but caps at 35 gold.
        // Old formula (round * 5 + 5) caused runaway snowballing late game.
        const rawIncome  = STATE.currentRound * 3 + 5;
        const baseIncome = Math.min(rawIncome, 35);
        updateGold(baseIncome);
        showNotification(`Round ${STATE.currentRound} Start: +${baseIncome} Gold`);

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
    // Keep only the player's own units (have originalX set)
    STATE.champions = STATE.champions.filter(c => c.originalX !== undefined);
    STATE.champions.forEach(champ => {
        champ.hp       = champ.max_hp;
        champ.mana     = 0;
        champ.shield   = 0;
        champ.is_alive = true;
        champ.team     = 'Team1'; // Restore from mind_control / soul_swap

        // FIX: Reset attack and speed to base values so buff leakage does not carry into next round
        if (champ.base_attack !== undefined) champ.attack = champ.base_attack;
        if (champ.base_speed  !== undefined) champ.speed  = champ.base_speed;

        champ.buffs        = [];
        champ.buff_details = [];

        if (champ.originalX !== undefined && champ.originalY !== undefined) {
            champ.targetX = champ.originalX;
            champ.targetY = champ.originalY;
        }
        champ.shakeTimer = 0;
    });

    STATE.activeProjectiles = [];
    STATE.hitEffects        = [];
}
export function updateRoundUI() {
    const roundText = document.getElementById('roundText');
    if (roundText) roundText.innerText = STATE.currentRound;
}

export function updateLpUI() {
    const playerText = document.getElementById('playerLpText');
    const botText = document.getElementById('botLpText');
    if (playerText && botText) {
        // Display score format: current / 10
        playerText.innerText = `${STATE.playerLP}/10`;
        botText.innerText = `${STATE.botLP}/10`;
    }
}