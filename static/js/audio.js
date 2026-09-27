// static/js/audio.js
// High-performance Web Audio & JoJo Anime Stand SFX Manager for Auto Battler

const SFX_CONFIG = {
    // Core game UI sounds
    buy: { src: '/static/sounds/buy.wav', volume: 0.75, maxPool: 4, minInterval: 50 },
    sell: { src: '/static/sounds/sell.wav', volume: 0.75, maxPool: 3, minInterval: 50 },
    roll: { src: '/static/sounds/roll.wav', volume: 0.7, maxPool: 3, minInterval: 80 },
    levelup: { src: '/static/sounds/levelup.wav', volume: 0.9, maxPool: 2, minInterval: 200 },
    starup: { src: '/static/sounds/starup.wav', volume: 0.95, maxPool: 2, minInterval: 200 },
    battle_start: { src: '/static/sounds/battle_start.wav', volume: 0.9, maxPool: 2, minInterval: 500 },
    round_win: { src: '/static/sounds/round_win.wav', volume: 0.9, maxPool: 2, minInterval: 500 },
    round_lose: { src: '/static/sounds/round_lose.wav', volume: 0.85, maxPool: 2, minInterval: 500 },
    hit_normal: { src: '/static/sounds/hit_normal.wav', volume: 0.45, maxPool: 5, minInterval: 65 },
    hit_crit: { src: '/static/sounds/hit_crit.wav', volume: 0.65, maxPool: 4, minInterval: 85 },
    skill_cast: { src: '/static/sounds/skill_cast.wav', volume: 0.7, maxPool: 4, minInterval: 100 },
    death: { src: '/static/sounds/death.wav', volume: 0.6, maxPool: 3, minInterval: 120 },
    time_stop: { src: '/static/sounds/time_stop.wav', volume: 1.0, maxPool: 2, minInterval: 800 },

    // Iconic JoJo Stand SFX
    'The World': { src: '/static/sounds/stands/The World.wav', volume: 1.0, maxPool: 2, minInterval: 600 },
    'Star Platinum': { src: '/static/sounds/stands/Star Platinum.wav', volume: 0.9, maxPool: 2, minInterval: 500 },
    'Killer Queen': { src: '/static/sounds/stands/Killer Queen.wav', volume: 0.95, maxPool: 2, minInterval: 500 },
    'King Crimson': { src: '/static/sounds/stands/King Crimson.wav', volume: 0.95, maxPool: 2, minInterval: 600 },
    'Gold Experience Requiem': { src: '/static/sounds/stands/Gold Experience Requiem.wav', volume: 0.9, maxPool: 2, minInterval: 600 },
    'Gold Experience': { src: '/static/sounds/stands/Gold Experience.wav', volume: 0.85, maxPool: 2, minInterval: 500 },
    'Crazy Diamond': { src: '/static/sounds/stands/Crazy Diamond.wav', volume: 0.85, maxPool: 2, minInterval: 400 },
    'The Hand': { src: '/static/sounds/stands/The Hand.wav', volume: 0.9, maxPool: 2, minInterval: 400 },
    'Sticky Fingers': { src: '/static/sounds/stands/Sticky Fingers.wav', volume: 0.85, maxPool: 2, minInterval: 350 },
    'Aerosmith': { src: '/static/sounds/stands/Aerosmith.wav', volume: 0.8, maxPool: 2, minInterval: 350 },
    'Hierophant Green': { src: '/static/sounds/stands/Hierophant Green.wav', volume: 0.85, maxPool: 2, minInterval: 350 },
    'Magician\'s Red': { src: '/static/sounds/stands/Magician\'s Red.wav', volume: 0.85, maxPool: 2, minInterval: 400 },
    'Silver Chariot': { src: '/static/sounds/stands/Silver Chariot.wav', volume: 0.8, maxPool: 3, minInterval: 250 },
    'Sex Pistols': { src: '/static/sounds/stands/Sex Pistols.wav', volume: 0.8, maxPool: 3, minInterval: 250 },
    'Purple Haze': { src: '/static/sounds/stands/Purple Haze.wav', volume: 0.85, maxPool: 2, minInterval: 400 },
    'White Album': { src: '/static/sounds/stands/White Album.wav', volume: 0.85, maxPool: 2, minInterval: 400 },
    'Red Hot Chili Pepper': { src: '/static/sounds/stands/Red Hot Chili Pepper.wav', volume: 0.85, maxPool: 2, minInterval: 350 },
    'Bad Company': { src: '/static/sounds/stands/Bad Company.wav', volume: 0.85, maxPool: 2, minInterval: 350 },
    'Weather Report': { src: '/static/sounds/stands/Weather Report.wav', volume: 0.9, maxPool: 2, minInterval: 450 },
    'Cream': { src: '/static/sounds/stands/Cream.wav', volume: 0.9, maxPool: 2, minInterval: 450 },
    'Whitesnake': { src: '/static/sounds/stands/Whitesnake.wav', volume: 0.85, maxPool: 2, minInterval: 350 },
    'C-MOON': { src: '/static/sounds/stands/C-MOON.wav', volume: 0.9, maxPool: 2, minInterval: 500 },
    'Made in Heaven': { src: '/static/sounds/stands/Made in Heaven.wav', volume: 0.95, maxPool: 2, minInterval: 500 },

    // Archetype Stand SFX
    'archetype_slash': { src: '/static/sounds/stands/archetype_slash.wav', volume: 0.7, maxPool: 4, minInterval: 80 },
    'archetype_bullet': { src: '/static/sounds/stands/archetype_bullet.wav', volume: 0.7, maxPool: 4, minInterval: 80 },
    'archetype_shield': { src: '/static/sounds/stands/archetype_shield.wav', volume: 0.75, maxPool: 3, minInterval: 150 },
    'archetype_heal': { src: '/static/sounds/stands/archetype_heal.wav', volume: 0.75, maxPool: 3, minInterval: 150 },
    'archetype_mind': { src: '/static/sounds/stands/archetype_mind.wav', volume: 0.75, maxPool: 3, minInterval: 150 },
    'archetype_submerge': { src: '/static/sounds/stands/archetype_submerge.wav', volume: 0.75, maxPool: 3, minInterval: 150 },
    'archetype_clone': { src: '/static/sounds/stands/archetype_clone.wav', volume: 0.75, maxPool: 3, minInterval: 150 }
};

