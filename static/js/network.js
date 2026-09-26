// static/js/network.js
import { STATE, CONFIG, CHAMPION_POOL, TRAITS_INFO } from './globals.js';
import { showNotification } from './notifications.js';
import { onMatchFoundVoice, closePeerConnection } from './voice.js';

export const socket = io();

// ==========================================
// SERVER EVENT LISTENERS
// ==========================================
socket.on('connect', () => {
    console.log('Connected to Server!');
});

socket.on('match_found', (data) => {
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

        const p1Label = document.getElementById('p1NameDisplay');
        const p2Label = document.getElementById('p2NameDisplay');
        if (p1Label) p1Label.innerText = STATE.bot1Name;
        if (p2Label) p2Label.innerText = STATE.bot2Name;

        const exitBtn = document.getElementById('exitMatchBtn');
        if (exitBtn) exitBtn.style.display = 'inline-block';

        const readyBtn = document.getElementById('readyBtn');
        if (readyBtn) readyBtn.style.display = 'none';

        const bottomBar = document.getElementById('bottomBar');
        if (bottomBar) bottomBar.style.display = 'none';

        const bvbTimer = document.getElementById('bvbTimerText');
        if (bvbTimer) {
            bvbTimer.style.display = 'inline-block';
            bvbTimer.innerText = "⏳ CHUẨN BỊ HIỆP 1: 10s";
        }

        const buyXpBtn = document.getElementById('buyXpBtn');
        if (buyXpBtn) buyXpBtn.style.display = 'none';
        const rollBtn = document.getElementById('rollBtn');
        if (rollBtn) rollBtn.style.display = 'none';

        showNotification(`🤖 ĐANG XEM: ${STATE.bot1Name} ⚔️ ${STATE.bot2Name}!`, "info");
        return;
    }

    if (STATE.champions && STATE.champions.length > 0) {
        STATE.champions.forEach(c => { c.team = STATE.myTeam; });
    }

    if (data.isBot) {
        showNotification(`🤖 Đang đấu với BOT (${data.opponentName})! (Voice chat 1-1 mở khi ghép với người)`, "info");
    } else {
        showNotification(`🎮 ĐÃ GHÉP NỐI 1-1 VỚI ${data.opponentName}! Voice Chat P2P sẵn sàng.`, "success");
    }

    // Initialize WebRTC voice chat connection for this match
    onMatchFoundVoice(data);

    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) readyBtn.style.display = 'inline-block';

    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'flex';

    startPrepTimer();
});

socket.on('opponent_disconnected', () => {
    showNotification("Opponent disconnected! Match cancelled.");
    closePeerConnection();
    STATE.isCombatPhase = false;
    STATE.myTeam = 'Team1';
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

    const botBtn = document.getElementById('vsBotBtn');
    if (botBtn) {
        botBtn.style.display = 'inline-block';
        botBtn.innerText = "VS BOT 🤖";
        botBtn.disabled = false;
    }

    const bvbBtn = document.getElementById('botVsBotBtn');
    if (bvbBtn) {
        bvbBtn.style.display = 'inline-block';
        bvbBtn.innerText = "BOT VS BOT 🤖⚔️🤖";
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
    showNotification("Both ready! 5s to inspect opponent!");
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
        }

        if (timeLeft <= 0) {
            clearInterval(prepTimerInterval);
            const readyBtn = document.getElementById('readyBtn');
            // FIX: Guard against auto-ready with 0 board units
            const boardUnits = STATE.champions.filter(c => c.targetY < 6).length;
            if (readyBtn && !readyBtn.disabled && boardUnits > 0) {
                readyBtn.click();
            } else if (boardUnits === 0) {
                showNotification("Timer expired — deploy at least 1 unit to submit!");
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
    clearInterval(combatTimerInterval);
    import('./combat.js').then(module => {
        module.handleCombatEnd(data || { result: 'draw' });
    });
});

socket.on('bvb_round_prep', (data) => {
    STATE.isCombatPhase = false;
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
            STATE.champions.push({
                id: c.id,
                name: c.name,
                team: c.team,
                star: c.star || 1,
                targetX: c.x,
                targetY: c.y,
                pixelX: c.x * 90,
                pixelY: c.y * 90,
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

    import('./shop.js').then(module => {
        module.updateSynergyUI();
    });

    const bvbTimer = document.getElementById('bvbTimerText');
    if (bvbTimer) {
        bvbTimer.style.display = 'inline-block';
        bvbTimer.innerText = `⏳ ROUND ${data.round} IN: 10s`;
    }
    showNotification(`🤖 Hiệp ${data.round}: ${STATE.bot1Name} ⚔️ ${STATE.bot2Name} (Chuẩn bị 10s)`, "info");
});

socket.on('bvb_countdown_tick', (data) => {
    const bvbTimer = document.getElementById('bvbTimerText');
    if (bvbTimer) {
        bvbTimer.style.display = 'inline-block';
        bvbTimer.innerText = `⏳ BẮT ĐẦU SAU: ${data.seconds}s`;
    }
});

socket.on('bvb_game_over', (data) => {
    showNotification(`🏆 TRẬN ĐẤU KẾT THÚC! ${data.winner} ĐÃ CHIẾN THẮNG CHUNG CUỘC!`, "success");
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
    const boardUnits = STATE.champions.filter(c => c.targetY < 6);
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
    const championsToSend = boardUnits.map(c => {
        const template = CHAMPION_POOL.find(t => t.name === c.name) || {};
        return {
            id:   c.id,
            name: c.name,
            star: c.star || 1,
            x:    c.targetX,
            y:    c.targetY,
            // Include traits so server can compute counts (no trust needed, server validates from its own data)
            traits: template.traits || [],
        };
    });

    socket.emit('submit_board', {
        room:      STATE.roomId,
        champions: championsToSend,
        lp:        STATE.playerLP
    });
}