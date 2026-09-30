// static/js/audio.js
// Web Audio SFX engine.
//  - Buffers are decoded once; every play is a fresh BufferSource (unlimited, cheap).
//  - Small random pitch/volume variation so repeated hits never sound robotic.
//  - Stereo panning from the unit's position on the board.
//  - Two buses: "world" (combat: hits, deaths…) and "cinema" (skills, UI, banners).
//    During a time stop the world bus is muffled through a low-pass filter, the
//    cinema bus stays clear — just like the anime.
//  - Drop your own files into /static/sounds/custom/ (named like the keys below)
//    to replace any sound without touching code.

const S = '/static/sounds/';
const ST = '/static/sounds/stands/';

// key -> { src, volume, bus, jitter (pitch variation), minInterval (ms), maxVoices }
const SFX_CONFIG = {
    // UI
    buy:          { src: S + 'buy.wav',          volume: 0.6,  bus: 'cinema', jitter: 0.04, minInterval: 40,  maxVoices: 3 },
    sell:         { src: S + 'sell.wav',         volume: 0.6,  bus: 'cinema', jitter: 0.04, minInterval: 40,  maxVoices: 3 },
    roll:         { src: S + 'roll.wav',         volume: 0.55, bus: 'cinema', jitter: 0.05, minInterval: 60,  maxVoices: 2 },
    levelup:      { src: S + 'levelup.wav',      volume: 0.7,  bus: 'cinema', jitter: 0,    minInterval: 150, maxVoices: 1 },
    starup:       { src: S + 'starup.wav',       volume: 0.8,  bus: 'cinema', jitter: 0,    minInterval: 150, maxVoices: 2 },

    // Match flow
    battle_start: { src: S + 'battle_start.wav', volume: 0.85, bus: 'cinema', jitter: 0,    minInterval: 500, maxVoices: 1 },
    round_win:    { src: S + 'round_win.wav',    volume: 0.8,  bus: 'cinema', jitter: 0,    minInterval: 500, maxVoices: 1 },
    round_lose:   { src: S + 'round_lose.wav',   volume: 0.8,  bus: 'cinema', jitter: 0,    minInterval: 500, maxVoices: 1 },
    menacing:     { src: S + 'menacing.wav',     volume: 0.9,  bus: 'cinema', jitter: 0,    minInterval: 1500, maxVoices: 1 },
    time_stop:    { src: S + 'time_stop.wav',    volume: 1.0,  bus: 'cinema', jitter: 0,    minInterval: 800, maxVoices: 1 },
    time_resume:  { src: S + 'time_resume.wav',  volume: 0.9,  bus: 'cinema', jitter: 0,    minInterval: 800, maxVoices: 1 },

    // Combat (world bus)
    hit_normal:   { src: S + 'hit_normal.wav',   volume: 0.45, bus: 'world', jitter: 0.12, minInterval: 30,  maxVoices: 6 },
    hit_crit:     { src: S + 'hit_crit.wav',     volume: 0.7,  bus: 'world', jitter: 0.06, minInterval: 60,  maxVoices: 3 },
    death:        { src: S + 'death.wav',        volume: 0.65, bus: 'world', jitter: 0.08, minInterval: 80,  maxVoices: 3 },
    skill_cast:   { src: S + 'skill_cast.wav',   volume: 0.6,  bus: 'cinema', jitter: 0.05, minInterval: 80, maxVoices: 3 },
    attack_rush:  { src: S + 'attack_rush.wav',  volume: 0.5,  bus: 'world', jitter: 0.1,  minInterval: 40,  maxVoices: 4 },
    attack_blade: { src: S + 'attack_blade.wav', volume: 0.45, bus: 'world', jitter: 0.1,  minInterval: 40,  maxVoices: 4 },
    attack_bullet:{ src: S + 'attack_bullet.wav',volume: 0.45, bus: 'world', jitter: 0.1,  minInterval: 40,  maxVoices: 4 },
    attack_orb:   { src: S + 'attack_orb.wav',   volume: 0.45, bus: 'world', jitter: 0.12, minInterval: 40,  maxVoices: 4 },
    attack_strike:{ src: S + 'attack_strike.wav',volume: 0.5,  bus: 'world', jitter: 0.12, minInterval: 40,  maxVoices: 4 },

    // Stand signatures
    'The World':               { src: ST + 'The World.wav',               volume: 1.0,  bus: 'cinema', minInterval: 600 },
    'Star Platinum':           { src: ST + 'Star Platinum.wav',           volume: 1.0,  bus: 'cinema', minInterval: 600 },
    'Killer Queen':            { src: ST + 'Killer Queen.wav',            volume: 0.95, bus: 'cinema', minInterval: 400 },
    'King Crimson':            { src: ST + 'King Crimson.wav',            volume: 0.9,  bus: 'cinema', minInterval: 500 },
    'Gold Experience Requiem': { src: ST + 'Gold Experience Requiem.wav', volume: 0.95, bus: 'cinema', minInterval: 600 },
    'Gold Experience':         { src: ST + 'Gold Experience.wav',         volume: 0.85, bus: 'cinema', minInterval: 400 },
    'Crazy Diamond':           { src: ST + 'Crazy Diamond.wav',           volume: 0.85, bus: 'cinema', minInterval: 400 },
    'The Hand':                { src: ST + 'The Hand.wav',                volume: 0.9,  bus: 'cinema', minInterval: 400 },
    'Sticky Fingers':          { src: ST + 'Sticky Fingers.wav',          volume: 0.85, bus: 'cinema', minInterval: 350 },
    'Aerosmith':               { src: ST + 'Aerosmith.wav',               volume: 0.8,  bus: 'cinema', minInterval: 350 },
    'Hierophant Green':        { src: ST + 'Hierophant Green.wav',        volume: 0.85, bus: 'cinema', minInterval: 350 },
    "Magician's Red":          { src: ST + "Magician's Red.wav",          volume: 0.85, bus: 'cinema', minInterval: 400 },
    'Silver Chariot':          { src: ST + 'Silver Chariot.wav',          volume: 0.8,  bus: 'cinema', minInterval: 250 },
    'Sex Pistols':             { src: ST + 'Sex Pistols.wav',             volume: 0.8,  bus: 'cinema', minInterval: 250 },
    'Purple Haze':             { src: ST + 'Purple Haze.wav',             volume: 0.85, bus: 'cinema', minInterval: 400 },
    'White Album':             { src: ST + 'White Album.wav',             volume: 0.85, bus: 'cinema', minInterval: 400 },
    'Red Hot Chili Pepper':    { src: ST + 'Red Hot Chili Pepper.wav',    volume: 0.85, bus: 'cinema', minInterval: 350 },
    'Bad Company':             { src: ST + 'Bad Company.wav',             volume: 0.85, bus: 'cinema', minInterval: 350 },
    'Weather Report':          { src: ST + 'Weather Report.wav',          volume: 0.95, bus: 'cinema', minInterval: 450 },
    'Cream':                   { src: ST + 'Cream.wav',                   volume: 0.9,  bus: 'cinema', minInterval: 450 },
    'Whitesnake':              { src: ST + 'Whitesnake.wav',              volume: 0.85, bus: 'cinema', minInterval: 350 },
    'C-MOON':                  { src: ST + 'C-MOON.wav',                  volume: 0.9,  bus: 'cinema', minInterval: 500 },
    'Made in Heaven':          { src: ST + 'Made in Heaven.wav',          volume: 0.95, bus: 'cinema', minInterval: 500 },

    // Skill archetypes (stands without a signature sound)
    archetype_slash:    { src: ST + 'archetype_slash.wav',    volume: 0.6,  bus: 'cinema', jitter: 0.06, minInterval: 80 },
    archetype_bullet:   { src: ST + 'archetype_bullet.wav',   volume: 0.6,  bus: 'cinema', jitter: 0.06, minInterval: 80 },
    archetype_shield:   { src: ST + 'archetype_shield.wav',   volume: 0.65, bus: 'cinema', jitter: 0.04, minInterval: 150 },
    archetype_heal:     { src: ST + 'archetype_heal.wav',     volume: 0.65, bus: 'cinema', jitter: 0.04, minInterval: 150 },
    archetype_mind:     { src: ST + 'archetype_mind.wav',     volume: 0.65, bus: 'cinema', jitter: 0.04, minInterval: 150 },
    archetype_submerge: { src: ST + 'archetype_submerge.wav', volume: 0.65, bus: 'cinema', jitter: 0.04, minInterval: 150 },
    archetype_clone:    { src: ST + 'archetype_clone.wav',    volume: 0.65, bus: 'cinema', jitter: 0.04, minInterval: 150 },
};

