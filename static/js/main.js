// static/js/main.js
import { CONFIG, STATE, getCanvasCoords } from './globals.js';
import { buyXp, refreshShop, updateGold, updateUnitCount, sellChampion, showDisplayInfo, canEditBoard, isOwnUnit } from './shop.js';
import { renderBoard } from './renderer.js';
import { updatePhysics } from './combat.js';
import { showNotification } from './notifications.js';
import { findMatch, playVsBot, playBotVsBot, leaveMatch, declareReady } from './network.js';
import { initVoiceChat } from './voice.js';
import { initStatsPanel, switchRightTab } from './stats.js';
import { initAudio, playSfx, toggleSfxMute } from './audio.js';

const canvas = document.getElementById('gameBoard');
const ctx = canvas.getContext('2d');

initStatsPanel();

// ==========================================
// REGISTER UI BUTTON EVENTS
// ==========================================
document.getElementById('buyXpBtn').addEventListener('click', buyXp);
document.getElementById('findMatchBtn').addEventListener('click', findMatch);
document.getElementById('vsBotBtn')?.addEventListener('click', playVsBot);
document.getElementById('botVsBotBtn')?.addEventListener('click', playBotVsBot);
document.getElementById('exitMatchBtn')?.addEventListener('click', leaveMatch);
document.getElementById('readyBtn').addEventListener('click', declareReady);

function rollShop() {
    if (!canEditBoard()) {
        showNotification(STATE.isRoundReview ? "Wait for the round review to finish!" : "Cannot roll during combat!");
        return;
    }
    if (STATE.playerGold >= 1) {
        updateGold(-1);
        refreshShop();
        playSfx('roll');
    } else {
        showNotification("Not enough gold!", "error");
    }
}
document.getElementById('rollBtn').addEventListener('click', rollShop);

document.getElementById('sfxMuteBtn')?.addEventListener('click', toggleSfxMute);

// ==========================================
// DRAG AND DROP & HOVER SYSTEM
// ==========================================
let isDragging = false;
let draggedChamp = null;
let originalX = null;
let originalY = null;
let hoveredChamp = null; // Hovered champion tracker

// Calculate accurate canvas coordinates during CSS scaling
function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = evt.clientX;
    let clientY = evt.clientY;

    if (evt.touches && evt.touches.length > 0) {
        clientX = evt.touches[0].clientX;
        clientY = evt.touches[0].clientY;
    } else if (evt.changedTouches && evt.changedTouches.length > 0) {
        clientX = evt.changedTouches[0].clientX;
        clientY = evt.changedTouches[0].clientY;
    }

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
        rawX: clientX,
        rawY: clientY
    };
}

const sellZone = document.getElementById('sellZone');
const bottomBar = document.getElementById('bottomBar');

