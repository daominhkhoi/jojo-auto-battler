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
    let font = 'bold 19px "Segoe UI", Arial, sans-serif';

    switch (type) {
        case 'crit':
            color = '#ff3838';
            baseScale = 1.45;
            font = '900 24px "Segoe UI", Arial, sans-serif';
            break;
        case 'skill':
            color = '#ffa502';
            baseScale = 1.35;
            font = 'bold 22px "Segoe UI", Arial, sans-serif';
            break;
        case 'heal':
            color = '#2ecc71';
            baseScale = 1.2;
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
            font = '900 21px "Segoe UI", Arial, sans-serif';
            break;
        case 'reflect':
            color = '#e056fd';
            baseScale = 1.15;
            font = '900 18px "Segoe UI", Arial, sans-serif';
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

    // Strict cap to avoid performance death when many units attack simultaneously
    if (STATE.floatingTexts.length >= 14) {
        STATE.floatingTexts.shift();
    }

    STATE.floatingTexts.push({
        x: startX,
        y: startY,
        vx: (Math.random() - 0.5) * 0.7,
        vy: 2.2,
        text: text,
        color: color,
        life: 35,
        maxLife: 35,
        baseScale: baseScale,
        scale: baseScale * 1.35,
        scaleProgress: 0,
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
        if (champ.hitFlashTimer > 0) champ.hitFlashTimer--;

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
            if (proj.lifeTime === 5) {
                const target = STATE.champions.find(c => c.id === proj.targetId);
                const isCrit = proj.isCrit || (proj.damage && proj.damage >= 12000);
                if (target) {
                    target.shakeTimer = 8;
                    target.hitFlashTimer = 3;
                    const dmg = proj.damage || 0;
                    if (dmg > 0) {
                        spawnFloatingText(proj.targetX, proj.targetY, (isCrit ? `💥 CRIT! -${dmg.toLocaleString()}` : `-${dmg.toLocaleString()}`), isCrit ? 'crit' : 'normal');
                        if (isCrit) {
                            const now = performance.now();
                            if (!STATE._lastCritShake || (now - STATE._lastCritShake > 160)) {
                                STATE.screenShake = Math.max(STATE.screenShake || 0, 3.5);
                                STATE._lastCritShake = now;
                            }
                        }
                    }
                }
                STATE.hitEffects.push({
                    x: proj.targetX,
                    y: proj.targetY,
                    lifeTime: 8,
                    maxLife: 8,
                    effectType: 'attack_hit',
                    hitType: 'melee',
                    isCrit: isCrit,
                    angle: proj.angle || 0
                });

                // Spawn 4 directional sparks (velocity-oriented)
                if (!STATE.particles) STATE.particles = [];
                const sparkColor = isCrit ? '#ffd700' : '#ff4757';
                for (let p = 0; p < 4; p++) {
                    const spd = Math.random() * 9 + 4;
                    const sparkAngle = (proj.angle || 0) + (Math.random() - 0.5) * 1.5;
                    STATE.particles.push({
                        x: proj.targetX, y: proj.targetY,
                        vx: Math.cos(sparkAngle) * spd, vy: Math.sin(sparkAngle) * spd,
                        color: Math.random() < 0.4 ? '#ffffff' : sparkColor,
                        size: Math.random() * 2 + 1.5,
                        life: 10 + Math.random() * 4
                    });
                }
            }
            if (proj.lifeTime <= 0) STATE.activeProjectiles.splice(i, 1);
        } else {
            const dx = proj.targetX - proj.x;
            const dy = proj.targetY - proj.y;
            const dist = Math.hypot(dx, dy);

            if (dist < proj.speed) {
                const target = STATE.champions.find(c => c.id === proj.targetId);
                const isCrit = proj.isCrit || (proj.damage && proj.damage >= 12000);
                if (target) {
                    target.shakeTimer = 8;
                    target.hitFlashTimer = 3;
                    const dmg = proj.damage || 0;
                    if (dmg > 0) {
                        spawnFloatingText(proj.targetX, proj.targetY, (isCrit ? `💥 CRIT! -${dmg.toLocaleString()}` : `-${dmg.toLocaleString()}`), isCrit ? 'crit' : 'normal');
                        if (isCrit) {
                            const now = performance.now();
                            if (!STATE._lastCritShake || (now - STATE._lastCritShake > 160)) {
                                STATE.screenShake = Math.max(STATE.screenShake || 0, 3.5);
                                STATE._lastCritShake = now;
                            }
                        }
                    }
                }

                STATE.hitEffects.push({
                    x: proj.targetX,
                    y: proj.targetY,
                    lifeTime: 8,
                    maxLife: 8,
                    effectType: 'attack_hit',
                    hitType: 'ranged',
                    isCrit: isCrit,
                    angle: proj.angle || 0
                });
                STATE.activeProjectiles.splice(i, 1);

                // Spawn 4 impact sparks
                if (!STATE.particles) STATE.particles = [];
                const sparkColor = isCrit ? '#ffd700' : '#00ffff';
                for (let p = 0; p < 4; p++) {
                    const spd = Math.random() * 9 + 4;
                    const sparkAngle = Math.random() * Math.PI * 2;
                    STATE.particles.push({
                        x: proj.targetX, y: proj.targetY,
                        vx: Math.cos(sparkAngle) * spd, vy: Math.sin(sparkAngle) * spd,
                        color: Math.random() < 0.4 ? '#ffffff' : sparkColor,
                        size: Math.random() * 2 + 1.5,
                        life: 10 + Math.random() * 4
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
    if (STATE.hitEffects.length > 15) {
        STATE.hitEffects.splice(0, STATE.hitEffects.length - 15);
    }

    if (!STATE.particles) STATE.particles = [];
    for (let i = STATE.particles.length - 1; i >= 0; i--) {
        const p = STATE.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life--;
        if (p.life <= 0) STATE.particles.splice(i, 1);
    }
    if (STATE.particles.length > 40) {
        STATE.particles.splice(0, STATE.particles.length - 40);
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
    if (data.your_team) {
        STATE.myTeam = data.your_team;
    }
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
            localChamp.max_hp = serverChamp.max_hp !== undefined ? serverChamp.max_hp : localChamp.max_hp;
            localChamp.raw_hp = serverChamp.raw_hp !== undefined ? serverChamp.raw_hp : localChamp.raw_hp;
            localChamp.attack = serverChamp.attack !== undefined ? serverChamp.attack : localChamp.attack;
            localChamp.base_attack = serverChamp.base_attack !== undefined ? serverChamp.base_attack : localChamp.base_attack;
            localChamp.raw_attack = serverChamp.raw_attack !== undefined ? serverChamp.raw_attack : localChamp.raw_attack;
            localChamp.speed = serverChamp.speed !== undefined ? serverChamp.speed : localChamp.speed;
            localChamp.base_speed = serverChamp.base_speed !== undefined ? serverChamp.base_speed : localChamp.base_speed;
            localChamp.raw_speed = serverChamp.raw_speed !== undefined ? serverChamp.raw_speed : localChamp.raw_speed;
            localChamp.attack_range = serverChamp.attack_range !== undefined ? serverChamp.attack_range : localChamp.attack_range;
            localChamp.raw_range = serverChamp.raw_range !== undefined ? serverChamp.raw_range : localChamp.raw_range;
            localChamp.max_mana = serverChamp.max_mana !== undefined ? serverChamp.max_mana : localChamp.max_mana;
            localChamp.is_alive = serverChamp.is_alive;
            localChamp.team = serverChamp.team;
            localChamp.skill = serverChamp.skill || localChamp.skill;
            localChamp.raw_skill = serverChamp.raw_skill || localChamp.raw_skill;
            localChamp.applied_traits = serverChamp.applied_traits || localChamp.applied_traits || [];
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
                raw_hp: serverChamp.raw_hp !== undefined ? serverChamp.raw_hp : serverChamp.max_hp,
                ghostHp: serverChamp.hp,
                mana: serverChamp.mana,
                max_mana: serverChamp.max_mana,
                shield: serverChamp.shield || 0,
                attack: serverChamp.attack !== undefined ? serverChamp.attack : template.attack,
                base_attack: serverChamp.base_attack !== undefined ? serverChamp.base_attack : (template.attack || 0),
                raw_attack: serverChamp.raw_attack !== undefined ? serverChamp.raw_attack : (serverChamp.base_attack || template.attack || 0),
                speed: serverChamp.speed !== undefined ? serverChamp.speed : template.speed,
                base_speed: serverChamp.base_speed !== undefined ? serverChamp.base_speed : (template.speed || 1.0),
                raw_speed: serverChamp.raw_speed !== undefined ? serverChamp.raw_speed : (template.speed || 1.0),
                attack_range: serverChamp.attack_range || template.attack_range,
                raw_range: serverChamp.raw_range !== undefined ? serverChamp.raw_range : (template.attack_range || 1.0),
                is_alive: serverChamp.is_alive,
                shakeTimer: 0,
                skill: serverChamp.skill || template.skill,
                raw_skill: serverChamp.raw_skill || template.skill,
                applied_traits: serverChamp.applied_traits || [],
                buffs: serverChamp.buffs || [],
                buff_details: serverChamp.buff_details || []
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
            const tarCenterX = (targetChamp.pixelX !== undefined ? targetChamp.pixelX : tarSize.x) + tarSize.w / 2;
            const tarCenterY = (targetChamp.pixelY !== undefined ? targetChamp.pixelY : tarSize.y) + tarSize.h / 2;

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
            } else if (event.skill_type === 'stat_steal') {
                STATE.hitEffects.push({
                    x: 0, y: 0,
                    effectType: 'stat_steal',
                    casterId: caster.id,
                    targetId: targetChamp.id,
                    power: event.power || 0,
                    lifeTime: Math.min(fxLife, 50),
                    maxLife: Math.min(fxLife, 50)
                });
            } else {
                const isShortFx = ['buff_atk', 'speed_buff', 'heal', 'damage'].includes(event.skill_type);
                const lifeSpan = isShortFx ? 36 : (event.skill_type === 'dot' ? 45 : fxLife);
                STATE.hitEffects.push({
                    x: tarCenterX,
                    y: tarCenterY,
                    targetId: targetChamp ? targetChamp.id : null,
                    casterId: caster.id,
                    lifeTime: lifeSpan,
                    maxLife: lifeSpan,
                    effectType: event.skill_type,
                    radius: event.radius || 1.5,
                    power: event.power || 0
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
            } else if (event.skill_type === 'buff_atk') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, `⚔️ +${event.power ? event.power.toLocaleString() : 'ATK'}!`, 'status', { color: '#f39c12', scale: 1.4 });
            } else if (event.skill_type === 'speed_buff') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, `⚡ +${event.power || 'SPD'}%!`, 'status', { color: '#00d2d3', scale: 1.4 });
            } else if (event.skill_type === 'dot') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, `☣️ POISONED!`, 'status', { color: '#a55eea', scale: 1.3 });
            } else if (event.skill_type === 'stun') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '⚡ STUNNED!', 'status', { color: '#ffd32a' });
            } else if (event.skill_type === 'mana_lock') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '🔒 SILENCED!', 'status', { color: '#e74c3c' });
            } else if (event.skill_type === 'hp_shield') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '🛡️ SHIELD!', 'shield');
            } else if (event.skill_type === 'polymorph') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '🐌 POLYMORPH!', 'status', { color: '#a29bfe' });
            } else if (event.skill_type === 'mind_control') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '💔 CHARMED!', 'status', { color: '#ff6b81' });
            } else if (event.skill_type === 'banish') {
                spawnFloatingText(tarCenterX, tarCenterY - 25, '🌀 BANISHED!', 'status', { color: '#70a1ff' });
            } else if (event.skill_type === 'pull') {
                if (target) {
                    target.shakeTimer = 35;
                    target.hitFlashTimer = 3;
                }
                STATE.screenShake = Math.max(STATE.screenShake || 0, 8);
                spawnFloatingText(tarCenterX, tarCenterY - 25, '🌀 PULLED!', 'status', { color: '#00d2d3', scale: 1.4 });
                if (event.power) {
                    spawnFloatingText(tarCenterX, tarCenterY - 50, `💥 -${event.power.toLocaleString()}`, 'skill', { color: '#ff4757', scale: 1.3 });
                }
            } else if (event.skill_type === 'stat_steal') {
                if (target) target.shakeTimer = 25;
                STATE.screenShake = Math.max(STATE.screenShake || 0, 7);
                const casSize = getCanvasCoords(caster.targetX, caster.targetY);
                const casCenterX = (caster.pixelX !== undefined ? caster.pixelX : casSize.x) + casSize.w / 2;
                const casCenterY = (caster.pixelY !== undefined ? caster.pixelY : casSize.y) + casSize.h / 2;
                const stealPwr = event.power ? event.power.toLocaleString() : 'ATK';

                // Floating text on Target (drained)
                spawnFloatingText(tarCenterX, tarCenterY - 20, `🔻 -${stealPwr} ATK`, 'status', { color: '#ff4757', glowColor: '#c0392b', scale: 1.4 });
                spawnFloatingText(tarCenterX, tarCenterY - 45, 'DRAINED!', 'status', { color: '#ff6b81', glowColor: '#962d22', scale: 1.15 });

                // Floating text on Caster (buffed)
                spawnFloatingText(casCenterX, casCenterY - 20, `🔺 +${stealPwr} ATK`, 'status', { color: '#f1c40f', glowColor: '#9b59b6', scale: 1.45 });
                spawnFloatingText(casCenterX, casCenterY - 45, '⚡ STOLEN!', 'status', { color: '#e056fd', glowColor: '#be2edd', scale: 1.2 });

                // Spawn energy stream particles from target to caster
                if (!STATE.particles) STATE.particles = [];
                for (let p = 0; p < 15; p++) {
                    const angle = Math.atan2(casCenterY - tarCenterY, casCenterX - tarCenterX) + (Math.random() - 0.5) * 0.7;
                    const spd = Math.random() * 8 + 3;
                    STATE.particles.push({
                        x: tarCenterX, y: tarCenterY,
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        color: Math.random() < 0.5 ? '#9b59b6' : '#e74c3c',
                        size: Math.random() * 4 + 2,
                        life: 25 + Math.random() * 15
                    });
                }
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
            const attCenterX = attacker.pixelX + attSize.w / 2;
            const attCenterY = attacker.pixelY + attSize.h / 2;
            const tarCenterX = target.pixelX + tarSize.w / 2;
            const tarCenterY = target.pixelY + tarSize.h / 2;

            const isRanged = attacker.attack_range > 1.5;
            const angle = Math.atan2(tarCenterY - attCenterY, tarCenterX - attCenterX);
            const dmg = event.damage || 0;
            const isCrit = event.is_crit || dmg >= 12000 || (attacker.raw_attack && dmg >= attacker.raw_attack * 1.6);

            STATE.activeProjectiles.push({
                x: attCenterX,
                y: attCenterY,
                startX: attCenterX,
                startY: attCenterY,
                targetX: tarCenterX,
                targetY: tarCenterY,
                targetId: event.targetId,
                damage: dmg,
                isCrit: isCrit,
                angle: angle,
                type: isRanged ? 'projectile' : 'melee',
                speed: isRanged ? 22 : 0,
                lifeTime: isRanged ? 0 : 10,
                maxLife: isRanged ? 0 : 10
            });
        }
        else if (['evasion', 'reflect', 'damage_link_proc', 'revive'].includes(event.type)) {
            const target = STATE.champions.find(c => c.id === event.targetId || c.id === event.target_id);
            if (!target) return;
            const tarSize = getCanvasCoords(target.targetX, target.targetY);
            const tarCenterX = target.pixelX + tarSize.w / 2;
            const tarCenterY = target.pixelY + tarSize.h / 2;

            if (event.type === 'reflect') {
                const now = Date.now();
                if (!STATE.lastReflectText) STATE.lastReflectText = {};
                const lastTime = STATE.lastReflectText[target.id] || 0;

                // Throttle reflect text to at most 1 per 250ms per champion
                if (now - lastTime > 250) {
                    STATE.lastReflectText[target.id] = now;
                    spawnFloatingText(tarCenterX, tarCenterY - 20, `💥 -${Math.round(event.damage || 0).toLocaleString()}`, 'reflect');
                }

                // Snappy 8-frame Crystal Ricochet Spark (0.13s)
                STATE.hitEffects.push({
                    x: tarCenterX,
                    y: tarCenterY,
                    lifeTime: 8,
                    maxLife: 8,
                    effectType: 'reflect',
                    damage: event.damage
                });
            } else {
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
                } else if (event.type === 'revive') {
                    STATE.screenFlash = { color: 'rgba(241, 196, 15, 0.45)', alpha: 1.0, decay: 0.035 };
                    spawnFloatingText(tarCenterX, tarCenterY - 30, '🌟 REVIVED!', 'status', { color: '#ffd700', scale: 1.4 });
                }
            }
        } else if (event.type === 'mana_refund') {
            const target = STATE.champions.find(c => c.id === event.target_id || c.id === event.targetId);
            if (target) {
                const tarSize = getCanvasCoords(target.targetX, target.targetY);
                const tarCenterX = (target.pixelX !== undefined ? target.pixelX : tarSize.x) + tarSize.w / 2;
                const tarCenterY = (target.pixelY !== undefined ? target.pixelY : tarSize.y) + tarSize.h / 2;
                spawnFloatingText(tarCenterX, tarCenterY - 35, `💧 +${event.percent}% MANA!`, 'status', { color: '#00d2d3', scale: 1.3 });
            }
        } else if (event.type === 'aoe_damage_hit') {
            const target = STATE.champions.find(c => c.id === event.target_id || c.id === event.targetId);
            if (target) {
                target.shakeTimer = 25;
                const tarSize = getCanvasCoords(target.targetX, target.targetY);
                const tarCenterX = (target.pixelX !== undefined ? target.pixelX : tarSize.x) + tarSize.w / 2;
                const tarCenterY = (target.pixelY !== undefined ? target.pixelY : tarSize.y) + tarSize.h / 2;
                if (event.damage && event.damage > 0) {
                    spawnFloatingText(tarCenterX, tarCenterY - 20, `💥 -${Math.round(event.damage).toLocaleString()}`, 'skill', { color: '#ffd700', scale: 1.35 });
                }
            }
        } else if (event.type === 'double_cast_charge') {
            const caster = STATE.champions.find(c => c.id === event.casterId || c.id === event.caster_id);
            if (caster) {
                const casSize = getCanvasCoords(caster.targetX, caster.targetY);
                const casCenterX = (caster.pixelX !== undefined ? caster.pixelX : casSize.x) + casSize.w / 2;
                const casCenterY = (caster.pixelY !== undefined ? caster.pixelY : casSize.y) + casSize.h / 2;
                spawnFloatingText(casCenterX, casCenterY - 45, '⚡ DOUBLE CAST READY!', 'status', { color: '#f1c40f', scale: 1.25 });
                if (!STATE.particles) STATE.particles = [];
                for (let p = 0; p < 14; p++) {
                    const angle = Math.random() * Math.PI * 2;
                    const spd = Math.random() * 4 + 1.5;
                    STATE.particles.push({
                        x: casCenterX,
                        y: casCenterY,
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        color: '#f39c12',
                        size: Math.random() * 3 + 2,
                        life: 25
                    });
                }
            }
        } else if (event.type === 'double_cast') {
            const caster = STATE.champions.find(c => c.id === event.casterId || c.id === event.caster_id);
            if (caster) {
                const casSize = getCanvasCoords(caster.targetX, caster.targetY);
                const casCenterX = (caster.pixelX !== undefined ? caster.pixelX : casSize.x) + casSize.w / 2;
                const casCenterY = (caster.pixelY !== undefined ? caster.pixelY : casSize.y) + casSize.h / 2;
                spawnFloatingText(casCenterX, casCenterY - 50, '✨ DOUBLE CAST!', 'status', { color: '#ffd700', glowColor: '#e67e22', scale: 1.6 });
            }
        }
    });
}

