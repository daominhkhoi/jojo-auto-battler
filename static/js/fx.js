// static/js/fx.js
// "Game feel" layer: hit-stop, card shatter, JoJo stand callouts, menacing ゴゴゴ,
// time-stop screen filter, big round banners and animated gold counter.
import { STATE, IMAGE_CACHE, getCanvasCoords } from './globals.js';

// ======================================================================
// SHARED HELPERS
// ======================================================================
export function champCenter(champ) {
    const size = getCanvasCoords(champ.targetX, champ.targetY);
    return {
        x: (champ.pixelX ?? size.x) + size.w / 2,
        y: (champ.pixelY ?? size.y) + size.h / 2,
        top: (champ.pixelY ?? size.y),
        w: size.w,
        h: size.h
    };
}

export function champImage(champ) {
    const baseName = (champ.name || '').replace(/\s*\(CLONE\)$/i, '').trim();
    return IMAGE_CACHE[champ.name] || IMAGE_CACHE[baseName];
}

export function isImageReady(img) {
    return !!img && img.complete && img.naturalWidth > 0;
}

// Freeze the simulation for a few frames on big impacts (rendering keeps going)
export function triggerHitStop(frames) {
    STATE.hitStop = Math.max(STATE.hitStop || 0, frames);
}

// Per-unit animation timers (frames) — decremented once per physics frame
const UNIT_TIMERS = ['lungeT', 'knockT', 'popT', 'castT', 'deathT'];

// ======================================================================
// STAND CALLOUTS ("ZA WARUDO!") & RUSH CRIES ("ORA!")
// ======================================================================
const SIGNATURE_CALLOUTS = {
    'The World': 'ZA WARUDO!',
    'Star Platinum': 'STAR PLATINUM: ZA WARUDO!',
    'Killer Queen': 'BITES THE DUST!',
    'King Crimson': 'KING CRIMSON!',
    'Gold Experience Requiem': 'RETURN TO ZERO!',
    'Gold Experience': 'MUDA MUDA MUDA!',
    'Crazy Diamond': 'DORARARARA!',
    'The Hand': 'ZA HANDO!',
    'Sticky Fingers': 'ARRIVEDERCI!',
    'Hierophant Green': 'EMERALD SPLASH!',
    "Magician's Red": 'CROSSFIRE HURRICANE!',
    'Silver Chariot': 'HORA HORA HORA!',
    'Made in Heaven': 'MADE IN HEAVEN!',
    'Sex Pistols': 'PASS IT ON, BOYS!',
    'Aerosmith': 'VOLARE VIA!',
    'Stone Free': 'ORA ORA ORA!',
    'Purple Haze': 'UBASHAAA!',
    'Weather Report': 'HEAVY WEATHER!',
    'Cream': 'VANISH!',
    'C-MOON': 'GRAVITY FLIP!',
    'Whitesnake': 'DISC STEAL!',
};

const RUSH_CRIES = {
    'Star Platinum': 'ORA!',
    'Stone Free': 'ORA!',
    'The World': 'MUDA!',
    'Gold Experience': 'MUDA!',
    'Gold Experience Requiem': 'MUDA!',
    'Crazy Diamond': 'DORA!',
    'Sticky Fingers': 'ARI!',
    'Silver Chariot': 'HORA!',
    'Chariot Requiem': 'HORA!',
};

const MAX_CALLOUTS = 5;

function pushCallout(callout) {
    if (!STATE.callouts) STATE.callouts = [];
    if (STATE.callouts.length >= MAX_CALLOUTS) STATE.callouts.shift();
    STATE.callouts.push(callout);
}

function isAllyUnit(champ) {
    if (STATE.isBotVsBot) return champ.team === 'Team1';
    return champ.team === (STATE.myTeam || 'Team1');
}

export function spawnCallout(caster) {
    if (!caster) return;
    const baseName = (caster.name || '').replace(/\s*\(CLONE\)$/i, '').trim();
    const text = SIGNATURE_CALLOUTS[baseName] || `${baseName.toUpperCase()}!`;
    pushCallout({
        targetId: caster.id,
        text,
        color: isAllyUnit(caster) ? '#ffd32a' : '#ff6b81',
        size: text.length > 18 ? 22 : 28,
        life: 75,
        maxLife: 75,
        small: false
    });
}

const lastRushCry = {};
export function maybeRushCry(attacker) {
    const baseName = (attacker.name || '').replace(/\s*\(CLONE\)$/i, '').trim();
    const cry = RUSH_CRIES[baseName];
    if (!cry) return;
    const now = performance.now();
    if (now - (lastRushCry[attacker.id] || 0) < 900 || Math.random() > 0.45) return;
    lastRushCry[attacker.id] = now;
    pushCallout({
        targetId: attacker.id,
        text: Math.random() < 0.5 ? cry : `${cry.replace('!', '')} ${cry}`,
        color: isAllyUnit(attacker) ? '#ffffff' : '#ffb8c6',
        size: 17,
        life: 34,
        maxLife: 34,
        small: true,
        jitter: (Math.random() - 0.5) * 40
    });
}

