// static/js/network.js
import { STATE, CHAMPION_POOL, getCanvasCoords } from './globals.js';
import { resetPlayerForNewMatch, updateSynergies } from './shop.js';
import { showNotification } from './notifications.js';
import { onMatchFoundVoice, closePeerConnection } from './voice.js';
import { playSfx } from './audio.js';
import { showBigBanner } from './fx.js';

export const socket = io();

// ==========================================
// SERVER EVENT LISTENERS
// ==========================================
socket.on('connect', () => {
    console.log('Connected to Server!');
});

socket.on('champions_updated', async (data) => {
    console.log('[SOCKET] champions_updated received:', data);
    try {
        const { reloadChampionPool } = await import('./entities.js');
        await reloadChampionPool(true);
        showNotification('📊 Champion data synced from Google Drive!', 'info');
    } catch (e) {
        console.warn('Failed to handle champions_updated:', e);
    }
});

socket.on('match_found', (data) => {
    // FIX: a new match (e.g. after the opponent left) used to keep the previous
    // match's gold, level, round, bench and running timers
    stopPrepTimer();
    clearInterval(combatTimerInterval);
    import('./combat.js').then(module => module.cancelRoundReview && module.cancelRoundReview());
    resetPlayerForNewMatch();
    STATE.myPlayerPrefix = null;

    STATE.roomId = data.room;
    STATE.playerLP = 0;
    STATE.botLP = 0;
    STATE.isBotVsBot = !!data.isBotVsBot;
    STATE.myTeam = data.your_team || (data.isInitiator === false ? 'Team2' : 'Team1');

    const pText = document.getElementById('playerLpText');
    const bText = document.getElementById('botLpText');
    if (pText) pText.innerText = "0/10";
    if (bText) bText.innerText = "0/10";

    const findBtn = document.getElementById('findMatchBtn');
    if (findBtn) findBtn.style.display = 'none';

    const botBtn = document.getElementById('vsBotBtn');
    if (botBtn) botBtn.style.display = 'none';

    const bvbBtn = document.getElementById('botVsBotBtn');
    if (bvbBtn) bvbBtn.style.display = 'none';

    if (data.isBotVsBot) {
        STATE.bot1Name = data.playerName || 'Bot 1';
        STATE.bot2Name = data.opponentName || 'Bot 2';

        // Keep topbar displaying clean score only (no bot names)
        const pText = document.getElementById('playerLpText');
        const bText = document.getElementById('botLpText');
        if (pText) pText.innerText = "0/10";
        if (bText) bText.innerText = "0/10";

        const exitBtn = document.getElementById('exitMatchBtn');
        if (exitBtn) exitBtn.style.display = 'inline-block';

        const readyBtn = document.getElementById('readyBtn');
        if (readyBtn) readyBtn.style.display = 'none';

        const bottomBar = document.getElementById('bottomBar');
        if (bottomBar) bottomBar.style.display = 'none';

        const bvbTimer = document.getElementById('bvbTimerText');
        if (bvbTimer) {
            bvbTimer.style.display = 'inline-block';
            bvbTimer.innerText = "⏳ ROUND 1 IN: 10s";
        }

        const buyXpBtn = document.getElementById('buyXpBtn');
        if (buyXpBtn) buyXpBtn.style.display = 'none';
        const rollBtn = document.getElementById('rollBtn');
        if (rollBtn) rollBtn.style.display = 'none';

        showNotification(`🤖 SPECTATING: ${STATE.bot1Name} ⚔️ ${STATE.bot2Name}!`, "info");
        return;
    }

    if (STATE.champions && STATE.champions.length > 0) {
        STATE.champions.forEach(c => { c.team = STATE.myTeam; });
    }

    if (data.isBot) {
        showNotification(`🤖 Playing against BOT (${data.opponentName})!`, "info");
    } else {
        showNotification(`🎮 Matched 1v1 with ${data.opponentName}! Voice Chat ready.`, "success");
    }
    showBigBanner('ROUND 1', `VS ${data.opponentName || 'Opponent'}`, 'match');

    // Initialize WebRTC voice chat connection for this match
    onMatchFoundVoice(data);

    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) readyBtn.style.display = 'inline-block';

    const buyXpBtn = document.getElementById('buyXpBtn');
    if (buyXpBtn) buyXpBtn.style.display = '';
    const rollBtn = document.getElementById('rollBtn');
    if (rollBtn) rollBtn.style.display = '';

    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'flex';

    startPrepTimer();
});

