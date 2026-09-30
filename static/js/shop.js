// static/js/shop.js
import { CONFIG, STATE, CHAMPION_POOL, TRAITS_INFO } from './globals.js';
import { showNotification } from './notifications.js';
import { playSfx } from './audio.js';
import { animateGold, resetGoldDisplay, bumpElement } from './fx.js';

// ======================================================================
// FIX: CHAMPION POOL DEPLETION
// Fixed copy counts per cost tier (like real TFT).
// Pool is initialized once when champions are loaded, then depleted as
// cards are bought and replenished when sold or a new shop rolls.
// ======================================================================
const POOL_COUNTS = { 1: 30, 2: 20, 3: 15, 4: 10, 5: 5 };

// Tracks how many copies of each champion remain in the global pool
const _pool = {}; // { champName: copiesRemaining }

export const MAX_LEVEL = 9;
export const START_GOLD = 10;

// preserve=true keeps current depletion (used when the sheet is re-synced mid-match)
export function initChampPool(preserve = false) {
    const previous = { ..._pool };
    Object.keys(_pool).forEach(k => delete _pool[k]);
    CHAMPION_POOL.forEach(champ => {
        const max = POOL_COUNTS[champ.cost] ?? 30;
        _pool[champ.name] = (preserve && previous[champ.name] !== undefined)
            ? Math.min(max, previous[champ.name])
            : max;
    });
}

// Units the player owns (bought from the shop) as opposed to enemy / server-spawned ones
export function isOwnUnit(c) {
    return c.originalX !== undefined;
}

// Shop, bench and board can only be edited during a real preparation phase
export function canEditBoard() {
    return !!STATE.roomId && !STATE.isCombatPhase && !STATE.isRoundReview && !STATE.isBotVsBot;
}

function editBlockedReason() {
    if (STATE.isRoundReview) return "Wait for the round review to finish!";
    if (STATE.isCombatPhase) return "Cannot do that during combat!";
    return null;
}

// Same star scaling as the server (_compute_trait_buffs), used for display in prep phase
export function applyStarStats(champ) {
    const template = CHAMPION_POOL.find(t => t.name === champ.name);
    if (!template) return;
    const star = champ.star || 1;
    const statMult = 1.8 ** (star - 1);

    champ.max_hp = champ.hp = champ.raw_hp = Math.round(template.hp * statMult);
    champ.attack = champ.base_attack = champ.raw_attack = Math.round(template.attack * statMult);
    champ.speed = champ.base_speed = champ.raw_speed = template.speed;
    champ.attack_range = champ.raw_range = template.attack_range;
    champ.max_mana = template.max_mana;
    champ.mana = 0;
    champ.shield = 0;

    const skill = template.skill ? JSON.parse(JSON.stringify(template.skill)) : null;
    if (skill) {
        if (skill.power) skill.power = Math.round(skill.power * 1.6 ** (star - 1));
        if (skill.duration) skill.duration = parseFloat((skill.duration * 1.2 ** (star - 1)).toFixed(1));
        if (skill.radius) skill.radius = parseFloat((skill.radius * 1.2 ** (star - 1)).toFixed(1));
        if (skill.percent) skill.percent = Math.min(0.85, parseFloat((skill.percent * 1.3 ** (star - 1)).toFixed(2)));
    }
    champ.skill = skill;
    champ.raw_skill = skill ? JSON.parse(JSON.stringify(skill)) : null;
    champ.applied_traits = [];
    champ.buffs = [];
    champ.buff_details = [];
}

// Full reset of the player's economy / roster for a brand new match
export function resetPlayerForNewMatch() {
    STATE.playerGold = START_GOLD;
    STATE.playerLevel = 1;
    STATE.levelCost = 4;
    STATE.currentRound = 1;
    STATE.champions = [];
    STATE.activeProjectiles = [];
    STATE.hitEffects = [];
    STATE.particles = [];
    STATE.floatingTexts = [];
    STATE.isCombatPhase = false;
    STATE.isRoundReview = false;
    STATE.inspectedChampId = null;
    initChampPool();

    resetGoldDisplay(STATE.playerGold);
    const levelEl = document.getElementById('levelText');
    if (levelEl) levelEl.innerText = STATE.playerLevel;
    const roundEl = document.getElementById('roundText');
    if (roundEl) roundEl.innerText = STATE.currentRound;
    updateXpButton();
    refreshShop();
    updateUnitCount();
}

function updateXpButton() {
    const buyXpCostEl = document.getElementById('buyXpCost');
    if (buyXpCostEl) {
        buyXpCostEl.innerText = STATE.playerLevel >= MAX_LEVEL ? 'MAX' : `${STATE.levelCost} 🪙`;
    }
}

function _returnToPool(champName, count = 1) {
    const template = CHAMPION_POOL.find(t => t.name === champName);
    if (!template) return;
    const max = POOL_COUNTS[template.cost] ?? 30;
    _pool[champName] = Math.min(max, (_pool[champName] || 0) + count);
}

function _takeFromPool(champName) {
    if ((_pool[champName] || 0) <= 0) return false;
    _pool[champName]--;
    return true;
}

// ======================================================================
export function updateGold(amount) {
    STATE.playerGold += amount;
    animateGold(STATE.playerGold, amount);
    updateShopCardStates();
}

export function updateUnitCount() {
    const boardChamps = STATE.champions.filter(c => c.targetY < 6);
    const count = boardChamps.filter(isOwnUnit).length;
    const unitEl = document.getElementById('unitText');
    if (unitEl) unitEl.innerText = `${count}/${STATE.playerLevel}`;
    updateSynergies(boardChamps);
    updateShopCardStates();
}

// Refresh "owned xN", "will upgrade" and affordability hints on the visible shop cards
export function updateShopCardStates() {
    document.querySelectorAll('#shopContainer .shop-card[data-champ]').forEach(card => {
        const name = card.dataset.champ;
        const cost = Number(card.dataset.cost || 0);
        const owned = STATE.champions.filter(c => isOwnUnit(c) && c.name === name);
        const oneStarCopies = owned.filter(c => (c.star || 1) === 1).length;

        let badge = card.querySelector('.owned-badge');
        if (owned.length > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'owned-badge';
                card.appendChild(badge);
            }
            badge.innerText = `x${owned.length}`;
        } else if (badge) {
            badge.remove();
        }
        card.classList.toggle('will-upgrade', oneStarCopies >= 2);
        card.classList.toggle('too-expensive', STATE.playerGold < cost);
    });
}