function pointInRect(x, y, el) {
    if (!el || el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function isOverSellTarget(rawX, rawY) {
    return pointInRect(rawX, rawY, sellZone) || pointInRect(rawX, rawY, bottomBar);
}

function setSellHighlight(active) {
    if (sellZone) sellZone.classList.toggle('active', active);
    if (bottomBar) bottomBar.classList.toggle('sell-hover', active);
}

// Board cell under the pointer while dragging (drawn by the renderer as a drop target)
function updateDragCell(mP) {
    const rect = canvas.getBoundingClientRect();
    if (isOverSellTarget(mP.rawX, mP.rawY) ||
        mP.rawX < rect.left || mP.rawX > rect.right || mP.rawY < rect.top || mP.rawY > rect.bottom) {
        STATE.dragCell = null;
        return;
    }
    let gx, gy;
    if (mP.y < CONFIG.BENCH_START_Y) {
        gx = Math.max(0, Math.min(CONFIG.BOARD_COLS - 1, Math.floor(mP.x / CONFIG.BOARD_CELL_WIDTH)));
        gy = Math.max(3, Math.min(CONFIG.BOARD_ROWS - 1, Math.floor(mP.y / CONFIG.BOARD_CELL_HEIGHT)));
    } else {
        gx = Math.max(0, Math.min(CONFIG.BENCH_SLOTS - 1, Math.floor(mP.x / CONFIG.BENCH_CELL_WIDTH)));
        gy = 6;
    }
    let valid = true;
    if (gy < 6 && originalY === 6) {
        const occupant = STATE.champions.find(c => c !== draggedChamp && isOwnUnit(c) && c.targetX === gx && c.targetY === gy);
        const onBoard = STATE.champions.filter(c => isOwnUnit(c) && c.targetY < 6 && c !== draggedChamp && c !== occupant).length;
        valid = onBoard < STATE.playerLevel;
    }
    STATE.dragCell = { gx, gy, valid };
}

function endDragUi() {
    STATE.dragCell = null;
    isDragging = false;
    draggedChamp = null;
    if (sellZone) sellZone.style.display = 'none';
    setSellHighlight(false);
    if (bottomBar) bottomBar.classList.remove('sell-armed');
}

// Snap a dragged unit back where it came from (combat started, dropped off-canvas, ...)
function cancelDrag() {
    if (isDragging && draggedChamp) {
        draggedChamp.targetX = originalX;
        draggedChamp.targetY = originalY;
    }
    endDragUi();
}
window.addEventListener('wa:cancel-drag', cancelDrag);

// 1. POINTER DOWN (Start drag)
function handlePointerDown(e) {
    const mP = getMousePos(e);
    let touchedChamp = null;

    for (let i = STATE.champions.length - 1; i >= 0; i--) {
        const champ = STATE.champions[i];
        const size = getCanvasCoords(champ.targetX, champ.targetY);
        const drawX = champ.pixelX !== undefined ? champ.pixelX : size.x;
        const drawY = champ.pixelY !== undefined ? champ.pixelY : size.y;

        if (mP.x >= drawX && mP.x <= drawX + size.w &&
            mP.y >= drawY && mP.y <= drawY + size.h) {
            touchedChamp = champ;
            break;
        }
    }

    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

    if (touchedChamp) {
        const isMyChamp = touchedChamp.team === (STATE.myTeam || 'Team1');

        if (canEditBoard() && isMyChamp && isOwnUnit(touchedChamp)) {
            // ONLY drag own champions!
            isDragging = true;
            draggedChamp = touchedChamp;
            originalX = touchedChamp.targetX;
            originalY = touchedChamp.targetY;
            touchedChamp.startPixelX = touchedChamp.pixelX;
            touchedChamp.startPixelY = touchedChamp.pixelY;

            if (sellZone && isTouchDevice) sellZone.style.display = 'block';
            if (bottomBar) bottomBar.classList.add('sell-armed');
        } else {
            // Enemy champion OR combat phase: ALWAYS inspect info!
            hoveredChamp = touchedChamp;
            STATE.inspectedChampId = touchedChamp.id;
            showDisplayInfo('champ', touchedChamp);
            if (isTouchDevice) {
                const infoPanel = document.getElementById('infoPanel');
                if (infoPanel) {
                    infoPanel.classList.add('show');
                    const rightSidePanel = document.getElementById('rightSidePanel');
                    const panelBackdrop = document.getElementById('panelBackdrop');
                    if (rightSidePanel) rightSidePanel.classList.remove('show');
                    if (panelBackdrop) panelBackdrop.classList.remove('show');
                }
            }
        }
    } else {
        if (isTouchDevice) {
            hoveredChamp = null;
            STATE.inspectedChampId = null;
            const infoPanel = document.getElementById('infoPanel');
            if (infoPanel) infoPanel.classList.remove('show');
            showDisplayInfo(null);
        }
    }
}
canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('touchstart', (e) => {
    handlePointerDown(e);
    if (isDragging) e.preventDefault();
}, { passive: false });

// 2. POINTER MOVE (Drag champion & inspect info)
function handlePointerMove(e) {
    const mP = getMousePos(e);

    if (isDragging && draggedChamp) {
        if (e.type === 'touchmove') e.preventDefault(); // Prevent page scroll when dragging champion

        const size = getCanvasCoords(draggedChamp.targetX, draggedChamp.targetY);
        draggedChamp.pixelX = mP.x - size.w / 2;
        draggedChamp.pixelY = mP.y - size.h / 2;

        setSellHighlight(isOverSellTarget(mP.rawX, mP.rawY));
        updateDragCell(mP);
    } else {
        const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
        if (isTouchDevice) {
            // Touch devices don't have cursor hover; inspection is explicit on tap.
            // Do NOT overwrite or wipe hoveredChamp on phantom move events!
            return;
        }

        let foundHover = null;
        for (let i = STATE.champions.length - 1; i >= 0; i--) {
            const champ = STATE.champions[i];
            const size = getCanvasCoords(champ.targetX, champ.targetY);
            const cX = champ.pixelX !== undefined ? champ.pixelX : size.x;
            const cY = champ.pixelY !== undefined ? champ.pixelY : size.y;
            if (mP.x >= cX && mP.x <= cX + size.w &&
                mP.y >= cY && mP.y <= cY + size.h) {
                foundHover = champ;
                break;
            }
        }
        if (foundHover) {
            hoveredChamp = foundHover;
            STATE.inspectedChampId = foundHover.id;
            showDisplayInfo('champ', foundHover);
        } else {
            // In prep phase, clear inspection on mouseout.
            // In combat or review phase, keep showing the active champion so the user can watch their live stats!
            if (!STATE.isCombatPhase && !STATE.isRoundReview) {
                hoveredChamp = null;
                STATE.inspectedChampId = null;
                showDisplayInfo(null);
            }
        }
    }
}
canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('touchmove', handlePointerMove, { passive: false });

// 3. POINTER UP (Drop champion onto grid)
function handlePointerUp(e) {
    if (isDragging && draggedChamp) {
        const mP = getMousePos(e);

        const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
        const dragDist = Math.hypot(
            (draggedChamp.pixelX || 0) - (draggedChamp.startPixelX || 0),
            (draggedChamp.pixelY || 0) - (draggedChamp.startPixelY || 0)
        );

        // Sell: dropped (intentionally, > 30px) on the SELL zone or on the shop bar
        if (dragDist > 30 && isOverSellTarget(mP.rawX, mP.rawY)) {
            const toSell = draggedChamp;
            toSell.targetX = originalX;
            toSell.targetY = originalY;
            endDragUi();
            sellChampion(toSell);
            hoveredChamp = null;
            showDisplayInfo(null);
            return;
        }

        // Released outside the board canvas: snap back
        const rect = canvas.getBoundingClientRect();
        if (mP.rawX < rect.left || mP.rawX > rect.right || mP.rawY < rect.top || mP.rawY > rect.bottom) {
            cancelDrag();
            return;
        }

        let gridX, gridY;
        if (mP.y < CONFIG.BENCH_START_Y) {
            gridX = Math.max(0, Math.min(CONFIG.BOARD_COLS - 1, Math.floor(mP.x / CONFIG.BOARD_CELL_WIDTH)));
            gridY = Math.max(0, Math.min(CONFIG.BOARD_ROWS - 1, Math.floor(mP.y / CONFIG.BOARD_CELL_HEIGHT)));
            if (gridY < 3) gridY = 3;
        } else {
            gridX = Math.max(0, Math.min(CONFIG.BENCH_SLOTS - 1, Math.floor(mP.x / CONFIG.BENCH_CELL_WIDTH)));
            gridY = 6;
        }

        const occupied = STATE.champions.find(c =>
            c !== draggedChamp && isOwnUnit(c) && c.targetX === gridX && c.targetY === gridY
        );

        if (gridY < 6 && originalY === 6) {
            // FIX: swapping a bench unit with a board unit keeps the board count the
            // same, so the displaced unit must not count toward the limit
            const currentOnBoard = STATE.champions.filter(c =>
                isOwnUnit(c) && c.targetY < 6 && c !== draggedChamp && c !== occupied
            ).length;
            if (currentOnBoard >= STATE.playerLevel) {
                showNotification("Board limit reached! Level up to deploy more.", "error");
                gridX = originalX;
                gridY = originalY;
            }
        }

        if (occupied && !(gridX === originalX && gridY === originalY)) {
            occupied.targetX = originalX;
            occupied.targetY = originalY;
            occupied.originalX = originalX;
            occupied.originalY = originalY;
        }

        draggedChamp.targetX = gridX;
        draggedChamp.targetY = gridY;
        draggedChamp.originalX = gridX;
        draggedChamp.originalY = gridY;
        draggedChamp.popT = 16;
        if (occupied) occupied.popT = 12;

        // Tap inspection on mobile if barely moved (< 20px)
        if (isTouchDevice && dragDist < 20) {
            hoveredChamp = draggedChamp;
            showDisplayInfo('champ', draggedChamp);
            const infoPanel = document.getElementById('infoPanel');
            if (infoPanel) {
                infoPanel.classList.add('show');
                const rightSidePanel = document.getElementById('rightSidePanel');
                const panelBackdrop = document.getElementById('panelBackdrop');
                if (rightSidePanel) rightSidePanel.classList.remove('show');
                if (panelBackdrop) panelBackdrop.classList.remove('show');
            }
        }

        endDragUi();
        updateUnitCount();
    }
}
// Listen on window so a drop outside the canvas (e.g. on the shop bar) still ends the drag
window.addEventListener('mouseup', handlePointerUp);
window.addEventListener('touchend', handlePointerUp);
window.addEventListener('mousemove', (e) => {
    if (isDragging && e.target !== canvas) handlePointerMove(e);
});
window.addEventListener('touchmove', (e) => {
    if (isDragging && e.target !== canvas) handlePointerMove(e);
}, { passive: false });

// ==========================================
// MOBILE UI CONTROLS & MODALS (TFT Mobile Style)
// ==========================================
function setupMobileUi() {
    const infoPanel = document.getElementById('infoPanel');
    const rightSidePanel = document.getElementById('rightSidePanel');
    const panelBackdrop = document.getElementById('panelBackdrop');
    const closeRightPanelBtn = document.getElementById('closeRightPanelBtn');
    const closeInfoPanelBtn = document.getElementById('closeInfoPanelBtn');

    function closeRightDrawer() {
        if (rightSidePanel) rightSidePanel.classList.remove('show');
        if (panelBackdrop) panelBackdrop.classList.remove('show');
    }

    function openRightDrawer(tabName) {
        switchRightTab(tabName);
        if (rightSidePanel) rightSidePanel.classList.add('show');
        if (panelBackdrop) panelBackdrop.classList.add('show');
        if (infoPanel) infoPanel.classList.remove('show');
    }

    document.getElementById('toggleSynergyBtn')?.addEventListener('click', () => {
        const isShowing = rightSidePanel?.classList.contains('show');
        const isSynergyActive = document.getElementById('tabBtnSynergy')?.classList.contains('active');
        if (isShowing && isSynergyActive) {
            closeRightDrawer();
        } else {
            openRightDrawer('synergies');
        }
    });

    document.getElementById('toggleStatsBtn')?.addEventListener('click', () => {
        const isShowing = rightSidePanel?.classList.contains('show');
        const isStatsActive = document.getElementById('tabBtnStats')?.classList.contains('active');
        if (isShowing && isStatsActive) {
            closeRightDrawer();
        } else {
            openRightDrawer('stats');
        }
    });

    closeRightPanelBtn?.addEventListener('click', closeRightDrawer);
    closeInfoPanelBtn?.addEventListener('click', () => {
        STATE.inspectedChampId = null;
        hoveredChamp = null;
        showDisplayInfo(null);
        if (infoPanel) infoPanel.classList.remove('show');
    });

    panelBackdrop?.addEventListener('click', () => {
        closeRightDrawer();
        STATE.inspectedChampId = null;
        hoveredChamp = null;
        showDisplayInfo(null);
        if (infoPanel) infoPanel.classList.remove('show');
    });

    document.getElementById('toggleInfoBtn')?.addEventListener('click', () => {
        if (infoPanel) {
            infoPanel.classList.toggle('show');
            if (infoPanel.classList.contains('show')) {
                closeRightDrawer();
            }
        }
    });

    // Mobile Settings & Modes Modal
    const mobileMenuModal = document.getElementById('mobileMenuModal');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const closeMenuModalBtn = document.getElementById('closeMenuModalBtn');
    const menuModalBackdrop = document.getElementById('menuModalBackdrop');
    const mobileNameInput = document.getElementById('mobileNameInput');
    const playerNameInput = document.getElementById('playerNameInput');
    const modalVsBotBtn = document.getElementById('modalVsBotBtn');
    const modalBotVsBotBtn = document.getElementById('modalBotVsBotBtn');
    const modalLeaveBtn = document.getElementById('modalLeaveBtn');
    const modalLeaveSection = document.getElementById('modalLeaveSection');
    const modalSfxBtn = document.getElementById('modalSfxBtn');
    const modalMicBtn = document.getElementById('modalMicBtn');
    const modalAudioBtn = document.getElementById('modalAudioBtn');

    function openMobileMenu() {
        if (!mobileMenuModal) return;
        if (mobileNameInput && playerNameInput) {
            mobileNameInput.value = playerNameInput.value;
        }
        if (modalLeaveSection) {
            modalLeaveSection.style.display = STATE.roomId ? 'block' : 'none';
        }
        mobileMenuModal.style.display = 'flex';
    }

    function closeMobileMenu() {
        if (mobileMenuModal) mobileMenuModal.style.display = 'none';
    }

    mobileMenuBtn?.addEventListener('click', openMobileMenu);
    closeMenuModalBtn?.addEventListener('click', closeMobileMenu);
    menuModalBackdrop?.addEventListener('click', closeMobileMenu);

    mobileNameInput?.addEventListener('input', () => {
        if (playerNameInput) {
            playerNameInput.value = mobileNameInput.value;
            playerNameInput.dispatchEvent(new Event('input'));
        }
    });

    modalVsBotBtn?.addEventListener('click', () => {
        closeMobileMenu();
        playVsBot();
    });

    modalBotVsBotBtn?.addEventListener('click', () => {
        closeMobileMenu();
        playBotVsBot();
    });

    modalLeaveBtn?.addEventListener('click', () => {
        closeMobileMenu();
        leaveMatch();
    });

    modalSfxBtn?.addEventListener('click', () => {
        const isMuted = toggleSfxMute();
        modalSfxBtn.innerText = isMuted ? '🔇 SFX: OFF' : '🔊 SFX: ON';
        modalSfxBtn.classList.toggle('muted', isMuted);
    });

    modalMicBtn?.addEventListener('click', () => {
        const micBtn = document.getElementById('voiceMicBtn');
        if (micBtn) {
            micBtn.click();
            const isMuted = micBtn.classList.contains('muted');
            modalMicBtn.innerText = isMuted ? '🎤 Mic: OFF' : '🎤 Mic: ON';
            modalMicBtn.classList.toggle('muted', isMuted);
        }
    });

    modalAudioBtn?.addEventListener('click', () => {
        const audioBtn = document.getElementById('voiceAudioBtn');
        if (audioBtn) {
            audioBtn.click();
            const isDeafened = audioBtn.classList.contains('deafened');
            modalAudioBtn.innerText = isDeafened ? '🎧 Audio: OFF' : '🎧 Audio: ON';
            modalAudioBtn.classList.toggle('muted', isDeafened);
        }
    });
}
setupMobileUi();

// 4. RIGHT CLICK (Sell champion on desktop only)
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!canEditBoard()) return;

    // Mobile long-press triggers contextmenu — NEVER sell on touch devices!
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (isTouchDevice) return;

    const mP = getMousePos(e);
    const clickedChamp = STATE.champions.find(champ => {
        const size = getCanvasCoords(champ.targetX, champ.targetY);
        return isOwnUnit(champ) &&
            mP.x >= champ.pixelX && mP.x <= champ.pixelX + size.w &&
            mP.y >= champ.pixelY && mP.y <= champ.pixelY + size.h;
    });

    if (clickedChamp) {
        sellChampion(clickedChamp);
        // Reset info panel after selling
        hoveredChamp = null;
        showDisplayInfo(null);
    }
});