socket.on('opponent_disconnected', () => {
    showNotification("Opponent left! Match cancelled.", "error");
    closePeerConnection();
    // FIX: stop every timer of the dead match (the prep timer kept auto-clicking READY)
    stopPrepTimer();
    clearInterval(combatTimerInterval);
    import('./combat.js').then(module => module.cancelRoundReview && module.cancelRoundReview());
    const timerText = document.getElementById('timerText');
    if (timerText) timerText.style.display = 'none';

    STATE.roomId = null;
    STATE.isCombatPhase = false;
    STATE.isRoundReview = false;
    STATE.myTeam = 'Team1';
    STATE.champions = [];
    STATE.activeProjectiles = [];
    STATE.hitEffects = [];

    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'none';

    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) {
        readyBtn.style.display = 'none';
        readyBtn.disabled = false;
        readyBtn.innerText = 'READY';
    }

    const findBtn = document.getElementById('findMatchBtn');
    if (findBtn) {
        findBtn.style.display = 'inline-block';
        findBtn.innerText = "FIND MATCH";
        findBtn.disabled = false;
    }

    const botBtn = document.getElementById('vsBotBtn');
    if (botBtn) {
        botBtn.style.display = 'inline-block';
        botBtn.innerText = "VS BOT";
        botBtn.disabled = false;
    }

    const bvbBtn = document.getElementById('botVsBotBtn');
    if (bvbBtn) {
        bvbBtn.style.display = 'inline-block';
        bvbBtn.innerText = "BOT VS BOT";
        bvbBtn.disabled = false;
    }

    const exitBtn = document.getElementById('exitMatchBtn');
    if (exitBtn) exitBtn.style.display = 'none';

    const bvbTimer = document.getElementById('bvbTimerText');
    if (bvbTimer) bvbTimer.style.display = 'none';

    const nameInput = document.getElementById('playerNameInput');
    if (nameInput) nameInput.disabled = false;
});

socket.on('match_locked', () => {
    STATE.isInspecting = true;
    if (STATE.isBotVsBot) {
        showNotification("🔒 Battlefield locked! Starting combat...", "info");
        const bvbTimer = document.getElementById('bvbTimerText');
        if (bvbTimer) {
            bvbTimer.innerText = "🔒 LOCKED - FIGHT!";
        }
    } else {
        showNotification("Both ready! 5s to inspect opponent!");
        const readyBtn = document.getElementById('readyBtn');
        if (readyBtn) readyBtn.innerText = "⚔️ BATTLE!";
    }
});

socket.on('opponent_ready', () => {
    showNotification("Opponent is READY!", "info");
});

socket.on('submit_rejected', (data) => {
    showNotification((data && data.reason) || "Board rejected by server!", "error");
    STATE.isCombatPhase = false;
    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) {
        readyBtn.innerText = "READY";
        readyBtn.disabled = false;
    }
    startPrepTimer();
});

let prepTimerInterval;

export function startPrepTimer() {
    clearInterval(prepTimerInterval);
    let timeLeft = 120;
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
            timerDisplay.classList.toggle('urgent', timeLeft <= 15);
        }
        const readyPulseBtn = document.getElementById('readyBtn');
        if (readyPulseBtn) readyPulseBtn.classList.toggle('pulse', timeLeft <= 15 && !readyPulseBtn.disabled);

        if (timeLeft <= 0) {
            clearInterval(prepTimerInterval);
            const readyBtn = document.getElementById('readyBtn');
            // FIX: Guard against auto-ready with 0 board units
            const boardUnits = STATE.champions.filter(c => c.targetY < 6 && c.originalX !== undefined).length;
            if (readyBtn && !readyBtn.disabled && boardUnits > 0) {
                readyBtn.click();
            } else if (boardUnits === 0) {
                showNotification("Timer expired — deploy at least 1 unit to submit!", "error");
            }
        }
    }, 1000);
}

export function stopPrepTimer() {
    clearInterval(prepTimerInterval);
    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
        timerDisplay.style.display = 'none';
        timerDisplay.classList.remove('urgent');
    }
    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) readyBtn.classList.remove('pulse');
}

let combatTimerInterval;

socket.on('combat_start', () => {
    STATE.isInspecting = false;
    showBigBanner('FIGHT!', '', 'fight');
    playSfx('battle_start');

    import('./stats.js').then(module => {
        module.resetDamageStatsForNewRound();
    });

    if (STATE.isBotVsBot) {
        const bvbTimer = document.getElementById('bvbTimerText');
        if (bvbTimer) {
            bvbTimer.innerText = "⚔️ BATTLE IN PROGRESS";
        }
    }

    let timeElapsed = 0;
    const timerText = document.getElementById('timerText');
    if (timerText) {
        timerText.innerText = '0s';
        timerText.style.display = 'inline';
    }

    clearInterval(combatTimerInterval);
    combatTimerInterval = setInterval(() => {
        timeElapsed++;
        if (timerText) timerText.innerText = `${timeElapsed}s`;
    }, 1000);
});