function drawCallouts(ctx, canvas) {
    if (!STATE.callouts || STATE.callouts.length === 0) return;
    STATE.callouts.forEach(c => {
        const champ = STATE.champions.find(u => u.id === c.targetId);
        if (champ) {
            const pos = champCenter(champ);
            c.x = pos.x + (c.jitter || 0);
            c.y = pos.top - (c.small ? 4 : 16);
        }
        if (c.x === undefined) return;

        const age = c.maxLife - c.life;
        const pop = age < 7 ? 1.7 - 0.7 * (age / 7) : 1;
        const alpha = Math.min(1, c.life / 14);
        const rise = c.small ? age * 0.6 : Math.min(age, 10) * 0.8;

        ctx.save();
        ctx.font = `italic 900 ${c.size}px Impact, "Arial Black", "Segoe UI", sans-serif`;
        const halfW = ctx.measureText(c.text).width / 2 * pop;
        const x = Math.max(halfW + 6, Math.min(canvas.width - halfW - 6, c.x));
        ctx.globalAlpha = alpha;
        ctx.translate(x, c.y - rise);
        ctx.scale(pop, pop);
        ctx.transform(1, 0, -0.18, 1, 0, 0); // manga slant
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = c.small ? 5 : 7;
        ctx.strokeText(c.text, 0, 0);
        ctx.fillStyle = c.color;
        ctx.fillText(c.text, 0, 0);
        if (!c.small) {
            ctx.lineWidth = 1.2;
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.strokeText(c.text, 0, 0);
        }
        ctx.restore();
    });
}

// ======================================================================
// MENACING ゴゴゴ (inspection phase and units with a full mana bar)
// ======================================================================
export function maybeSpawnMenacing(cx, top, width, rate) {
    if (!STATE.menacing) STATE.menacing = [];
    if (STATE.menacing.length >= 26 || Math.random() > rate) return;
    STATE.menacing.push({
        x: cx + (Math.random() - 0.5) * width * 1.1,
        y: top + 10 + Math.random() * 30,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.45 - Math.random() * 0.4,
        rot: (Math.random() - 0.5) * 0.5,
        size: 16 + Math.random() * 12,
        life: 64,
        maxLife: 64
    });
}

