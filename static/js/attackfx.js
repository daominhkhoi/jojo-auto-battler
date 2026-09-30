// static/js/attackfx.js
// Basic-attack VFX. Every stand gets an attack style (punch rush, blade, bullet,
// energy orb or strike) drawn with additive glow, plus layered impacts and
// manga-style crit frames (focus lines + katakana SFX).
import { STATE, CHAMPION_POOL, getCanvasCoords } from './globals.js';

export const DISPLAY_FONT = '"Bangers", Impact, "Arial Black", sans-serif';

const RUSH_STANDS = new Set([
    'Star Platinum', 'The World', 'Crazy Diamond', 'Gold Experience', 'Gold Experience Requiem',
    'Stone Free', 'Sticky Fingers', 'King Crimson', 'Killer Queen', 'Made in Heaven',
    'Whitesnake', 'C-MOON', 'Echoes Act3', 'Soft Machine', 'Kraft Work'
]);
const BLADE_STANDS = new Set(['Silver Chariot', 'Anubis', 'Clash', 'Chariot Requiem', 'Metallica', 'Cream']);
const GUN_STANDS = new Set(['Emperor', 'Sex Pistols', 'Aerosmith', 'Bad Company', 'Manhattan Transfer', 'Ratt']);

const STAND_COLORS = {
    'Star Platinum': '#9b7bff', 'The World': '#ffd23f', 'Crazy Diamond': '#ff7ad9',
    'Gold Experience': '#ffd23f', 'Gold Experience Requiem': '#fff27a', 'Killer Queen': '#ff8fd8',
    'King Crimson': '#ff3b5c', 'Silver Chariot': '#e2ecff', 'Chariot Requiem': '#c9b6ff',
    "Magician's Red": '#ff6a2a', 'Hierophant Green': '#3dff9a', 'Purple Haze': '#b84dff',
    'Sticky Fingers': '#6ab8ff', 'Stone Free': '#5ad1ff', 'Aerosmith': '#ff9f43',
    'Sex Pistols': '#ffe066', 'Whitesnake': '#e8e8ff', 'Made in Heaven': '#9ae6ff',
    'The Hand': '#6b8cff', 'Weather Report': '#9fd8ff', 'Emperor': '#ffb347',
    'Cream': '#b18cff', 'Metallica': '#c0c7d0', 'Anubis': '#dfe6ff', 'Clash': '#4dd6ff',
    'Bad Company': '#9acd32', 'Manhattan Transfer': '#8fe3ff', 'Ratt': '#b8ff5a',
    'C-MOON': '#7dff7a', 'Hermit Purple': '#b066ff', 'Echoes Act3': '#62ffb0'
};
const COST_TINT = { 1: '#d7e0ea', 2: '#5dff9d', 3: '#5ab8ff', 4: '#d58bff', 5: '#ffcf40' };

const CRIT_SFX = ['ドン!', 'バァン!', 'ゴッ!', 'ドゴォ!', 'ズガッ!'];

function baseNameOf(champ) {
    return (champ.name || '').replace(/\s*\(CLONE\)$/i, '').trim();
}

export function attackStyleOf(champ) {
    const b = baseNameOf(champ);
    if (GUN_STANDS.has(b)) return 'bullet';
    if (BLADE_STANDS.has(b)) return 'blade';
    if (RUSH_STANDS.has(b)) return 'rush';
    return (champ.attack_range || 1) > 1.5 ? 'orb' : 'strike';
}

export function standColor(champ) {
    if (!champ._fxColor) {
        const b = baseNameOf(champ);
        const tpl = CHAMPION_POOL.find(t => t.name === b);
        champ._fxColor = STAND_COLORS[b] || COST_TINT[tpl ? tpl.cost : 1] || '#ffffff';
    }
    return champ._fxColor;
}

function centerOf(champ) {
    const s = getCanvasCoords(champ.targetX, champ.targetY);
    return {
        x: (champ.pixelX !== undefined ? champ.pixelX : s.x) + s.w / 2,
        y: (champ.pixelY !== undefined ? champ.pixelY : s.y) + s.h / 2
    };
}

// "#rrggbb" -> "r, g, b" for rgba() strings
const rgbCache = {};
function rgb(hex) {
    if (!rgbCache[hex]) {
        const n = parseInt(hex.slice(1), 16);
        rgbCache[hex] = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    }
    return rgbCache[hex];
}