// ======================================================================
// FIX: Level cost uses a linear formula instead of exponential doubling.
// Old: 5 → 10 → 20 → 40 → 80 (unreachable after lv 4)
// New: 4 → 8 → 12 → 16 → 20 → 24 (always reachable, scales with level)
// ======================================================================
export function buyXp() {
    const blocked = editBlockedReason();
    if (blocked) { showNotification(blocked); return; }
    if (STATE.playerLevel >= MAX_LEVEL) {
        showNotification(`Max level (${MAX_LEVEL}) reached!`);
        return;
    }

    if (STATE.playerGold >= STATE.levelCost) {
        updateGold(-STATE.levelCost);
        STATE.playerLevel++;
        STATE.levelCost = STATE.playerLevel * 4; // linear, same formula as the bot

        document.getElementById('levelText').innerText = STATE.playerLevel;
        bumpElement(document.querySelector('.level-display'));
        updateXpButton();

        updateUnitCount();
        playSfx('levelup');
        showNotification(`Level ${STATE.playerLevel} Reached! +1 Slot`);
    } else {
        showNotification(`Need ${STATE.levelCost} gold to level up!`);
    }
}

// ======================================================================
function checkAndMerge(champName, starLevel) {
    if (starLevel >= 3) return;
    // FIX: only merge the player's own units (enemy copies are on the board during review)
    const copies = STATE.champions.filter(c => isOwnUnit(c) && c.name === champName && (c.star || 1) === starLevel);
    if (copies.length >= 3) {
        // Prioritize the copy currently deployed on the board (y < 6)
        const targets = copies
            .map((c, i) => ({ c, i, onBoard: c.targetY < 6 ? 1 : 0 }))
            .sort((a, b) => (b.onBoard - a.onBoard) || (a.i - b.i))
            .slice(0, 3)
            .map(e => e.c);

        STATE.champions = STATE.champions.filter(c => !targets.includes(c));

        // Copies stay "out of the pool" while held — nothing to return on merge
        // (the upgraded unit returns all 3^(star-1) copies when it is sold)

        const upgraded = targets[0];
        upgraded.star = starLevel + 1;
        // FIX: recompute from the template instead of multiplying possibly
        // trait-buffed combat values (the info panel showed fake "Synergy" HP)
        applyStarStats(upgraded);
        upgraded.popT = 16;
        upgraded.castT = 18;

        STATE.champions.push(upgraded);
        playSfx('starup');
        showNotification(`Upgraded! [${champName}] is now ${upgraded.star} ⭐!`);
        checkAndMerge(champName, upgraded.star);
    }
}

export function buyChampion(champTemplate, cardElement) {
    const blocked = editBlockedReason();
    if (blocked) { showNotification(blocked); return false; }
    if (STATE.playerGold < champTemplate.cost) {
        showNotification("Not enough gold!", "error");
        return false;
    }

    let slot = null;
    for (let x = 0; x < CONFIG.BENCH_SLOTS; x++) {
        if (!STATE.champions.some(c => isOwnUnit(c) && c.targetX === x && c.targetY === 6)) {
            slot = { x, y: 6 };
            break;
        }
    }
    if (!slot) {
        // Bench full: still allow the buy when it completes a 3-copy merge (like TFT).
        // The new copy borrows an existing copy's cell and is consumed by the merge.
        const existing = STATE.champions.filter(c => isOwnUnit(c) && c.name === champTemplate.name && (c.star || 1) === 1);
        if (existing.length >= 2) {
            slot = { x: existing[0].targetX, y: existing[0].targetY };
        } else {
            showNotification("Bench is full!", "error");
            return false;
        }
    }

    // FIX: Deduct from pool — if the pool is empty for this champ, refuse purchase
    if (!_takeFromPool(champTemplate.name)) {
        showNotification(`No more copies of [${champTemplate.name}] available!`);
        return false;
    }

    updateGold(-champTemplate.cost);
    if (cardElement) {
        cardElement.style.pointerEvents = 'none';
        cardElement.classList.add('bought');
        setTimeout(() => { cardElement.style.visibility = 'hidden'; }, 280);
    }

    const unit = {
        id: Math.random().toString(36).slice(2, 11),
        name: champTemplate.name,
        team: STATE.myTeam || "Team1",
        star: 1,
        cost: champTemplate.cost,
        targetX: slot.x, targetY: slot.y,
        originalX: slot.x, originalY: slot.y,
        is_alive: true,
        shakeTimer: 0,
        traits: champTemplate.traits || [],
    };
    applyStarStats(unit);
    unit.popT = 16;
    STATE.champions.push(unit);

    checkAndMerge(champTemplate.name, 1);
    updateUnitCount();
    playSfx('buy');
    if (STATE.champions.includes(unit)) {
        showNotification(`Purchased [${champTemplate.name}] to bench! ⭐`);
    }
    return true;
}

// ======================================================================
function rollChampion() {
    const level = STATE.playerLevel || 1;
    const roll = Math.random() * 100;
    let targetCost = 1;

    if (level === 1) { targetCost = 1; }
    else if (level === 2) { targetCost = roll < 70 ? 1 : 2; }
    else if (level === 3) { targetCost = roll < 50 ? 1 : roll < 85 ? 2 : 3; }
    else if (level === 4) { targetCost = roll < 30 ? 1 : roll < 70 ? 2 : roll < 95 ? 3 : 4; }
    else if (level === 5) { targetCost = roll < 15 ? 1 : roll < 45 ? 2 : roll < 85 ? 3 : roll < 99 ? 4 : 5; }
    else { targetCost = roll < 10 ? 1 : roll < 25 ? 2 : roll < 55 ? 3 : roll < 80 ? 4 : 5; }

    // FIX: Filter pool to only champions that still have copies available
    const pool = CHAMPION_POOL.filter(c => c.cost === targetCost && (_pool[c.name] || 0) > 0);

    if (pool.length === 0) {
        // Fallback: any champion still available
        const fallback = CHAMPION_POOL.filter(c => (_pool[c.name] || 0) > 0);
        if (fallback.length === 0) return null;
        return fallback[Math.floor(Math.random() * fallback.length)];
    }

    return pool[Math.floor(Math.random() * pool.length)];
}

let selectedShopCard = null;

document.addEventListener('click', (e) => {
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 768;
    if (isTouchDevice && selectedShopCard) {
        if (!e.target.closest('.shop-card') && !e.target.closest('#infoPanel')) {
            selectedShopCard = null;
            document.querySelectorAll('.shop-card').forEach(c => {
                c.style.transform = '';
                if (c.dataset.origBorder) c.style.borderColor = c.dataset.origBorder;
            });
            showDisplayInfo(null);
            const infoPanel = document.getElementById('infoPanel');
            if (infoPanel) infoPanel.classList.remove('show');
        }
    }
});