// 5. RESET HOVER ON CANVAS LEAVE
canvas.addEventListener('mouseleave', () => {
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (isTouchDevice) return; // Touch devices don't have mouseleave
    if (!isDragging) {
        if (!STATE.isCombatPhase && !STATE.isRoundReview) {
            hoveredChamp = null;
            STATE.inspectedChampId = null;
            showDisplayInfo(null);
        }
    }
});

// ==========================================
// KEYBOARD SHORTCUTS (TFT style): D = reroll, F = level up, E = sell hovered unit
// ==========================================
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!bottomBar || bottomBar.style.display === 'none') return;

    const key = e.key.toLowerCase();
    if (key === 'd') {
        rollShop();
    } else if (key === 'f') {
        buyXp();
    } else if (key === 'e') {
        const target = (isDragging && draggedChamp) ? draggedChamp : hoveredChamp;
        if (target && isOwnUnit(target)) {
            if (isDragging) cancelDrag();
            sellChampion(target);
            hoveredChamp = null;
            STATE.inspectedChampId = null;
            showDisplayInfo(null);
        }
    }
});

// ==========================================
// RENDER LOOP (GAME LOOP)
// ==========================================
function animationLoop() {
    // Hit-stop: freeze the simulation for a few frames on big impacts (keep rendering)
    if (STATE.hitStop > 0) STATE.hitStop--;
    else updatePhysics();
    renderBoard(ctx, canvas);

    // Keep info panel updated in real-time continuously
    if (STATE.inspectedChampId) {
        const liveChamp = STATE.champions.find(c => c.id === STATE.inspectedChampId);
        if (liveChamp) {
            showDisplayInfo('champ', liveChamp);
        }
    }

    requestAnimationFrame(animationLoop);
}