const SIGNATURE_STANDS = new Set(Object.keys(SFX_CONFIG).filter(k => SFX_CONFIG[k].src.startsWith(ST) && !k.startsWith('archetype_')));

// Skill type -> sound for stands without a signature
const ARCHETYPE_SKILL_SFX = {
    ricochet: 'archetype_bullet',
    blink_strike: 'archetype_slash',
    buff_atk: 'archetype_slash',
    hp_shield: 'archetype_shield',
    evasion: 'archetype_shield',
    revive: 'archetype_heal',
    heal: 'archetype_heal',
    aoe_heal: 'archetype_heal',
    regen: 'archetype_heal',
    mind_control: 'archetype_mind',
    damage_link: 'archetype_mind',
    mana_lock: 'archetype_mind',
    polymorph: 'archetype_mind',
    stun: 'archetype_mind',
    submerge: 'archetype_submerge',
    clone: 'archetype_clone',
    banish: 'Cream',
    time_stop: 'The World',
    return_to_zero: 'Gold Experience Requiem',
    execute: 'Killer Queen',
    pull: 'The Hand',
    swap: 'Sticky Fingers',
    global_slow: 'C-MOON',
    aoe_dot: 'Purple Haze',
    dot: "Magician's Red",
};

let isMuted = false;
try { isMuted = localStorage.getItem('gameSfxMuted') === 'true'; } catch (e) { isMuted = false; }