let roundReviewInterval = null;

export function cancelRoundReview() {
    if (roundReviewInterval) {
        clearInterval(roundReviewInterval);
        roundReviewInterval = null;
    }
    hideRoundReviewBanner();
    STATE.isRoundReview = false;
    STATE.roundWinner = null;
}

function showRoundReviewBanner(title, subtitle, color, secondsLeft) {
    let banner = document.getElementById('roundReviewBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'roundReviewBanner';
        banner.style.position = 'fixed';
        banner.style.top = '10%';
        banner.style.left = '50%';
        banner.style.transform = 'translateX(-50%)';
        banner.style.zIndex = '9999';
        banner.style.pointerEvents = 'none';
        banner.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        document.body.appendChild(banner);
    }

    banner.innerHTML = `
        <div style="background: rgba(13, 17, 23, 0.94); border: 2px solid ${color}; border-radius: 14px; padding: 16px 36px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.85), 0 0 25px ${color}55; backdrop-filter: blur(10px); min-width: 280px; max-width: 90vw;">
            <div style="font-size: 28px; font-weight: 900; color: ${color}; text-shadow: 0 0 16px ${color}; letter-spacing: 1px; margin-bottom: 4px;">${title}</div>
            <div style="font-size: 15px; color: #ecf0f1; font-weight: 500; margin-bottom: 10px; opacity: 0.9;">${subtitle}</div>
            <div id="roundReviewTimerBadge" style="display: inline-block; background: rgba(255,255,255,0.12); color: #fff; font-size: 13px; font-weight: bold; padding: 4px 14px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.25);">
                ⏳ Reviewing battlefield... Next in <span id="roundReviewCountdownNum" style="color: ${color}; font-size: 16px; font-weight: 900;">${secondsLeft}s</span>
            </div>
        </div>
    `;
    banner.style.display = 'block';
    banner.style.opacity = '1';
    banner.style.transform = 'translateX(-50%) scale(1)';
}

