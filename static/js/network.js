// static/js/network.js
import { STATE, CONFIG, CHAMPION_POOL, TRAITS_INFO } from './globals.js';
import { showNotification } from './notifications.js';

export const socket = io();

// ==========================================
// CÁC SỰ KIỆN LẮNG NGHE TỪ SERVER
// ==========================================
socket.on('connect', () => {
    console.log('Connected to Server!');
});

socket.on('match_found', (data) => {
    STATE.roomId = data.room;
    STATE.playerLP = 0;
    STATE.botLP = 0;

    const pText = document.getElementById('playerLpText');
    const bText = document.getElementById('botLpText');
    if (pText) pText.innerText = "0/10";
    if (bText) bText.innerText = "0/10";

    showNotification(`Match found with ${data.opponentName}!`);

    const readyBtn = document.getElementById('readyBtn');
    if (readyBtn) readyBtn.style.display = 'inline-block';

    const findBtn = document.getElementById('findMatchBtn');
    if (findBtn) findBtn.style.display = 'none';

    const bottomBar = document.getElementById('bottomBar');
    if (bottomBar) bottomBar.style.display = 'flex';

    startPrepTimer();
});

socket.on('opponent_disconnected', () => {
    showNotification("Opponent disconnected! Match cancelled.");
    STATE.isCombatPhase = false;
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
    import('./combat.js').then(module => {
        module.syncTickData(data);
    });
});

socket.on('combat_end', (data) => {
    clearInterval(combatTimerInterval);
    import('./combat.js').then(module => {
        module.handleCombatEnd(data ? data.result : 'draw');
    });
});

// ==========================================
// CÁC HÀM GỬI LỆNH LÊN SERVER
// ==========================================
export function findMatch() {
    const nameInput = document.getElementById('playerNameInput');
    const pName = nameInput && nameInput.value.trim() !== "" ? nameInput.value : "Player";

    if (nameInput) nameInput.disabled = true;

    socket.emit('find_match', { name: pName });

    const btn = document.getElementById('findMatchBtn');
    if (btn) {
        btn.innerText = "SEARCHING...";
        btn.disabled = true;
    }
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