function ensureLists() {
    if (!STATE.attackFx) STATE.attackFx = [];
    if (!STATE.impacts) STATE.impacts = [];
    if (!STATE.sfxTexts) STATE.sfxTexts = [];
    if (!STATE.particles) STATE.particles = [];
}

// ======================================================================
// SPAWN
// ======================================================================
// onHit() is called once, at the moment the attack connects (damage text, knockback, sound)
export function spawnAttack(attacker, target, { isCrit = false, onHit = null } = {}) {
    ensureLists();
    const from = centerOf(attacker);
    const to = centerOf(target);
    const style = attackStyleOf(attacker);
    const fx = {
        style,
        color: standColor(attacker),
        attackerId: attacker.id,
        targetId: target.id,
        sx: from.x, sy: from.y,
        x: from.x, y: from.y,
        tx: to.x, ty: to.y,
        angle: Math.atan2(to.y - from.y, to.x - from.x),
        age: 0,
        isCrit,
        onHit,
        hit: false,
        trail: []
    };

    if (style === 'bullet') { fx.speed = 34; fx.projectile = true; }
    else if (style === 'orb') { fx.speed = 16; fx.projectile = true; }
    else if (style === 'rush') {
        fx.hitAt = 3; fx.life = 20;
        // A flurry of punches landing around the target
        fx.punches = Array.from({ length: isCrit ? 9 : 6 }, (_, k) => ({
            t: k * 2 + (Math.random() < 0.5 ? 0 : 1),
            ox: (Math.random() - 0.5) * 46,
            oy: (Math.random() - 0.5) * 56
        }));
    } else if (style === 'blade') { fx.hitAt = 4; fx.life = 16; fx.tilt = (Math.random() - 0.5) * 0.5; }
    else { fx.hitAt = 4; fx.life = 16; fx.flip = Math.random() < 0.5 ? 1 : -1; }

    if (STATE.attackFx.length > 60) STATE.attackFx.shift();
    STATE.attackFx.push(fx);
}

function spawnSparks(x, y, color, angle, count, speedMin, speedMax, spread = 1.4) {
    for (let i = 0; i < count; i++) {
        const a = angle + (Math.random() - 0.5) * spread * 2;
        const spd = speedMin + Math.random() * (speedMax - speedMin);
        STATE.particles.push({
            x, y,
            vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            color: Math.random() < 0.35 ? '#ffffff' : color,
            size: Math.random() * 2 + 1.4,
            life: 10 + Math.random() * 8,
            glow: true
        });
    }
    if (STATE.particles.length > 90) STATE.particles.splice(0, STATE.particles.length - 90);
}

function spawnImpact(fx) {
    const rays = [];
    const n = fx.isCrit ? 12 : 7;
    for (let i = 0; i < n; i++) {
        // Most rays fly along the hit direction, a few scatter everywhere
        const directional = Math.random() < 0.7;
        rays.push({
            a: directional ? fx.angle + (Math.random() - 0.5) * 1.8 : Math.random() * Math.PI * 2,
            len: 0.7 + Math.random() * 0.8
        });
    }
    STATE.impacts.push({
        x: fx.tx, y: fx.ty, color: fx.color, isCrit: fx.isCrit,
        angle: fx.angle, rays, age: 0, life: fx.isCrit ? 20 : 14
    });
    if (STATE.impacts.length > 40) STATE.impacts.shift();

    spawnSparks(fx.tx, fx.ty, fx.color, fx.angle, fx.isCrit ? 12 : 6, 4, fx.isCrit ? 13 : 9);

    if (fx.isCrit) {
        STATE.focusLines = { x: fx.tx, y: fx.ty, life: 12, maxLife: 12, seed: Math.random() * 1000 };
        STATE.sfxTexts.push({
            x: fx.tx + (Math.random() < 0.5 ? -1 : 1) * (34 + Math.random() * 12),
            y: fx.ty + 28,
            text: CRIT_SFX[Math.floor(Math.random() * CRIT_SFX.length)],
            rot: (Math.random() - 0.5) * 0.5,
            age: 0, life: 36
        });
        if (STATE.sfxTexts.length > 6) STATE.sfxTexts.shift();
    }
}

function connect(fx) {
    if (fx.hit) return;
    fx.hit = true;
    if (fx.onHit) fx.onHit();
    spawnImpact(fx);
}