socket.on('sync_tick', (data) => {
    if (data && data.your_team) {
        STATE.myTeam = data.your_team;
    }
    import('./combat.js').then(module => {
        module.syncTickData(data);
    });
});

socket.on('combat_end', (data) => {
    STATE.isInspecting = false;
    clearInterval(combatTimerInterval);
    const timerText = document.getElementById('timerText');
    if (timerText) timerText.style.display = 'none';
    import('./combat.js').then(module => {
        module.handleCombatEnd(data || { result: 'draw' });
    });
});

socket.on('bvb_round_prep', (data) => {
    STATE.isInspecting = false;
    showBigBanner(`ROUND ${data.round || 1}`, `${data.bot1_name || 'Bot 1'}  VS  ${data.bot2_name || 'Bot 2'}`, 'match');
    STATE.isCombatPhase = false;
    STATE.isRoundReview = false;
    import('./combat.js').then(module => {
        if (module.cancelRoundReview) module.cancelRoundReview();
    });

    STATE.playerLP = data.p1_lp || 0;
    STATE.botLP = data.p2_lp || 0;
    STATE.currentRound = data.round || 1;
    STATE.bot1Name = data.bot1_name || STATE.bot1Name;
    STATE.bot2Name = data.bot2_name || STATE.bot2Name;

    const pText = document.getElementById('playerLpText');
    const bText = document.getElementById('botLpText');
    if (pText) pText.innerText = `${STATE.playerLP}/10`;
    if (bText) bText.innerText = `${STATE.botLP}/10`;

    const roundText = document.getElementById('roundText');
    if (roundText) roundText.innerText = data.round || 1;

    STATE.champions = [];
    if (data.champions) {
        data.champions.forEach(c => {
            const template = CHAMPION_POOL.find(t => t.name === c.name) || {};
            const coords = getCanvasCoords(c.x, c.y);
            STATE.champions.push({
                id: c.id,
                name: c.name,
                team: c.team,
                star: c.star || 1,
                targetX: c.x,
                targetY: c.y,
                // FIX: was c.x * 90 — cells are 108x130, units flew in from the wrong spot
                pixelX: coords.x,
                pixelY: coords.y,
                hp: c.hp,
                max_hp: c.max_hp,
                raw_hp: c.raw_hp,
                mana: c.mana || 0,
                max_mana: c.max_mana,
                attack: c.attack !== undefined ? c.attack : template.attack,
                base_attack: c.base_attack,
                speed: c.speed !== undefined ? c.speed : template.speed,
                base_speed: c.base_speed,
                attack_range: c.attack_range !== undefined ? c.attack_range : template.attack_range,
                raw_range: c.raw_range,
                skill: c.skill || template.skill,
                raw_skill: c.raw_skill,
                applied_traits: c.applied_traits || [],
                is_alive: true,
                shakeTimer: 0,
                buffs: [],
                buff_details: []
            });
        });
    }

    // FIX: updateSynergyUI() never existed (threw every BvB round); show bot 1's synergies
    updateSynergies(STATE.champions.filter(c => c.team === 'Team1'));

    const bvbTimer = document.getElementById('bvbTimerText');
    if (bvbTimer) {
        bvbTimer.style.display = 'inline-block';
        bvbTimer.innerText = `⏳ ROUND ${data.round} IN: 10s`;
    }
    showNotification(`🤖 Round ${data.round}: ${STATE.bot1Name} ⚔️ ${STATE.bot2Name} (10s Prep)`, "info");
});

socket.on('bvb_countdown_tick', (data) => {
    const bvbTimer = document.getElementById('bvbTimerText');
    if (bvbTimer) {
        bvbTimer.style.display = 'inline-block';
        if (data.seconds === 0) {
            bvbTimer.innerText = "⚔️ STARTING IN: 0s";
        } else {
            bvbTimer.innerText = `⏳ STARTING IN: ${data.seconds}s`;
        }
    }
});

socket.on('bvb_game_over', (data) => {
    import('./combat.js').then(module => {
        if (module.cancelRoundReview) module.cancelRoundReview();
    });
    showNotification(`🏆 MATCH OVER! ${data.winner} WON THE MATCH!`, "success");
    const bvbTimer = document.getElementById('bvbTimerText');
    if (bvbTimer) {
        bvbTimer.innerText = `🏆 WINNER: ${data.winner}`;
    }
});