function drawMenacing(ctx, timeNow) {
    if (!STATE.menacing || STATE.menacing.length === 0) return;
    STATE.menacing.forEach(m => {
        const age = m.maxLife - m.life;
        const alpha = Math.min(1, age / 10, m.life / 16);
        const wobble = 1 + Math.sin(timeNow * 12 + m.x) * 0.08;
        ctx.save();
        ctx.globalAlpha = alpha * 0.95;
        ctx.translate(m.x, m.y);
        ctx.rotate(m.rot);
        ctx.scale(wobble, wobble);
        ctx.font = `900 ${m.size}px "Yu Gothic", "MS Gothic", "Meiryo", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#1b0026';
        ctx.strokeText('ゴ', 0, 0);
        ctx.fillStyle = '#c56cf0';
        ctx.fillText('ゴ', 0, 0);
        ctx.restore();
    });
}

// ======================================================================
// CARD SHATTER ON DEATH
// ======================================================================
export function spawnShatter(champ) {
    if (!STATE.shards) STATE.shards = [];
    const size = getCanvasCoords(champ.targetX, champ.targetY);
    const x0 = (champ.pixelX ?? size.x) + 2;
    const y0 = (champ.pixelY ?? size.y) + 2;
    const w = size.w - 4, h = size.h - 4;
    const cols = 3, rows = 4;
    const pw = w / cols, ph = h / rows;
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const img = champImage(champ);

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const px = x0 + c * pw + pw / 2;
            const py = y0 + r * ph + ph / 2;
            const ang = Math.atan2(py - cy, px - cx) + (Math.random() - 0.5) * 0.6;
            const spd = 2.5 + Math.random() * 4.5;
            STATE.shards.push({
                img,
                sx: c / cols, sy: r / rows, sw: 1 / cols, sh: 1 / rows,
                x: px, y: py, w: pw, h: ph,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - 2.5,
                rot: 0,
                vr: (Math.random() - 0.5) * 0.35,
                life: 42,
                maxLife: 42
            });
        }
    }
    if (STATE.shards.length > 144) STATE.shards.splice(0, STATE.shards.length - 144);
}

function drawShards(ctx) {
    if (!STATE.shards || STATE.shards.length === 0) return;
    STATE.shards.forEach(s => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, s.life / s.maxLife);
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        if (isImageReady(s.img)) {
            const nw = s.img.naturalWidth, nh = s.img.naturalHeight;
            ctx.drawImage(s.img, s.sx * nw, s.sy * nh, s.sw * nw, s.sh * nh, -s.w / 2, -s.h / 2, s.w, s.h);
        } else {
            ctx.fillStyle = '#34495e';
            ctx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-s.w / 2, -s.h / 2, s.w, s.h);
        ctx.restore();
    });
}

// ======================================================================
// ZA WARUDO SCREEN FILTER
// ======================================================================
export function startTimeStopFlash() {
    STATE.timeStopFlash = 14;
}

// Inverts the screen briefly when time stops, then keeps the world desaturated
export function applyTimeStopFilter(ctx, canvas, worldStopped) {
    ctx.save();
    if (STATE.timeStopFlash > 0) {
        ctx.globalCompositeOperation = 'difference';
        ctx.globalAlpha = Math.min(1, STATE.timeStopFlash / 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-30, -30, canvas.width + 60, canvas.height + 60);
        STATE.timeStopFlash--;
    } else if (worldStopped) {
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#808080';
        ctx.fillRect(-30, -30, canvas.width + 60, canvas.height + 60);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(40, 20, 90, 0.18)';
        ctx.fillRect(-30, -30, canvas.width + 60, canvas.height + 60);
    }
    ctx.restore();
}

// ======================================================================
// PER-FRAME UPDATE & DRAW ENTRY POINTS
// ======================================================================
export function updateFx() {
    STATE.champions.forEach(c => {
        for (const key of UNIT_TIMERS) {
            if (c[key] > 0) c[key]--;
        }
    });

    if (STATE.shards) {
        for (let i = STATE.shards.length - 1; i >= 0; i--) {
            const s = STATE.shards[i];
            s.vy += 0.38;
            s.vx *= 0.98;
            s.x += s.vx;
            s.y += s.vy;
            s.rot += s.vr;
            if (--s.life <= 0) STATE.shards.splice(i, 1);
        }
    }
    if (STATE.callouts) {
        for (let i = STATE.callouts.length - 1; i >= 0; i--) {
            if (--STATE.callouts[i].life <= 0) STATE.callouts.splice(i, 1);
        }
    }
    if (STATE.menacing) {
        for (let i = STATE.menacing.length - 1; i >= 0; i--) {
            const m = STATE.menacing[i];
            m.x += m.vx;
            m.y += m.vy;
            if (--m.life <= 0) STATE.menacing.splice(i, 1);
        }
    }
}

export function drawWorldFx(ctx, timeNow) {
    drawMenacing(ctx, timeNow);
    drawShards(ctx);
}

export function drawOverlayFx(ctx, canvas) {
    drawCallouts(ctx, canvas);
}

// ======================================================================
// DOM: BIG ROUND BANNERS ("ROUND 3", "FIGHT!")
// ======================================================================
let bannerTimer = null;

export function showBigBanner(title, subtitle = '', variant = 'round') {
    let banner = document.getElementById('bigBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'bigBanner';
        banner.innerHTML = `<div class="bb-strip"><div class="bb-title"></div><div class="bb-sub"></div></div>`;
        document.body.appendChild(banner);
    }
    // textContent: titles can contain player names
    banner.querySelector('.bb-title').textContent = title;
    const sub = banner.querySelector('.bb-sub');
    sub.textContent = subtitle || '';
    sub.style.display = subtitle ? 'block' : 'none';

    banner.className = `bb-${variant}`;
    void banner.offsetWidth; // restart the CSS animation
    banner.classList.add('play');

    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('play'), 1500);
}

// ======================================================================
// DOM: ANIMATED GOLD COUNTER + "+11" POP
// ======================================================================
let goldShown = null;
let goldRaf = null;

export function animateGold(newValue, delta) {
    const el = document.getElementById('goldText');
    if (!el) return;
    const from = goldShown === null ? newValue - delta : goldShown;
    const start = performance.now();
    const duration = Math.min(600, 180 + Math.abs(newValue - from) * 25);

    cancelAnimationFrame(goldRaf);
    const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        goldShown = Math.round(from + (newValue - from) * eased);
        el.innerText = goldShown;
        if (t < 1) goldRaf = requestAnimationFrame(step);
    };
    goldRaf = requestAnimationFrame(step);

    if (delta) {
        const holder = el.closest('.gold-display') || el.parentElement;
        const pop = document.createElement('span');
        pop.className = `gold-pop ${delta > 0 ? 'plus' : 'minus'}`;
        pop.textContent = `${delta > 0 ? '+' : ''}${delta}`;
        holder.appendChild(pop);
        setTimeout(() => pop.remove(), 1000);
        bumpElement(holder);
    }
}

export function resetGoldDisplay(value) {
    cancelAnimationFrame(goldRaf);
    goldShown = value;
    const el = document.getElementById('goldText');
    if (el) el.innerText = value;
}

export function bumpElement(el) {
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
}