let ctx = null;
let masterGain, worldBus, cinemaBus, worldFilter;
const buffers = {};
const lastPlayTimes = {};
const activeVoices = {};
let timeStopped = false;

function buildGraph() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;

    masterGain = ctx.createGain();
    masterGain.gain.value = isMuted ? 0 : 0.9;

    worldFilter = ctx.createBiquadFilter();
    worldFilter.type = 'lowpass';
    worldFilter.frequency.value = 20000;
    worldFilter.Q.value = 0.8;

    worldBus = ctx.createGain();
    cinemaBus = ctx.createGain();

    worldBus.connect(worldFilter).connect(compressor);
    cinemaBus.connect(compressor);
    compressor.connect(masterGain).connect(ctx.destination);
    return true;
}

async function loadBuffer(key, url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return false;
        const data = await res.arrayBuffer();
        buffers[key] = await ctx.decodeAudioData(data);
        return true;
    } catch (e) {
        return false;
    }
}

// Files in /static/sounds/custom/ override built-in sounds by name, e.g. "The World.mp3"
async function loadCustomOverrides() {
    try {
        const res = await fetch('/api/custom_sounds', { cache: 'no-store' });
        if (!res.ok) return {};
        const files = await res.json();
        const map = {};
        const keysLower = Object.fromEntries(Object.keys(SFX_CONFIG).map(k => [k.toLowerCase(), k]));
        files.forEach(file => {
            const stem = file.replace(/\.[^.]+$/, '').toLowerCase();
            if (keysLower[stem]) map[keysLower[stem]] = `/static/sounds/custom/${encodeURIComponent(file)}`;
        });
        return map;
    } catch (e) {
        return {};
    }
}

/**
 * Create the audio graph and preload every sound.
 */