let isShopDragScrollInitialized = false;

export function initShopDragScroll() {
    if (isShopDragScrollInitialized) return;
    const container = document.getElementById('shopContainer');
    if (!container) return;
    isShopDragScrollInitialized = true;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasMoved = false;

    // Mouse drag support for desktop & emulation
    container.addEventListener('mousedown', (e) => {
        isDown = true;
        hasMoved = false;
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
    });

    window.addEventListener('mouseup', () => {
        isDown = false;
    });

    container.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 4) hasMoved = true;
        container.scrollLeft = scrollLeft - walk;
    });

    // Touch swipe support with move threshold tracking
    let touchStartX = 0;
    let touchStartScroll = 0;
    let isTouchSwiping = false;

    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].pageX;
            touchStartScroll = container.scrollLeft;
            isTouchSwiping = false;
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            const touchX = e.touches[0].pageX;
            const diffX = touchX - touchStartX;
            if (Math.abs(diffX) > 6) {
                isTouchSwiping = true;
            }
            container.scrollLeft = touchStartScroll - diffX;
        }
    }, { passive: true });

    // Prevent triggering card click when user was swiping/dragging to scroll!
    container.addEventListener('click', (e) => {
        if (hasMoved || isTouchSwiping) {
            e.stopPropagation();
            hasMoved = false;
            isTouchSwiping = false;
        }
    }, true);
}

export function refreshShop() {
    selectedShopCard = null;
    const container = document.getElementById('shopContainer');
    if (!container) return;

    initShopDragScroll();
    container.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const randomChamp = rollChampion();
        if (!randomChamp) {
            // Pool is depleted — show empty slot
            const emptyCard = document.createElement('div');
            emptyCard.className = 'shop-card';
            emptyCard.style.opacity = '0.3';
            emptyCard.innerHTML = `<p style="text-align:center;margin-top:30px;">SOLD OUT</p>`;
            container.appendChild(emptyCard);
            continue;
        }

        const card = document.createElement('div');
        card.className = 'shop-card';
        card.dataset.champ = randomChamp.name;
        card.dataset.cost = randomChamp.cost;
        const traitsLine = (randomChamp.traits || []).join(' · ');
        card.innerHTML = `<h3>${randomChamp.name}</h3><img src="${randomChamp.img}" width="40" height="40" style="border-radius: 5px;"><p class="card-traits">${traitsLine}</p><p class="cost">${randomChamp.cost} 🪙</p>`;

        const colors = {
            1: { border: '#bdc3c7', bg: 'linear-gradient(to bottom, #2c3e50, #7f8c8d)' },
            2: { border: '#2ecc71', bg: 'linear-gradient(to bottom, #2c3e50, #27ae60)' },
            3: { border: '#3498db', bg: 'linear-gradient(to bottom, #2c3e50, #2980b9)' },
            4: { border: '#9b59b6', bg: 'linear-gradient(to bottom, #2c3e50, #8e44ad)' },
            5: { border: '#e67e22', bg: 'linear-gradient(to bottom, #2c3e50, #d35400)' }
        };
        const theme = colors[randomChamp.cost] || colors[1];
        card.style.border = `2px solid ${theme.border}`;
        card.style.background = theme.bg;
        card.dataset.origBorder = theme.border;

        card.onclick = (e) => {
            const isTouchDevice = window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 768;
            if (isTouchDevice) {
                if (selectedShopCard === card) {
                    const bought = buyChampion(randomChamp, card);
                    if (bought) {
                        selectedShopCard = null;
                        const infoPanel = document.getElementById('infoPanel');
                        if (infoPanel) infoPanel.classList.remove('show');
                    }
                } else {
                    document.querySelectorAll('.shop-card').forEach(c => {
                        c.style.transform = '';
                        if (c.dataset.origBorder) c.style.borderColor = c.dataset.origBorder;
                    });
                    selectedShopCard = card;
                    showDisplayInfo('champ', randomChamp, {
                        isShop: true,
                        cardElement: card,
                        champTemplate: randomChamp
                    });
                    card.style.transform = 'scale(1.05)';
                    card.style.borderColor = '#f1c40f';
                    const infoPanel = document.getElementById('infoPanel');
                    if (infoPanel && window.innerWidth <= 768) {
                        infoPanel.classList.add('show');
                        const rightSidePanel = document.getElementById('rightSidePanel');
                        const panelBackdrop = document.getElementById('panelBackdrop');
                        if (rightSidePanel) rightSidePanel.classList.remove('show');
                        if (panelBackdrop) panelBackdrop.classList.remove('show');
                    }
                }
                e.stopPropagation();
            } else {
                buyChampion(randomChamp, card);
                selectedShopCard = null;
                showDisplayInfo(null);
            }
        };
        card.onmouseenter = () => {
            if (!window.matchMedia("(pointer: coarse)").matches && selectedShopCard !== card) {
                showDisplayInfo('champ', randomChamp);
            }
        };
        card.onmouseleave = () => {
            if (!window.matchMedia("(pointer: coarse)").matches && !selectedShopCard) {
                showDisplayInfo(null);
            }
        };
        container.appendChild(card);
    }
    updateShopCardStates();
}

export function sellChampion(champ) {
    if (!champ) return;
    const blocked = editBlockedReason();
    if (blocked) { showNotification(blocked); return; }
    if (!isOwnUnit(champ)) {
        showNotification("Cannot sell enemy champion!", "error");
        return;
    }
    const index = STATE.champions.indexOf(champ);
    if (index > -1) {
        const template = CHAMPION_POOL.find(t => t.name === champ.name) || {};
        const baseCost = template.cost || 1;
        const copies = Math.pow(3, (champ.star || 1) - 1);
        const sellPrice = baseCost * copies;

        // FIX: Return copies back to pool on sell
        _returnToPool(champ.name, copies);

        updateGold(sellPrice);
        STATE.champions.splice(index, 1);
        playSfx('sell');
        showNotification(`Sold [${champ.name} ${'⭐'.repeat(champ.star)}] for ${sellPrice} 🪙.`);
        updateUnitCount();
    }
}