// Stand Signature Skill Map
const SIGNATURE_STAND_SFX = {
    'The World': 'The World',
    'Star Platinum': 'Star Platinum',
    'Killer Queen': 'Killer Queen',
    'King Crimson': 'King Crimson',
    'Gold Experience Requiem': 'Gold Experience Requiem',
    'Gold Experience': 'Gold Experience',
    'Crazy Diamond': 'Crazy Diamond',
    'The Hand': 'The Hand',
    'Sticky Fingers': 'Sticky Fingers',
    'Aerosmith': 'Aerosmith',
    'Hierophant Green': 'Hierophant Green',
    'Magician\'s Red': 'Magician\'s Red',
    'Silver Chariot': 'Silver Chariot',
    'Sex Pistols': 'Sex Pistols',
    'Purple Haze': 'Purple Haze',
    'White Album': 'White Album',
    'Red Hot Chili Pepper': 'Red Hot Chili Pepper',
    'Bad Company': 'Bad Company',
    'Weather Report': 'Weather Report',
    'Cream': 'Cream',
    'Whitesnake': 'Whitesnake',
    'C-MOON': 'C-MOON',
    'Made in Heaven': 'Made in Heaven',
};

// Skill type archetype mapping for all other stands
const ARCHETYPE_SKILL_SFX = {
    'ricochet': 'archetype_bullet',
    'blink_strike': 'archetype_slash',
    'buff_atk': 'archetype_slash',
    'hp_shield': 'archetype_shield',
    'heal': 'archetype_heal',
    'aoe_heal': 'archetype_heal',
    'regen': 'archetype_heal',
    'mind_control': 'archetype_mind',
    'damage_link': 'archetype_mind',
    'mana_lock': 'archetype_mind',
    'polymorph': 'archetype_mind',
    'submerge': 'archetype_submerge',
    'clone': 'archetype_clone',
    'banish': 'Cream',
    'time_stop': 'The World',
    'return_to_zero': 'Gold Experience Requiem',
    'execute': 'Killer Queen',
};