export async function initAudio() {
    updateSfxBtnUI();
    if (!buildGraph()) return;

    // Browsers start audio suspended until the first user gesture
    const unlock = () => { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(evt => window.addEventListener(evt, unlock, { passive: true }));

    const overrides = await loadCustomOverrides();
    const custom = Object.keys(overrides);
    if (custom.length) console.log(`[SFX] Using ${custom.length} custom sound(s):`, custom.join(', '));

    await Promise.all(Object.entries(SFX_CONFIG).map(async ([key, conf]) => {
        if (overrides[key] && await loadBuffer(key, overrides[key])) return;
        await loadBuffer(key, encodeURI(conf.src));
    }));
}

/**
 * Play a sound. opts: { volume, rate, pan (-1..1), bus }
 */
export function playSfx(name, opts = {}) {
    if (isMuted || !ctx) return;
    const conf = SFX_CONFIG[name];
    const buffer = buffers[name];
    if (!conf || !buffer) return;
    if (ctx.state !== 'running') return;

    const now = performance.now();
    if (conf.minInterval && now - (lastPlayTimes[name] || 0) < conf.minInterval) return;
    const maxVoices = conf.maxVoices || 2;
    if ((activeVoices[name] || 0) >= maxVoices) return;
    lastPlayTimes[name] = now;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const jitter = conf.jitter || 0;
    src.playbackRate.value = (opts.rate || 1) * (1 + (Math.random() * 2 - 1) * jitter);

    const gain = ctx.createGain();
    const volume = (typeof opts === 'number' ? opts : opts.volume) ?? conf.volume;
    gain.gain.value = volume * (1 - Math.random() * jitter * 0.8);

    let node = src.connect(gain);
    if (opts.pan && ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
        node = node.connect(panner);
    }
    node.connect((opts.bus || conf.bus) === 'world' ? worldBus : cinemaBus);

    activeVoices[name] = (activeVoices[name] || 0) + 1;
    src.onended = () => { activeVoices[name] = Math.max(0, (activeVoices[name] || 1) - 1); };
    src.start();
}

// Board x (canvas pixels) -> stereo pan
function panFromX(x) {
    if (typeof x !== 'number') return 0;
    return ((x / 540) * 2 - 1) * 0.7;
}

/**
 * Skill cast: the stand's own signature sound, else an archetype for the skill type.
 */
export function playStandSkillSfx(champName, skillType) {
    if (isMuted) return;
    const baseName = (champName || '').replace(/\s*\(CLONE\)$/i, '').trim();
    if (SIGNATURE_STANDS.has(baseName)) {
        playSfx(baseName);
        return;
    }
    const archetype = skillType && ARCHETYPE_SKILL_SFX[skillType];
    if (archetype) {
        playSfx(archetype);
        return;
    }
    playSfx('skill_cast');
}

/**
 * Basic attack landing: the attack style's sound (rush / blade / bullet / orb / strike)
 * layered with a heavy impact on crits, panned to where the hit lands.
 */
export function playStandAttackSfx(attackerName, isCrit, opts = {}) {
    if (isMuted) return;
    const pan = panFromX(opts.x);
    const style = opts.style || 'strike';
    playSfx(`attack_${style}`, { pan });
    if (isCrit) playSfx('hit_crit', { pan });
    else if (style === 'orb' || style === 'bullet') playSfx('hit_normal', { pan, volume: 0.3 });
}

export function playPositionalSfx(name, x) {
    playSfx(name, { pan: panFromX(x) });
}

/**
 * ZA WARUDO: muffle the combat world while time is stopped.
 */
export function setTimeStopped(stopped) {
    if (!ctx || stopped === timeStopped) return;
    timeStopped = stopped;
    const t = ctx.currentTime;
    worldFilter.frequency.cancelScheduledValues(t);
    worldFilter.frequency.setTargetAtTime(stopped ? 520 : 20000, t, stopped ? 0.06 : 0.18);
    worldBus.gain.cancelScheduledValues(t);
    worldBus.gain.setTargetAtTime(stopped ? 0.55 : 1, t, 0.1);
    if (!stopped) playSfx('time_resume');
}

export function toggleSfxMute() {
    isMuted = !isMuted;
    try { localStorage.setItem('gameSfxMuted', isMuted ? 'true' : 'false'); } catch (e) {}
    if (ctx && masterGain) {
        masterGain.gain.setTargetAtTime(isMuted ? 0 : 0.9, ctx.currentTime, 0.03);
    }
    updateSfxBtnUI();
    return isMuted;
}

export function isSfxMuted() {
    return isMuted;
}

export function updateSfxBtnUI() {
    const btn = document.getElementById('sfxMuteBtn');
    if (!btn) return;
    if (isMuted) {
        btn.classList.add('muted');
        btn.title = "Unmute Game SFX (Âm thanh: Đang Tắt)";
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
            </svg>
        `;
    } else {
        btn.classList.remove('muted');
        btn.title = "Mute Game SFX (Âm thanh: Đang Bật)";
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
        `;
    }
}

// For debugging in the browser console: (await import('/static/js/audio.js')).audioDebugInfo()
export function audioDebugInfo() {
    return {
        state: ctx ? ctx.state : 'no-audio',
        loaded: Object.keys(buffers).length,
        expected: Object.keys(SFX_CONFIG).length,
        missing: Object.keys(SFX_CONFIG).filter(k => !buffers[k]),
        timeStopped,
    };
}

export function listSfxKeys() {
    return Object.keys(SFX_CONFIG);
}