export function updateSynergies(boardChamps) {
    if (!TRAITS_INFO) return;

    const uniqueChamps = [];
    const countedNames = new Set();

    const myTeam = STATE.myTeam || 'Team1';
    boardChamps.forEach(c => {
        if ((c.team === myTeam || !STATE.isCombatPhase) && !countedNames.has(c.name)) {
            countedNames.add(c.name);
            uniqueChamps.push(c);
        }
    });

    const traitCounts = {};
    uniqueChamps.forEach(c => {
        const template = CHAMPION_POOL.find(t => t.name === c.name);
        if (template && template.traits) {
            template.traits.forEach(t => {
                traitCounts[t] = (traitCounts[t] || 0) + 1;
            });
        }
    });

    renderSynergyPanel(traitCounts);
}

function renderSynergyPanel(traitCounts) {
    const list = document.getElementById('synergyList');
    if (!list) return;

    if (Object.keys(traitCounts).length === 0) {
        list.innerHTML = `<div class="info-placeholder">Deploy units to activate synergies</div>`;
        return;
    }

    let html = '';
    const sortedTraits = Object.keys(traitCounts).sort((a, b) => traitCounts[b] - traitCounts[a]);

    sortedTraits.forEach(trait => {
        const count = traitCounts[trait];
        const info = TRAITS_INFO[trait];
        if (!info) return;

        let activeLevel = 0;
        let nextReq = info.thresholds[0].req;
        let isMax = false;

        for (let i = info.thresholds.length - 1; i >= 0; i--) {
            if (count >= info.thresholds[i].req) {
                activeLevel = i + 1;
                if (i + 1 < info.thresholds.length) nextReq = info.thresholds[i + 1].req;
                else { nextReq = info.thresholds[i].req; isMax = true; }
                break;
            }
        }

        const displayReq = isMax ? info.thresholds[info.thresholds.length - 1].req : nextReq;
        const isActiveClass = activeLevel > 0 ? 'active' : '';
        // Bronze / silver / gold by how many breakpoints are reached
        const tierClass = activeLevel === 0 ? '' :
            (activeLevel >= info.thresholds.length ? 'tier-gold' : (activeLevel >= 2 ? 'tier-silver' : 'tier-bronze'));

        const maxReq = info.thresholds[info.thresholds.length - 1].req;
        const breakpoints = new Set(info.thresholds.map(t => t.req));
        let pips = '';
        for (let n = 1; n <= maxReq; n++) {
            pips += `<span class="syn-pip${n <= count ? ' on' : ''}${breakpoints.has(n) && n < maxReq ? ' bp' : ''}"></span>`;
        }
        const reqList = info.thresholds.map(t => `<span class="${count >= t.req ? 'hit' : ''}">${t.req}</span>`).join(' › ');

        html += `
            <div class="synergy-item ${isActiveClass} ${tierClass}" data-trait="${trait}">
                <div class="synergy-item-header">
                    <span>${trait}</span>
                    <span>${count} / ${displayReq}</span>
                </div>
                <div class="syn-pips">${pips}</div>
                <div class="syn-reqs">${reqList}</div>
            </div>
        `;
    });

    list.innerHTML = html;

    document.querySelectorAll('.synergy-item').forEach(item => {
        // Desktop: hover to preview
        item.addEventListener('mouseenter', (e) => {
            const traitName = e.currentTarget.getAttribute('data-trait');
            showDisplayInfo('trait', { name: traitName, count: traitCounts[traitName] });
        });
        item.addEventListener('mouseleave', () => showDisplayInfo(null));

        // Mobile: tap to open info panel with trait details
        item.addEventListener('click', (e) => {
            const isMobile = window.matchMedia('(max-width: 768px)').matches;
            if (!isMobile) return; // desktop handles this via hover

            const traitName = e.currentTarget.getAttribute('data-trait');
            showDisplayInfo('trait', { name: traitName, count: traitCounts[traitName] });

            // Close right side drawer & backdrop, open info panel
            const rightSidePanel = document.getElementById('rightSidePanel');
            const panelBackdrop = document.getElementById('panelBackdrop');
            const infoPanel = document.getElementById('infoPanel');
            if (rightSidePanel) rightSidePanel.classList.remove('show');
            if (panelBackdrop) panelBackdrop.classList.remove('show');
            if (infoPanel) infoPanel.classList.add('show');

            e.stopPropagation(); // prevent outside-click handler from closing immediately
        });
    });
}