function updateRoundReviewCountdown(secondsLeft) {
    const numEl = document.getElementById('roundReviewCountdownNum');
    if (numEl) {
        numEl.innerText = `${secondsLeft}s`;
    }
}

function hideRoundReviewBanner() {
    const banner = document.getElementById('roundReviewBanner');
    if (banner) {
        banner.style.opacity = '0';
        banner.style.transform = 'translateX(-50%) scale(0.95)';
        setTimeout(() => {
            if (banner) banner.style.display = 'none';
        }, 300);
    }
}

export function handleCombatEnd(serverResult) {
    cancelRoundReview();

    const res = typeof serverResult === 'object' ? serverResult.result : serverResult;
    const winner = typeof serverResult === 'object' ? serverResult.winner : (res === 'win' ? 'Team1' : (res === 'loss' ? 'Team2' : 'draw'));

    STATE.isCombatPhase = false;
    STATE.isRoundReview = true;
    STATE.roundWinner = winner;

    if (STATE.isBotVsBot) {
        if (typeof serverResult === 'object' && serverResult.p1_lp !== undefined) {
            STATE.playerLP = serverResult.p1_lp;
            STATE.botLP = serverResult.p2_lp;
        } else {
            if (winner === 'Team1') STATE.playerLP += 1;
            else if (winner === 'Team2') STATE.botLP += 1;
        }

        const bot1 = STATE.bot1Name || 'Bot 1';
        const bot2 = STATE.bot2Name || 'Bot 2';
        let title = "⚔️ ROUND DRAW!";
        let subtitle = `Both bots fought to a draw (${STATE.playerLP} - ${STATE.botLP})`;
        let color = "#f39c12";

        if (winner === 'Team1') {
            title = `🏆 ${bot1.toUpperCase()} WINS ROUND!`;
            subtitle = `${bot1} won this round (${STATE.playerLP} - ${STATE.botLP})`;
            color = "#2ecc71";
            showNotification(`🏆 ${bot1} wins this round!`, "success");
        } else if (winner === 'Team2') {
            title = `🏆 ${bot2.toUpperCase()} WINS ROUND!`;
            subtitle = `${bot2} won this round (${STATE.playerLP} - ${STATE.botLP})`;
            color = "#e74c3c";
            showNotification(`🏆 ${bot2} wins this round!`, "success");
        } else {
            showNotification("TIME UP! Round Draw between both bots!", "info");
        }

        updateLpUI();

        const bvbTimer = document.getElementById('bvbTimerText');
        if (bvbTimer) {
            bvbTimer.style.display = 'inline-block';
            bvbTimer.innerText = "⏳ ROUND OVER (Review: 5s)...";
        }

        showRoundReviewBanner(title, subtitle, color, 5);

        let secondsLeft = 5;
        roundReviewInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0) {
                updateRoundReviewCountdown(secondsLeft);
                if (bvbTimer) {
                    bvbTimer.innerText = `⏳ ROUND OVER (Review: ${secondsLeft}s)...`;
                }
            } else {
                clearInterval(roundReviewInterval);
                roundReviewInterval = null;
                finishRoundReview(serverResult);
            }
        }, 1000);
        return;
    }

    // --- NORMAL GAME (PvP / PvE with Bot) ---
    if (res === 'draw') {
        showNotification("TIME UP! IT'S A DRAW! No points awarded.", "info");
    } else if (res === 'win') {
        STATE.playerLP += 1;
        showNotification("Victory! You won this round!", "success");
    } else if (res === 'loss') {
        STATE.botLP += 1;
        showNotification("Defeat! Opponent won this round!", "error");
    }
    updateLpUI();

    let title = "⚔️ ROUND DRAW!";
    let subtitle = "Time up! No points awarded.";
    let color = "#f39c12";

    if (res === 'win') {
        title = "🏆 ROUND VICTORY!";
        subtitle = `You won this round (${STATE.playerLP} - ${STATE.botLP})`;
        color = "#2ecc71";
    } else if (res === 'loss') {
        title = "💀 ROUND DEFEAT!";
        subtitle = `Opponent won this round (${STATE.playerLP} - ${STATE.botLP})`;
        color = "#e74c3c";
    }

    showRoundReviewBanner(title, subtitle, color, 5);

    let secondsLeft = 5;
    roundReviewInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
            updateRoundReviewCountdown(secondsLeft);
        } else {
            clearInterval(roundReviewInterval);
            roundReviewInterval = null;
            finishRoundReview(serverResult);
        }
    }, 1000);
}