// ==========================================
// PERSISTENT PLAYER NAME & MATCH CONTROLS
// ==========================================
const nameInput = document.getElementById('playerNameInput');
if (nameInput) {
    const savedName = localStorage.getItem('savedPlayerName');
    if (savedName && savedName.trim() !== '') {
        nameInput.value = savedName.trim();
    }
    nameInput.addEventListener('input', () => {
        const val = nameInput.value.trim();
        if (val) {
            try { localStorage.setItem('savedPlayerName', val); } catch (e) {}
        }
    });
}

// Clean up legacy auto-find match flag so it NEVER auto-clicks Find Match
sessionStorage.removeItem('autoFindMatch');

// Check if user explicitly clicked "Play Again with Bot"
if (sessionStorage.getItem('autoPlayBot') === 'true') {
    sessionStorage.removeItem('autoPlayBot');
    const vsBotBtn = document.getElementById('vsBotBtn');
    if (vsBotBtn) {
        setTimeout(() => {
            vsBotBtn.click();
        }, 500);
    }
}

// Initialize Voice Chat Controls & VU Meter
initVoiceChat();

// Initialize Game Sound Effects System
initAudio();

// Launch game
refreshShop();
updateUnitCount();

// Shop bar stays hidden until a match is found
const bb = document.getElementById('bottomBar');
if (bb) bb.style.display = 'none';

animationLoop();