function updateLiveChampStats(panel, data, template, starMult) {
    const rawHp = Math.round(data.raw_hp !== undefined ? data.raw_hp : ((template.hp || 1000) * starMult));
    const maxHp = Math.round(data.max_hp !== undefined ? data.max_hp : rawHp);
    const curHp = Math.max(0, Math.round(data.hp !== undefined ? data.hp : maxHp));
    const hpPct = Math.max(0, Math.min(100, Math.round((curHp / Math.max(1, maxHp)) * 100)));

    const hpText = panel.querySelector('#liveHpText');
    const hpBar = panel.querySelector('#liveHpBar');
    if (hpText) hpText.innerText = `${curHp.toLocaleString()} / ${maxHp.toLocaleString()}`;
    if (hpBar) {
        hpBar.style.width = `${hpPct}%`;
        if (hpPct <= 28) hpBar.classList.add('low-hp');
        else hpBar.classList.remove('low-hp');
    }

    const shieldRow = panel.querySelector('#liveShieldRow');
    const shieldVal = panel.querySelector('#liveShieldVal');
    const shield = Math.round(data.shield || 0);
    if (shieldRow) {
        if (shield > 0) {
            shieldRow.style.display = 'block';
            if (shieldVal) shieldVal.innerText = shield.toLocaleString();
        } else {
            shieldRow.style.display = 'none';
        }
    }

    const maxMana = data.max_mana || template.max_mana || 200;
    const curMana = Math.max(0, Math.round(data.mana || 0));
    const manaPct = Math.max(0, Math.min(100, Math.round((curMana / Math.max(1, maxMana)) * 100)));
    const isManaReady = curMana >= maxMana;
    const manaText = panel.querySelector('#liveManaText');
    const manaBar = panel.querySelector('#liveManaBar');
    if (manaText) manaText.innerText = `${curMana} / ${maxMana}`;
    if (manaBar) {
        manaBar.style.width = `${manaPct}%`;
        if (isManaReady) manaBar.classList.add('ready');
        else manaBar.classList.remove('ready');
    }

    const rawAtk = Math.round(data.raw_attack !== undefined ? data.raw_attack : ((template.attack || 100) * starMult));
    const curAtk = Math.round(data.attack !== undefined ? data.attack : rawAtk);
    const atkVal = panel.querySelector('#liveAtkVal');
    if (atkVal) {
        let atkStr = `<b>${curAtk.toLocaleString()}</b>`;
        if (curAtk > rawAtk) atkStr += ` <span style="color:#2ecc71; font-weight:800; font-size:13px; text-shadow:0 0 6px rgba(46,204,113,0.5);">(+${(curAtk - rawAtk).toLocaleString()})</span>`;
        else if (curAtk < rawAtk) atkStr += ` <span style="color:#e74c3c; font-weight:800; font-size:13px;">(-${(rawAtk - curAtk).toLocaleString()})</span>`;
        atkVal.innerHTML = atkStr;
    }

    const rawSpd = data.raw_speed !== undefined ? data.raw_speed : (template.speed !== undefined ? template.speed : 1.0);
    const curSpd = data.speed !== undefined ? data.speed : rawSpd;
    const spdVal = panel.querySelector('#liveSpdVal');
    if (spdVal) {
        let spdStr = `<b>${curSpd.toFixed(2)}</b>`;
        if (curSpd > rawSpd + 0.01) spdStr += ` <span style="color:#2ecc71; font-weight:800; font-size:13px; text-shadow:0 0 6px rgba(46,204,113,0.5);">(+${(curSpd - rawSpd).toFixed(2)})</span>`;
        else if (curSpd < rawSpd - 0.01) spdStr += ` <span style="color:#e74c3c; font-weight:800; font-size:13px;">(-${(rawSpd - curSpd).toFixed(2)})</span>`;
        spdVal.innerHTML = spdStr;
    }

    const rawRng = data.raw_range !== undefined ? data.raw_range : (template.attack_range !== undefined ? template.attack_range : 1.0);
    const curRng = data.attack_range !== undefined ? data.attack_range : rawRng;
    const rngVal = panel.querySelector('#liveRngVal');
    if (rngVal) {
        let rngStr = `<b>${curRng.toFixed(1)}</b>`;
        if (curRng > rawRng + 0.05) rngStr += ` <span style="color:#2ecc71; font-weight:800; font-size:13px; text-shadow:0 0 6px rgba(46,204,113,0.5);">(+${(curRng - rawRng).toFixed(1)})</span>`;
        rngVal.innerHTML = rngStr;
    }

    const statusBadge = panel.querySelector('#liveStatusBadge');
    if (statusBadge) {
        const isAlive = (data.is_alive !== false && (data.hp === undefined || data.hp > 0));
        if (isAlive) {
            statusBadge.className = 'info-live-badge alive';
            statusBadge.innerHTML = '🟢 ALIVE';
        } else {
            statusBadge.className = 'info-live-badge dead';
            statusBadge.innerHTML = '💀 DEFEATED';
        }
    }

    const dmgRow = panel.querySelector('#liveDmgRow');
    const dmgVal = panel.querySelector('#liveDmgVal');
    const dmgDealt = Math.round(data.damage_dealt || 0);
    if (dmgRow) {
        if (dmgDealt > 0) {
            dmgRow.style.display = 'block';
            if (dmgVal) dmgVal.innerText = `${dmgDealt.toLocaleString()} DMG`;
        }
    }

    const buffsRow = panel.querySelector('#liveBuffsRow');
    const buffsList = panel.querySelector('#liveBuffsList');
    if (buffsRow && buffsList) {
        const activeBuffs = data.buffs || [];
        if (activeBuffs.length > 0) {
            buffsRow.style.display = 'block';
            const buffLabels = {
                'mana_lock': '🔒 SILENCED',
                'stun': '⚡ STUNNED',
                'time_stopped': '⏳ TIME STOPPED',
                'polymorph': '🐌 POLYMORPHED',
                'banish': '🌀 BANISHED',
                'submerge': '🌑 SUBMERGED',
                'regen': '💚 REGEN',
                'aoe_heal': '💚 HEALING',
                'heal': '💚 HEALING',
                'buff_atk': '⚔️ ATK BUFF',
                'speed_buff': '⚡ SPD BUFF',
                'dot': '☣️ POISONED',
                'aoe_dot': '☣️ POISONED',
                'hp_shield': '🛡️ SHIELDED'
            };
            const uniqueBuffs = [...new Set(activeBuffs)];
            buffsList.innerHTML = uniqueBuffs.map(b => {
                const lbl = buffLabels[b] || `✨ ${b.toUpperCase()}`;
                const isHarm = ['mana_lock', 'stun', 'time_stopped', 'polymorph', 'banish', 'dot', 'aoe_dot'].includes(b);
                const bg = isHarm ? 'linear-gradient(135deg, #c0392b, #e74c3c)' : 'linear-gradient(135deg, #27ae60, #2ecc71)';
                return `<span style="background: ${bg}; color: #fff; padding: 2px 7px; border-radius: 10px; font-size: 10px; font-weight: 800; display: inline-block;">${lbl}</span>`;
            }).join(' ');
        } else {
            buffsRow.style.display = 'none';
        }
    }
}