function finishRoundReview(serverResult) {
    STATE.isRoundReview = false;
    STATE.roundWinner = null;
    hideRoundReviewBanner();

    resetBoardForNextRound();

    if (STATE.isBotVsBot) {
        const bvbTimer = document.getElementById('bvbTimerText');
        if (bvbTimer) {
            bvbTimer.innerText = "⏳ PREPARING NEXT ROUND...";
        }
        return;
    }

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
        overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
        overlay.style.color = isWinner ? '#f1c40f' : '#e74c3c';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '9999';

        overlay.innerHTML = `
            <div style="background: rgba(20, 24, 33, 0.95); border: 2px solid ${isWinner ? '#f1c40f' : '#e74c3c'}; border-radius: 16px; padding: 40px 50px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.8); max-width: 90%;">
                <h1 style="font-size: 52px; margin: 0 0 15px 0; font-weight: 900; text-shadow: 0 0 25px ${isWinner ? '#f1c40f' : '#e74c3c'};">${resultMsg}</h1>
                <p style="font-size: 24px; color: #ecf0f1; margin: 0 0 35px 0;">Final Score: <span style="color:#2ecc71; font-weight:800;">${STATE.playerLP}</span> - <span style="color:#e74c3c; font-weight:800;">${STATE.botLP}</span></p>
                
                <div style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">
                    <button id="returnLobbyBtn" style="padding: 14px 32px; font-size: 18px; font-weight: bold; cursor: pointer; background: linear-gradient(135deg, #2c3e50, #34495e); color: #fff; border: 1px solid #7f8c8d; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.4);">
                        🏠 VỀ SẢNH CHÍNH
                    </button>
                    <button id="rematchBotBtn" style="padding: 14px 32px; font-size: 18px; font-weight: bold; cursor: pointer; background: linear-gradient(135deg, #8e44ad, #9b59b6); color: #fff; border: 1px solid #a29bfe; border-radius: 10px; box-shadow: 0 4px 15px rgba(142, 68, 173, 0.4);">
                        🤖 CHƠI TIẾP VỚI BOT
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const saveCurrentName = () => {
            const nameInput = document.getElementById('playerNameInput');
            const currentName = nameInput && nameInput.value.trim() !== "" ? nameInput.value.trim() : "Player";
            try { localStorage.setItem('savedPlayerName', currentName); } catch (e) { }
        };

        // 1. Về sảnh chính (giữ nguyên tên, dừng lại ở sảnh chờ để người chơi tự chọn)
        document.getElementById('returnLobbyBtn').addEventListener('click', () => {
            saveCurrentName();
            sessionStorage.removeItem('autoFindMatch');
            sessionStorage.removeItem('autoPlayBot');
            window.location.reload();
        });

        // 2. Chơi tiếp với bot ngay lập tức
        document.getElementById('rematchBotBtn').addEventListener('click', () => {
            saveCurrentName();
            sessionStorage.removeItem('autoFindMatch');
            sessionStorage.setItem('autoPlayBot', 'true');
            window.location.reload();
        });

    } else {
        // --- 3. Continue to next round ---
        STATE.currentRound++;
        updateRoundUI();

        // FIX: Capped income formula — base increases per round but caps at 35 gold.
        // Old formula (round * 5 + 5) caused runaway snowballing late game.
        const rawIncome = STATE.currentRound * 3 + 5;
        const baseIncome = Math.min(rawIncome, 35);
        updateGold(baseIncome);
        showNotification(`Round ${STATE.currentRound} Start: +${baseIncome} Gold`);

        if (findBtn) findBtn.style.display = 'none';
        if (readyBtn) {
            readyBtn.style.display = 'inline-block';
            readyBtn.innerText = "READY";
            readyBtn.style.backgroundColor = "#2ecc71";
            readyBtn.disabled = false;
            readyBtn.classList.remove('active');
        }
        startPrepTimer();
    }
}

function resetBoardForNextRound() {
    if (STATE.isBotVsBot) {
        STATE.champions = [];
        STATE.activeProjectiles = [];
        STATE.hitEffects = [];
        return;
    }

    // Keep only the player's own units (have originalX set)
    STATE.champions = STATE.champions.filter(c => c.originalX !== undefined);
    STATE.champions.forEach(champ => {
        if (champ.raw_hp !== undefined) {
            champ.max_hp = champ.raw_hp;
            champ.hp = champ.raw_hp;
        } else {
            champ.hp = champ.max_hp;
        }
        champ.mana = 0;
        champ.shield = 0;
        champ.is_alive = true;
        champ.team = STATE.myTeam || 'Team1'; // Restore from mind_control / soul_swap

        // FIX: Reset attack, speed, range, skill to raw baseline so buffs do not leak
        if (champ.raw_attack !== undefined) champ.attack = champ.raw_attack;
        else if (champ.base_attack !== undefined) champ.attack = champ.base_attack;

        if (champ.raw_speed !== undefined) champ.speed = champ.raw_speed;
        else if (champ.base_speed !== undefined) champ.speed = champ.base_speed;

        if (champ.raw_range !== undefined) champ.attack_range = champ.raw_range;
        if (champ.raw_skill !== undefined) champ.skill = champ.raw_skill;
        champ.applied_traits = [];

        champ.buffs = [];
        champ.buff_details = [];

        if (champ.originalX !== undefined && champ.originalY !== undefined) {
            champ.targetX = champ.originalX;
            champ.targetY = champ.originalY;
        }
        champ.shakeTimer = 0;
    });

    STATE.activeProjectiles = [];
    STATE.hitEffects = [];
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