// Blade & Gun stands for attack sounds
const BLADE_STANDS = new Set([
    'Silver Chariot', 'Anubis', 'Clash', 'Chariot Requiem', 'Metallica'
]);
const GUN_STANDS = new Set([
    'Emperor', 'Sex Pistols', 'Aerosmith', 'Bad Company', 'Manhattan Transfer', 'Ratt'
]);

let isMuted = false;
try {
    isMuted = localStorage.getItem('gameSfxMuted') === 'true';
} catch (e) {
    isMuted = false;
}

const audioPool = {};
const lastPlayTimes = {};
let audioUnlocked = false;

/**
 * Preload all sound effects into an object pool.
 */
export function initAudio() {
    Object.keys(SFX_CONFIG).forEach(key => {
        const conf = SFX_CONFIG[key];
        audioPool[key] = [];
        lastPlayTimes[key] = 0;

        for (let i = 0; i < conf.maxPool; i++) {
            const audio = new Audio(conf.src);
            audio.preload = 'auto';
            audio.volume = conf.volume;
            audioPool[key].push(audio);
        }
    });

    // Browser audio unlock on first user gesture
    const unlockHandler = () => {
        if (audioUnlocked) return;
        audioUnlocked = true;
        const silent = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA');
        silent.play().catch(() => {});
        window.removeEventListener('pointerdown', unlockHandler);
        window.removeEventListener('keydown', unlockHandler);
    };
    window.addEventListener('pointerdown', unlockHandler, { once: true });
    window.addEventListener('keydown', unlockHandler, { once: true });

    updateSfxBtnUI();
}

/**
 * Play a specific sound effect with intelligent throttling and polyphony.
 */
export function playSfx(name, volumeOverride = null) {
    if (isMuted) return;
    const conf = SFX_CONFIG[name];
    if (!conf || !audioPool[name]) return;

    const now = performance.now();
    if (conf.minInterval && (now - lastPlayTimes[name] < conf.minInterval)) {
        return;
    }
    lastPlayTimes[name] = now;

    const pool = audioPool[name];
    let audio = pool.find(a => a.paused || a.ended);
    if (!audio) {
        audio = pool[0];
    }

    try {
        audio.currentTime = 0;
        audio.volume = (volumeOverride !== null ? volumeOverride : conf.volume);
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(() => {});
        }
    } catch (e) {}
}

/**
 * Play unique anime skill SFX according to Champion identity or Skill Type.
 */
export function playStandSkillSfx(champName, skillType) {
    if (isMuted) return;
    const baseName = (champName || '').replace(/\s*\(CLONE\)$/i, '').trim();

    // 1. Signature Stand sound
    if (SIGNATURE_STAND_SFX[baseName] && audioPool[SIGNATURE_STAND_SFX[baseName]]) {
        playSfx(SIGNATURE_STAND_SFX[baseName]);
        return;
    }

    // 2. Archetype skill sound
    if (skillType && ARCHETYPE_SKILL_SFX[skillType] && audioPool[ARCHETYPE_SKILL_SFX[skillType]]) {
        playSfx(ARCHETYPE_SKILL_SFX[skillType]);
        return;
    }

    // 3. Fallback generic skill cast
    playSfx('skill_cast');
}

/**
 * Play basic/crit attack sound customized by stand weapon type.
 */
export function playStandAttackSfx(attackerName, isCrit) {
    if (isMuted) return;
    const baseName = (attackerName || '').replace(/\s*\(CLONE\)$/i, '').trim();

    if (BLADE_STANDS.has(baseName)) {
        playSfx('archetype_slash');
    } else if (GUN_STANDS.has(baseName)) {
        playSfx('archetype_bullet');
    } else {
        playSfx(isCrit ? 'hit_crit' : 'hit_normal');
    }
}

/**
 * Toggle sound on or off.
 */
export function toggleSfxMute() {
    isMuted = !isMuted;
    try {
        localStorage.setItem('gameSfxMuted', isMuted ? 'true' : 'false');
    } catch (e) {}

    if (isMuted) {
        Object.keys(audioPool).forEach(key => {
            audioPool[key].forEach(a => {
                try { a.pause(); a.currentTime = 0; } catch (e) {}
            });
        });
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