export function showDisplayInfo(type, data, shopContext = null) {
    const panel = document.getElementById('infoPanel');
    if (!panel) return;

    const isMobile = window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches;

    if (!type || !data) {
        panel.removeAttribute('data-champ-key');
        if (isMobile) {
            panel.classList.remove('show');
            panel.innerHTML = '';
            return;
        }
        panel.innerHTML = `<div class="info-placeholder">Hover over a card or synergy to view details</div>`;
        return;
    }

    if (type === 'champ') {
        const baseName = (data.name || '').replace(/\s*\(CLONE\)$/i, '').trim();
        const template = CHAMPION_POOL.find(c => c.name === data.name || c.name === baseName) || {};
        const currentStar = data.star || 1;
        const champCost = data.cost || template.cost || 1;
        const starMult = 1.8 ** (currentStar - 1);
        const skillPowerMult = 1.6 ** (currentStar - 1);
        const champKey = String(data.id || data.name);

        // FAST IN-PLACE REAL-TIME STATS UPDATE IF SAME CHAMPION ALREADY INSPECTED (ZERO FLICKER)
        if (panel.getAttribute('data-champ-key') === champKey && !shopContext) {
            updateLiveChampStats(panel, data, template, starMult);
            return;
        }
        panel.setAttribute('data-champ-key', champKey);

        const traitsHTML = template.traits ? `<p>🔮 Traits: <b>${template.traits.join(', ')}</b></p>` : '';
        const imgSrc = template.img || '';

        let actionHeaderHTML = '';
        if (shopContext && shopContext.isShop) {
            actionHeaderHTML = `
                <div class="info-action-bar">
                    <div class="info-drawer-pill"></div>
                    <div class="info-buttons-row">
                        <button type="button" id="infoActionBack" class="info-btn-back" title="Close info">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                            <span>Back</span>
                        </button>
                        <button type="button" id="infoActionBuy" class="info-btn-buy" title="Buy champion to bench">
                            <span class="buy-main-label">
                                <span class="buy-sparkle">⚡</span>
                                <span>BUY CHAMPION</span>
                            </span>
                            <span class="buy-cost-badge">${champCost} 🪙</span>
                        </button>
                    </div>
                </div>
            `;
        } else if (isMobile) {
            actionHeaderHTML = `
                <div class="info-action-bar">
                    <div class="info-drawer-pill"></div>
                    <div class="info-buttons-row">
                        <button type="button" id="infoActionBack" class="info-btn-back" style="width: 100%; justify-content: center;" title="Close info">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                            <span>CLOSE INFO</span>
                        </button>
                    </div>
                </div>
            `;
        }

        // --- HP & Synergy calculation ---
        const rawHp = Math.round(data.raw_hp !== undefined ? data.raw_hp : ((template.hp || 1000) * starMult));
        const maxHp = Math.round(data.max_hp !== undefined ? data.max_hp : rawHp);
        const curHp = Math.max(0, Math.round(data.hp !== undefined ? data.hp : maxHp));
        const hpPct = Math.max(0, Math.min(100, Math.round((curHp / Math.max(1, maxHp)) * 100)));
        let hpBonusHTML = '';
        if (maxHp > rawHp) {
            hpBonusHTML = ` <span style="color:#2ecc71; font-weight:800; font-size:13px; text-shadow:0 0 6px rgba(46,204,113,0.5);">(+${(maxHp - rawHp).toLocaleString()} Synergy)</span>`;
        }

        // --- Attack & Synergy calculation ---
        const rawAtk = Math.round(data.raw_attack !== undefined ? data.raw_attack : ((template.attack || 100) * starMult));
        const curAtk = Math.round(data.attack !== undefined ? data.attack : rawAtk);
        let atkDisplay = `<b>${curAtk.toLocaleString()}</b>`;
        if (curAtk > rawAtk) {
            atkDisplay += ` <span style="color:#2ecc71; font-weight:800; font-size:13px; text-shadow:0 0 6px rgba(46,204,113,0.5);">(+${(curAtk - rawAtk).toLocaleString()})</span>`;
        } else if (curAtk < rawAtk) {
            atkDisplay += ` <span style="color:#e74c3c; font-weight:800; font-size:13px;">(-${(rawAtk - curAtk).toLocaleString()})</span>`;
        }

        // --- Speed & Synergy calculation ---
        const rawSpd = data.raw_speed !== undefined ? data.raw_speed : (template.speed !== undefined ? template.speed : 1.0);
        const curSpd = data.speed !== undefined ? data.speed : rawSpd;
        let spdDisplay = `<b>${curSpd.toFixed(2)}</b>`;
        if (curSpd > rawSpd + 0.01) {
            spdDisplay += ` <span style="color:#2ecc71; font-weight:800; font-size:13px; text-shadow:0 0 6px rgba(46,204,113,0.5);">(+${(curSpd - rawSpd).toFixed(2)})</span>`;
        } else if (curSpd < rawSpd - 0.01) {
            spdDisplay += ` <span style="color:#e74c3c; font-weight:800; font-size:13px;">(-${(rawSpd - curSpd).toFixed(2)})</span>`;
        }

        // --- Range & Synergy calculation ---
        const rawRng = data.raw_range !== undefined ? data.raw_range : (template.attack_range !== undefined ? template.attack_range : 1.0);
        const curRng = data.attack_range !== undefined ? data.attack_range : rawRng;
        let rngDisplay = `<b>${curRng.toFixed(1)}</b>`;
        if (curRng > rawRng + 0.05) {
            rngDisplay += ` <span style="color:#2ecc71; font-weight:800; font-size:13px; text-shadow:0 0 6px rgba(46,204,113,0.5);">(+${(curRng - rawRng).toFixed(1)})</span>`;
        }

        // --- Active Synergies Badge in Combat ---
        let activeSynergiesHTML = '';
        if (data.applied_traits && data.applied_traits.length > 0) {
            activeSynergiesHTML = `
                <div style="background: rgba(46, 204, 113, 0.15); border: 1px solid rgba(46, 204, 113, 0.4); border-left: 4px solid #2ecc71; padding: 5px 8px; margin: 6px 0; border-radius: 6px;">
                    <p style="margin: 0 0 4px 0; color: #2ecc71; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Active Synergies (In Combat):</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                        ${data.applied_traits.map(t => `<span style="background: linear-gradient(135deg, #27ae60, #2ecc71); color: #ffffff; padding: 2px 7px; border-radius: 10px; font-size: 11px; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">✓ ${t}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        // --- Mana & starting mana indicator ---
        const maxMana = data.max_mana || template.max_mana || 200;
        const curMana = Math.max(0, Math.round(data.mana || 0));
        const manaPct = Math.max(0, Math.min(100, Math.round((curMana / Math.max(1, maxMana)) * 100)));
        let manaExtra = '';
        if (data.start_mana && data.start_mana > 0) {
            manaExtra = ` <span style="color: #3498db; font-size: 12px; font-weight: 700;">(Start: ${data.start_mana})</span>`;
        }

        let skillHTML = '';
        if (data.skill || template.skill) {
            const s = data.skill || template.skill;
            let skillName = s.type.toUpperCase();
            let skillDesc = '';

            const scaledPower = s.power ? Math.round(s.power) : 0;
            const scaledDuration = s.duration ? s.duration : 0;
            const scaledRadius = s.radius ? s.radius : 1.5;
            const scaledPercent = s.percent ? s.percent : 0.5;

            // Check if skill power was boosted by synergy
            const baseSkillPower = Math.round((template.skill && template.skill.power ? template.skill.power : 0) * skillPowerMult);
            const isSkillAmped = scaledPower > baseSkillPower && baseSkillPower > 0;
            const skillAmpDiff = isSkillAmped ? (scaledPower - baseSkillPower) : 0;
            const powerDisplay = isSkillAmped ? `${scaledPower.toLocaleString()} <span style="color:#2ecc71; font-weight:800;">(+${skillAmpDiff.toLocaleString()} Synergy)</span>` : scaledPower.toLocaleString();

            switch (s.type) {
                case 'damage': skillDesc = s.radius
                    ? `Deals <b>${powerDisplay}</b> burst damage to the target and enemies within radius <b>${s.radius}</b>.`
                    : `Deals <b>${powerDisplay}</b> burst damage to the target.`; break;
                case 'time_stop': skillDesc = `Stops time for every other unit for <b>${scaledDuration.toFixed(1)}s</b> and gains +300% Attack Speed (cannot gain Mana meanwhile).`; break;
                case 'return_to_zero': {
                    const pct = s.percent ? s.percent : 0.10;
                    const rtzDmg = Math.round(maxHp * pct);
                    skillDesc = `Deals <b>${rtzDmg.toLocaleString()}</b> damage (<b>${Math.round(pct * 100)}% Max HP</b>) to ALL enemies, wiping their Mana to 0 and purging all active buffs instantly.`;
                    break;
                }
                case 'blink_strike': skillDesc = `Teleports behind the target and deals <b>${powerDisplay}</b> damage.`; break;
                case 'execute': {
                    const execThreshold = (s.percent && s.percent > 0)
                        ? Math.round(s.percent * 100)
                        : ({ 1: 10, 2: 20, 3: 25, 4: 30, 5: 35 }[template.cost] || 20);
                    skillDesc = `Instantly executes targets below <b>${execThreshold}%</b> HP. Otherwise, deals <b>${powerDisplay}</b> physical damage.`;
                    break;
                }
                case 'banish': skillDesc = `Removes the target from the battlefield for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'submerge': skillDesc = `Submerges into shadows, becoming untargetable for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'mana_battery': skillDesc = `Channels <b>${powerDisplay}</b> Mana/s to the lowest-Mana ally for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'pull':
                    skillDesc = (s.target === 'enemy_furthest')
                        ? `Erases space, pulling the furthest enemy to self and dealing <b>${powerDisplay}</b> damage.`
                        : (s.target === 'all_enemies'
                            ? `Erases space, pulling all enemies to self and dealing <b>${powerDisplay}</b> damage.`
                            : `Erases space, pulling target to self and dealing <b>${powerDisplay}</b> damage.`);
                    break;
                case 'mind_control': skillDesc = `Brainwashes the target to fight for your team for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'polymorph': skillDesc = `Transforms the target into a harmless creature for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'stat_steal': skillDesc = `Steals <b>${powerDisplay}</b> Attack from the target for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'soul_swap': skillDesc = `Permanently swaps the strongest enemy with the weakest ally. Max 1 time per round.`; break;
                case 'hp_shield': skillDesc = `Activates a barrier absorbing <b>${Math.round(scaledPercent * 100)}%</b> of Max HP in damage for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'damage_link': skillDesc = `Links lifeforce with the target. Target absorbs your damage for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'life_tether': skillDesc = `Drains <b>${powerDisplay}</b> HP/s from tethered target to heal yourself for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'evasion': skillDesc = `Dodges all incoming damage for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'revive': skillDesc = `Grants an extra life: upon taking lethal damage, instantly revives with <b>100% HP</b> (does not stack).`; break;
                case 'ricochet': skillDesc = `Fires a projectile that hits <b>${Math.max(3, Math.round(scaledRadius))}</b> enemies in a chain, dealing <b>${powerDisplay}</b> per hit.`; break;
                case 'dot': skillDesc = `Inflicts <b>${powerDisplay}</b> DMG/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'aoe_dot': skillDesc = `Toxic zone (Radius <b>${scaledRadius}</b>) dealing <b>${powerDisplay}</b> DMG/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'global_slow': skillDesc = `Slows all enemies' Speed by <b>${Math.round((s.percent || 0.5) * 100)}%</b> for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'mana_lock': skillDesc = `Silences the target, preventing Mana gain and all healing for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'stun': skillDesc = `Stuns the target for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'heal': skillDesc = (scaledDuration > 0) ? `Heals the most wounded ally for <b>${powerDisplay}</b> HP/s for <b>${scaledDuration.toFixed(1)}s</b>.` : `Instantly restores <b>${powerDisplay}</b> HP to the most wounded ally.`; break;
                case 'aoe_heal': skillDesc = `Heals allies in radius (<b>${scaledRadius}</b>) for <b>${powerDisplay}</b> HP/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'regen': skillDesc = `Regenerates <b>${powerDisplay}</b> HP/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'buff_atk': skillDesc = `Increases Attack by <b>+${powerDisplay}</b> for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'speed_buff': skillDesc = `Boosts Attack Speed by <b>+${powerDisplay}%</b> for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'swap': skillDesc = `Swaps positions with the target and deals <b>${powerDisplay}</b> damage.`; break;
                case 'clone': skillDesc = `Creates a Shadow Clone with <b>${Math.round((s.percent || 0.3) * 100)}%</b> of original HP & Attack. While it lives, recasts strike the nearest enemy for 3x Attack.`; break;
                default: skillDesc = 'Casts a unique and powerful Stand ability.';
            }

            const targetMap = {
                'self': 'Self', 'enemy_closest': 'Nearest Enemy',
                'enemy_furthest': 'Furthest Enemy', 'enemy_highest_atk': 'Highest Attack Enemy',
                'enemy_lowest_hp': 'Lowest HP Enemy', 'enemy_random': 'Random Enemy',
                'ally_lowest_hp': 'Lowest HP Ally', 'ally_lowest_mana': 'Lowest Mana Ally',
                'all_enemies': 'All Enemies', 'all_except_self': 'Everyone Else',
                'bounce_closest': 'Nearest Enemy (Bouncing)', 'area_closest': 'Nearest Enemy Area'
            };
            const targetStr = targetMap[s.target] || 'The Target';

            skillHTML = `
                <div style="background: rgba(142, 68, 173, 0.2); border-left: 4px solid #9b59b6; padding: 7px 9px; margin: 6px 0; border-radius: 4px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <p style="margin: 0; color: #e8daef; font-size: 14px; text-shadow: 1px 1px 2px black;">✨ <b>SKILL: ${skillName}</b></p>
                        ${isSkillAmped ? `<span style="background:linear-gradient(135deg,#27ae60,#2ecc71); color:#fff; font-size:10px; font-weight:800; padding:1px 6px; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.4);">⚡ AMPED</span>` : ''}
                    </div>
                    <p style="margin: 2px 0 4px 0; color: #e74c3c; font-size: 12px;">🎯 <b>Target:</b> ${targetStr}</p>
                    <p style="margin: 3px 0 0 0; color: #d2b4de; font-size: 13px; line-height: 1.3; font-style: italic;">${skillDesc}</p>
                </div>
            `;
        }

        const isAlive = (data.is_alive !== false && (data.hp === undefined || data.hp > 0));
        const activeBuffs = data.buffs || [];
        const dmgDealt = Math.round(data.damage_dealt || 0);

        panel.innerHTML = `
            ${actionHeaderHTML}
            <div class="panel-title-row">
                <h3 class="panel-title" style="margin: 0;">${data.name} ${'⭐'.repeat(currentStar)}</h3>
                <span id="liveStatusBadge" class="info-live-badge ${isAlive ? 'alive' : 'dead'}">
                    ${isAlive ? '🟢 ALIVE' : '💀 DEFEATED'}
                </span>
            </div>
            ${imgSrc ? `<img src="${imgSrc}" class="champ-info-img" alt="${data.name}">` : ''}
            <div class="card-stats">
                ${activeSynergiesHTML}
                ${traitsHTML}
                ${skillHTML}
                <p style="margin-bottom: 2px;">❤️ HP: <b id="liveHpText">${curHp.toLocaleString()} / ${maxHp.toLocaleString()}</b>${hpBonusHTML}</p>
                <div class="info-stat-bar-container">
                    <div id="liveHpBar" class="info-stat-bar-fill hp-bar ${hpPct <= 28 ? 'low-hp' : ''}" style="width: ${hpPct}%;"></div>
                </div>
                <div id="liveShieldRow" style="${data.shield > 0 ? '' : 'display:none;'}">
                    <p>🛡️ Shield: <b id="liveShieldVal" style="color: #ecf0f1;">${Math.round(data.shield || 0).toLocaleString()}</b></p>
                </div>
                <p>⚔️ Attack: <span id="liveAtkVal">${atkDisplay}</span></p>
                <p>🎯 Range: <span id="liveRngVal">${rngDisplay}</span></p>
                <p>⚡ Speed: <span id="liveSpdVal">${spdDisplay}</span></p>
                <p style="margin-bottom: 2px;">💧 Mana: <b id="liveManaText">${curMana} / ${maxMana}</b>${manaExtra}</p>
                <div class="info-stat-bar-container">
                    <div id="liveManaBar" class="info-stat-bar-fill mana-bar ${curMana >= maxMana ? 'ready' : ''}" style="width: ${manaPct}%;"></div>
                </div>
                <div id="liveBuffsRow" style="${activeBuffs.length > 0 ? '' : 'display:none;'} margin: 6px 0;">
                    <p style="margin: 0 0 3px 0; color: #a4b0be; font-size: 11px; font-weight: 800;">ACTIVE BUFFS & STATUS:</p>
                    <div id="liveBuffsList" style="display: flex; flex-wrap: wrap; gap: 4px;"></div>
                </div>
                <div id="liveDmgRow" style="${dmgDealt > 0 ? '' : 'display:none;'}">
                    <p style="color: #f1c40f;">⚔️ Combat DMG: <b id="liveDmgVal" style="color: #f1c40f;">${dmgDealt.toLocaleString()} DMG</b></p>
                </div>
                <p style="margin-top: 8px; border-top: 1px dashed #7f8c8d; padding-top: 8px;">🪙 Cost: <b>${champCost} Gold</b></p>
            </div>
        `;

        // If buffs present, populate list
        if (activeBuffs.length > 0) {
            updateLiveChampStats(panel, data, template, starMult);
        }

        // Gắn sự kiện cho nút Buy
        const buyBtn = panel.querySelector('#infoActionBuy');
        if (buyBtn && shopContext && shopContext.isShop) {
            buyBtn.onclick = (e) => {
                e.stopPropagation();
                const success = buyChampion(shopContext.champTemplate, shopContext.cardElement);
                if (success) {
                    if (selectedShopCard) {
                        selectedShopCard.style.transform = '';
                        if (selectedShopCard.dataset.origBorder) selectedShopCard.style.borderColor = selectedShopCard.dataset.origBorder;
                        selectedShopCard = null;
                    }
                    panel.classList.remove('show');
                } else {
                    buyBtn.classList.add('btn-shake');
                    setTimeout(() => buyBtn.classList.remove('btn-shake'), 400);
                }
            };
        }

        // Gắn sự kiện cho nút Back
        const backBtn = panel.querySelector('#infoActionBack');
        if (backBtn) {
            backBtn.onclick = (e) => {
                e.stopPropagation();
                panel.classList.remove('show');
                panel.removeAttribute('data-champ-key');
                if (typeof STATE !== 'undefined') STATE.inspectedChampId = null;
                if (selectedShopCard) {
                    selectedShopCard.style.transform = '';
                    if (selectedShopCard.dataset.origBorder) selectedShopCard.style.borderColor = selectedShopCard.dataset.origBorder;
                    selectedShopCard = null;
                }
            };
        }
    }
    else if (type === 'trait') {
        const info = TRAITS_INFO[data.name];
        if (!info) return;

        let thresholdsHTML = '';
        info.thresholds.forEach(t => {
            const isActive = data.count >= t.req;
            const color = isActive ? '#e74c3c' : '#7f8c8d';
            thresholdsHTML += `<p style="color: ${color}; font-size: 17px; margin: 10px 0;"><b>[${t.req}]</b> ${t.effect}</p>`;
        });

        // On mobile: inject a back button so users can return to the synergy list
        const isMobile = window.innerWidth <= 768 || window.matchMedia('(max-width: 768px)').matches;
        const backHeader = isMobile ? `
            <div class="info-action-bar">
                <div class="info-drawer-pill"></div>
                <div class="info-buttons-row">
                    <button type="button" id="traitBackBtn" class="info-btn-back" style="width: 100%; justify-content: center;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        <span>Back to Synergies</span>
                    </button>
                </div>
            </div>
        ` : '';

        panel.innerHTML = `
            ${backHeader}
            <h3 class="panel-title">${data.name}</h3>
            <div class="card-stats">
                <p style="margin-bottom: 25px; font-size: 17px; line-height: 1.6; color: #bdc3c7;"><i>${info.desc}</i></p>
                ${thresholdsHTML}
            </div>
        `;

        const traitBackBtn = panel.querySelector('#traitBackBtn');
        if (traitBackBtn) {
            traitBackBtn.onclick = (e) => {
                e.stopPropagation();
                panel.classList.remove('show');
                const rightSidePanel = document.getElementById('rightSidePanel');
                const panelBackdrop = document.getElementById('panelBackdrop');
                if (rightSidePanel) rightSidePanel.classList.add('show');
                if (panelBackdrop) panelBackdrop.classList.add('show');
            };
        }
    }
}