// ======================================================================
// UPDATE (once per physics frame)
// ======================================================================
export function updateAttackFx() {
    ensureLists();

    for (let i = STATE.attackFx.length - 1; i >= 0; i--) {
        const fx = STATE.attackFx[i];
        fx.age++;

        // Home in on the live target position
        const target = STATE.champions.find(c => c.id === fx.targetId);
        if (target && !fx.hit) {
            const c = centerOf(target);
            fx.tx = c.x; fx.ty = c.y;
        }

        if (fx.projectile) {
            if (!fx.hit) {
                const dx = fx.tx - fx.x, dy = fx.ty - fx.y;
                const d = Math.hypot(dx, dy);
                if (d <= fx.speed || fx.age > 90) {
                    fx.x = fx.tx; fx.y = fx.ty;
                    connect(fx);
                    fx.fade = 6;
                } else {
                    fx.x += (dx / d) * fx.speed;
                    fx.y += (dy / d) * fx.speed;
                    fx.angle = Math.atan2(dy, dx);
                }
                fx.trail.push({ x: fx.x, y: fx.y });
                if (fx.trail.length > 10) fx.trail.shift();
            } else {
                if (fx.trail.length) fx.trail.shift();
                if (--fx.fade <= 0) STATE.attackFx.splice(i, 1);
            }
        } else {
            if (fx.age === fx.hitAt) connect(fx);
            if (fx.style === 'rush') {
                fx.punches.forEach(p => {
                    if (p.t === fx.age) {
                        spawnSparks(fx.tx + p.ox, fx.ty + p.oy, fx.color, fx.angle, 2, 3, 7, 0.9);
                        if (target) target.shakeTimer = Math.max(target.shakeTimer || 0, 2);
                    }
                });
            }
            if (fx.age >= fx.life) STATE.attackFx.splice(i, 1);
        }
    }

    for (let i = STATE.impacts.length - 1; i >= 0; i--) {
        if (++STATE.impacts[i].age >= STATE.impacts[i].life) STATE.impacts.splice(i, 1);
    }
    for (let i = STATE.sfxTexts.length - 1; i >= 0; i--) {
        if (++STATE.sfxTexts[i].age >= STATE.sfxTexts[i].life) STATE.sfxTexts.splice(i, 1);
    }
    if (STATE.focusLines && --STATE.focusLines.life <= 0) STATE.focusLines = null;
}

// ======================================================================
// DRAW
// ======================================================================
function taperedQuad(ctx, x1, y1, x2, y2, width) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const px = Math.cos(a + Math.PI / 2) * width / 2;
    const py = Math.sin(a + Math.PI / 2) * width / 2;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(mx + px, my + py);
    ctx.lineTo(x2, y2);
    ctx.lineTo(mx - px, my - py);
    ctx.closePath();
}