socket.on('match_left', () => {
    location.reload();
});

// ==========================================
// CLIENT EMIT FUNCTIONS
// ==========================================
export function findMatch() {
    closePeerConnection();
    const nameInput = document.getElementById('playerNameInput');
    const pName = nameInput && nameInput.value.trim() !== "" ? nameInput.value.trim() : "Player";
    try { localStorage.setItem('savedPlayerName', pName); } catch (e) {}

    if (nameInput) nameInput.disabled = true;

    socket.emit('find_match', { name: pName, vs_bot: false });

    const btn = document.getElementById('findMatchBtn');
    if (btn) {
        btn.innerText = "SEARCHING...";
        btn.disabled = true;
    }
    const botBtn = document.getElementById('vsBotBtn');
    if (botBtn) {
        botBtn.disabled = true;
    }
}

export function playVsBot() {
    closePeerConnection();
    const nameInput = document.getElementById('playerNameInput');
    const pName = nameInput && nameInput.value.trim() !== "" ? nameInput.value.trim() : "Player";
    try { localStorage.setItem('savedPlayerName', pName); } catch (e) {}

    if (nameInput) nameInput.disabled = true;

    socket.emit('find_match', { name: pName, vs_bot: true });

    const btn = document.getElementById('findMatchBtn');
    if (btn) {
        btn.disabled = true;
    }
    const botBtn = document.getElementById('vsBotBtn');
    if (botBtn) {
        botBtn.innerText = "MATCHING...";
        botBtn.disabled = true;
    }
    const bvbBtn = document.getElementById('botVsBotBtn');
    if (bvbBtn) bvbBtn.disabled = true;
}

export function playBotVsBot() {
    closePeerConnection();
    const nameInput = document.getElementById('playerNameInput');
    const pName = nameInput && nameInput.value.trim() !== "" ? nameInput.value.trim() : "Spectator";
    try { localStorage.setItem('savedPlayerName', pName); } catch (e) {}

    if (nameInput) nameInput.disabled = true;

    socket.emit('find_match', { name: pName, vs_bot: false, bot_vs_bot: true });

    const btn = document.getElementById('findMatchBtn');
    if (btn) btn.disabled = true;
    const botBtn = document.getElementById('vsBotBtn');
    if (botBtn) botBtn.disabled = true;
    const bvbBtn = document.getElementById('botVsBotBtn');
    if (bvbBtn) {
        bvbBtn.innerText = "MATCHING BOTS...";
        bvbBtn.disabled = true;
    }
}

export function leaveMatch() {
    socket.emit('leave_match', { room: STATE.roomId });
    location.reload();
}

export function declareReady() {
    // FIX: Guard — refuse to submit with 0 units on the board
    if (!STATE.roomId || STATE.isCombatPhase || STATE.isRoundReview) return;
    const boardUnits = STATE.champions.filter(c => c.targetY < 6 && c.originalX !== undefined);
    if (boardUnits.length === 0) {
        showNotification("Deploy at least 1 unit before pressing READY!");
        return;
    }

    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) {
        readyBtn.innerText = "WAITING FOR OPPONENT...";
        readyBtn.disabled = true;
    }
    STATE.isCombatPhase = true;
    stopPrepTimer();
    // main.js owns drag state; importing it here would load a second copy (main.js?v=... URL)
    window.dispatchEvent(new Event('wa:cancel-drag'));

    // Assign a unique prefix so IDs never collide with opponent
    if (!STATE.myPlayerPrefix) {
        STATE.myPlayerPrefix = "p_" + Math.random().toString(36).substr(2, 6) + "_";
    }
    STATE.champions.forEach(c => {
        if (!c.id.toString().startsWith(STATE.myPlayerPrefix)) {
            c.id = STATE.myPlayerPrefix + c.id;
        }
    });

    // ---------------------------------------------------------------
    // FIX: Send ONLY raw identification data.
    // ALL stat/trait computation is now done server-side in app.py.
    // The server looks up base stats from its own champion registry,
    // applies trait buffs, then sends back the final values.
    // ---------------------------------------------------------------
    const championsToSend = boardUnits.map(c => ({
        id:   c.id,
        name: c.name,
        star: c.star || 1,
        x:    c.targetX,
        y:    c.targetY,
    }));

    socket.emit('submit_board', {
        room:      STATE.roomId,
        champions: championsToSend
    });
}