function glowDot(ctx, x, y, r, color, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    g.addColorStop(0.35, `rgba(${rgb(color)}, ${alpha * 0.85})`);
    g.addColorStop(1, `rgba(${rgb(color)}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
}

function drawOrb(ctx, fx) {
    const c = rgb(fx.color);
    // Tapered glowing trail
    for (let i = 0; i < fx.trail.length; i++) {
        const p = fx.trail[i];
        const k = (i + 1) / fx.trail.length;
        ctx.fillStyle = `rgba(${c}, ${0.35 * k})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (fx.isCrit ? 9 : 7) * k, 0, Math.PI * 2);
        ctx.fill();
    }
    if (fx.hit) return;
    const r = fx.isCrit ? 20 : 15;
    glowDot(ctx, fx.x, fx.y, r, fx.color, 1);
    // Two sparks orbiting the head
    for (let k = 0; k < 2; k++) {
        const a = fx.age * 0.6 + k * Math.PI;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(fx.x + Math.cos(a) * 9, fx.y + Math.sin(a) * 9, 1.8, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawBullet(ctx, fx) {
    const c = rgb(fx.color);
    // Muzzle flash at the shooter
    if (fx.age < 5) {
        const a = 1 - fx.age / 5;
        glowDot(ctx, fx.sx + Math.cos(fx.angle) * 26, fx.sy + Math.sin(fx.angle) * 26, 18 * a + 6, fx.color, a);
    }
    const tailLen = fx.hit ? 70 * (fx.fade / 6) : 70;
    if (tailLen <= 1) return;
    const hx = fx.x, hy = fx.y;
    const tx = hx - Math.cos(fx.angle) * tailLen;
    const ty = hy - Math.sin(fx.angle) * tailLen;
    const g = ctx.createLinearGradient(tx, ty, hx, hy);
    g.addColorStop(0, `rgba(${c}, 0)`);
    g.addColorStop(0.7, `rgba(${c}, 0.8)`);
    g.addColorStop(1, 'rgba(255, 255, 255, 1)');
    ctx.fillStyle = g;
    taperedQuad(ctx, tx, ty, hx, hy, fx.isCrit ? 7 : 5);
    ctx.fill();
    if (!fx.hit) glowDot(ctx, hx, hy, fx.isCrit ? 10 : 7, fx.color, 1);
}

function drawStrike(ctx, fx) {
    // Crescent sweep across the target
    const p = Math.min(1, fx.age / 8);
    const fade = fx.age < 8 ? 1 : Math.max(0, 1 - (fx.age - 8) / 8);
    const r = 36;
    const start = fx.angle - Math.PI / 2 - 1.1 * fx.flip;
    const sweep = 2.2 * fx.flip * p;
    const c = rgb(fx.color);
    const steps = 6;
    ctx.lineCap = 'round';
    for (let s = 0; s < steps; s++) {
        const a0 = start + sweep * (s / steps);
        const a1 = start + sweep * ((s + 1) / steps);
        const k = (s + 1) / steps;
        ctx.beginPath();
        ctx.arc(fx.tx - Math.cos(fx.angle) * 8, fx.ty - Math.sin(fx.angle) * 8, r, Math.min(a0, a1), Math.max(a0, a1));
        ctx.strokeStyle = `rgba(${c}, ${0.9 * k * fade})`;
        ctx.lineWidth = 10 * k;
        ctx.stroke();
        ctx.strokeStyle = `rgba(255, 255, 255, ${k * fade})`;
        ctx.lineWidth = 3 * k;
        ctx.stroke();
    }
}

function drawBlade(ctx, fx) {
    // Two fast crossing slashes (an "X"), each revealed then fading
    const c = rgb(fx.color);
    [0, 4].forEach((delay, idx) => {
        const age = fx.age - delay;
        if (age < 0) return;
        const reveal = Math.min(1, age / 3);
        const fade = age < 4 ? 1 : Math.max(0, 1 - (age - 4) / 8);
        if (fade <= 0) return;
        const a = fx.angle + (idx === 0 ? 0.85 : -0.85) + fx.tilt;
        const L = fx.isCrit ? 120 : 92;
        const x1 = fx.tx - Math.cos(a) * L / 2, y1 = fx.ty - Math.sin(a) * L / 2;
        const x2 = x1 + Math.cos(a) * L * reveal, y2 = y1 + Math.sin(a) * L * reveal;
        ctx.fillStyle = `rgba(${c}, ${0.75 * fade})`;
        taperedQuad(ctx, x1, y1, x2, y2, fx.isCrit ? 14 : 10);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 255, 255, ${fade})`;
        taperedQuad(ctx, x1, y1, x2, y2, 3.5);
        ctx.fill();
    });
}

function drawRush(ctx, fx) {
    // Barrage: each punch = speed streaks + a small burst at its landing point
    const c = rgb(fx.color);
    const back = fx.angle + Math.PI;
    fx.punches.forEach(p => {
        const age = fx.age - p.t;
        if (age < 0 || age > 6) return;
        const k = 1 - age / 6;
        const px = fx.tx + p.ox, py = fx.ty + p.oy;
        // streaks coming from the attacker's side
        ctx.strokeStyle = `rgba(${c}, ${0.7 * k})`;
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (let s = -1; s <= 1; s++) {
            const ox = Math.cos(back + Math.PI / 2) * s * 7;
            const oy = Math.sin(back + Math.PI / 2) * s * 7;
            ctx.beginPath();
            ctx.moveTo(px + ox + Math.cos(back) * 12, py + oy + Math.sin(back) * 12);
            ctx.lineTo(px + ox + Math.cos(back) * (34 + 20 * k), py + oy + Math.sin(back) * (34 + 20 * k));
            ctx.stroke();
        }
        glowDot(ctx, px, py, 8 + 14 * (1 - k), fx.color, k);
        ctx.strokeStyle = `rgba(255, 255, 255, ${k})`;
        ctx.lineWidth = 2 * k + 0.5;
        ctx.beginPath();
        ctx.arc(px, py, 6 + 16 * (1 - k), 0, Math.PI * 2);
        ctx.stroke();
    });
}

function drawImpact(ctx, im) {
    const p = im.age / im.life;
    const ease = 1 - Math.pow(1 - p, 3);
    const c = rgb(im.color);
    const big = im.isCrit ? 1.6 : 1;

    // Core flash
    const r = 38 * big * (0.45 + ease * 0.7);
    const g = ctx.createRadialGradient(im.x, im.y, 0, im.x, im.y, r);
    g.addColorStop(0, `rgba(255, 255, 255, ${0.95 * (1 - p)})`);
    g.addColorStop(0.35, `rgba(${c}, ${0.7 * (1 - p)})`);
    g.addColorStop(1, `rgba(${c}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(im.x, im.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Shockwave ring
    ctx.strokeStyle = `rgba(${c}, ${1 - p})`;
    ctx.lineWidth = (im.isCrit ? 6 : 3.5) * (1 - p) + 0.5;
    ctx.beginPath();
    ctx.arc(im.x, im.y, 48 * big * ease + 6, 0, Math.PI * 2);
    ctx.stroke();

    // Spark rays
    ctx.lineCap = 'round';
    im.rays.forEach(ray => {
        const r1 = 10 + 30 * big * ease;
        const r2 = r1 + 26 * big * ray.len * (1 - p);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * (1 - p)})`;
        ctx.lineWidth = 2.4 * (1 - p) + 0.4;
        ctx.beginPath();
        ctx.moveTo(im.x + Math.cos(ray.a) * r1, im.y + Math.sin(ray.a) * r1);
        ctx.lineTo(im.x + Math.cos(ray.a) * r2, im.y + Math.sin(ray.a) * r2);
        ctx.stroke();
    });
}

// Manga "集中線" focus lines converging on a crit
function drawFocusLines(ctx, canvas) {
    const f = STATE.focusLines;
    if (!f) return;
    const a = f.life / f.maxLife;
    const outer = 230;
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * a})`;
    let seed = f.seed;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 30; i++) {
        const ang = (i / 30) * Math.PI * 2 + rand() * 0.15;
        const inner = 62 + rand() * 40;
        const w = 0.012 + rand() * 0.02;
        ctx.beginPath();
        ctx.moveTo(f.x + Math.cos(ang) * inner, f.y + Math.sin(ang) * inner);
        ctx.lineTo(f.x + Math.cos(ang - w) * outer, f.y + Math.sin(ang - w) * outer);
        ctx.lineTo(f.x + Math.cos(ang + w) * outer, f.y + Math.sin(ang + w) * outer);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

function drawSfxTexts(ctx) {
    STATE.sfxTexts.forEach(t => {
        const pop = t.age < 6 ? 1.8 - 0.8 * (t.age / 6) : 1;
        const alpha = Math.min(1, (t.life - t.age) / 10);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(t.x, t.y - t.age * 0.5);
        ctx.rotate(t.rot);
        ctx.scale(pop, pop);
        ctx.font = '900 30px "Yu Gothic UI", "Yu Gothic", "Meiryo", "MS Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(t.text, 0, 0);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ff3d8b';
        ctx.strokeText(t.text, 0, 0);
        ctx.fillStyle = '#fff6c9';
        ctx.fillText(t.text, 0, 0);
        ctx.restore();
    });
}

// Glowing attack layer (additive) — drawn above units
export function drawAttackFx(ctx, canvas) {
    ensureLists();
    drawFocusLines(ctx, canvas);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    STATE.attackFx.forEach(fx => {
        if (fx.style === 'orb') drawOrb(ctx, fx);
        else if (fx.style === 'bullet') drawBullet(ctx, fx);
        else if (fx.style === 'blade') drawBlade(ctx, fx);
        else if (fx.style === 'rush') drawRush(ctx, fx);
        else drawStrike(ctx, fx);
    });
    STATE.impacts.forEach(im => drawImpact(ctx, im));
    ctx.restore();

    drawSfxTexts(ctx);
}

export function clearAttackFx() {
    STATE.attackFx = [];
    STATE.impacts = [];
    STATE.sfxTexts = [];
    STATE.focusLines = null;
}
