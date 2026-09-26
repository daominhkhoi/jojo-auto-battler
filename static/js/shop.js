// static/js/shop.js
import { CONFIG, STATE, CHAMPION_POOL, TRAITS_INFO } from './globals.js';
import { showNotification } from './notifications.js';

// ======================================================================
// FIX: CHAMPION POOL DEPLETION
// Fixed copy counts per cost tier (like real TFT).
// Pool is initialized once when champions are loaded, then depleted as
// cards are bought and replenished when sold or a new shop rolls.
// ======================================================================
const POOL_COUNTS = { 1: 30, 2: 20, 3: 15, 4: 10, 5: 5 };

// Tracks how many copies of each champion remain in the global pool
const _pool = {}; // { champName: copiesRemaining }

export function initChampPool() {
    Object.keys(_pool).forEach(k => delete _pool[k]);
    CHAMPION_POOL.forEach(champ => {
        _pool[champ.name] = POOL_COUNTS[champ.cost] ?? 30;
    });
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
    const goldEl = document.getElementById('goldText');
    if (goldEl) goldEl.innerText = STATE.playerGold;
}

export function updateUnitCount() {
    const boardChamps = STATE.champions.filter(c => c.targetY < 6);
    const count = boardChamps.length;
    const unitEl = document.getElementById('unitText');
    if (unitEl) unitEl.innerText = `${count}/${STATE.playerLevel}`;
    updateSynergies(boardChamps);
}

// ======================================================================
// FIX: Level cost uses a linear formula instead of exponential doubling.
// Old: 5 → 10 → 20 → 40 → 80 (unreachable after lv 4)
// New: 4 → 8 → 12 → 16 → 20 → 24 (always reachable, scales with level)
// ======================================================================
export function buyXp() {
    if (STATE.isCombatPhase) return;

    if (STATE.playerGold >= STATE.levelCost) {
        updateGold(-STATE.levelCost);
        STATE.playerLevel++;
        STATE.levelCost = STATE.playerLevel * 4; // FIX: linear, not exponential

        document.getElementById('levelText').innerText = STATE.playerLevel;
        document.getElementById('buyXpBtn').innerText = `Level Up (${STATE.levelCost} 🪙)`;

        updateUnitCount();
        showNotification(`Level ${STATE.playerLevel} Reached! +1 Slot`);
    } else {
        showNotification(`Need ${STATE.levelCost} gold to level up!`);
    }
}

// ======================================================================
function checkAndMerge(champName, starLevel) {
    if (starLevel >= 3) return;
    const copies = STATE.champions.filter(c => c.name === champName && c.star === starLevel);
    if (copies.length >= 3) {
        const targets = copies.slice(0, 3);

        // Prioritize the copy currently deployed on the board (y < 6)
        targets.sort((a, b) => {
            const aOnBoard = (a.targetY !== undefined && a.targetY < 6) ? 1 : 0;
            const bOnBoard = (b.targetY !== undefined && b.targetY < 6) ? 1 : 0;
            return bOnBoard - aOnBoard;
        });

        STATE.champions = STATE.champions.filter(c => !targets.includes(c));

        // Return 2 consumed copies to pool (1 stays as the upgraded unit)
        _returnToPool(champName, 2);

        const upgraded = targets[0];
        upgraded.star += 1;

        upgraded.max_hp = Math.round(upgraded.max_hp * 1.8);
        upgraded.hp = upgraded.max_hp;
        upgraded.attack = Math.round(upgraded.attack * 1.8);
        upgraded.mana = 0;
        // max_mana stays constant across star tiers to prevent infinite CC/perma-stun loops

        if (upgraded.skill) {
            if (upgraded.skill.power) upgraded.skill.power = Math.round(upgraded.skill.power * 1.6);
            if (upgraded.skill.duration) upgraded.skill.duration = parseFloat((upgraded.skill.duration * 1.2).toFixed(1));
            if (upgraded.skill.radius) upgraded.skill.radius = parseFloat((upgraded.skill.radius * 1.2).toFixed(1));
            if (upgraded.skill.percent) upgraded.skill.percent = Math.min(0.85, parseFloat((upgraded.skill.percent * 1.3).toFixed(2)));
        }

        STATE.champions.push(upgraded);
        showNotification(`Upgraded! [${champName}] is now ${upgraded.star} ⭐!`);
        checkAndMerge(champName, upgraded.star);
    }
}

export function buyChampion(champTemplate, cardElement) {
    if (STATE.isCombatPhase) return false;
    if (STATE.playerGold < champTemplate.cost) {
        showNotification("Not enough gold!");
        return false;
    }

    let slot = null;
    for (let x = 0; x < CONFIG.BENCH_SLOTS; x++) {
        if (!STATE.champions.some(c => c.targetX === x && c.targetY === 6)) {
            slot = { x, y: 6 };
            break;
        }
    }
    if (!slot) {
        showNotification("Bench is full!");
        return false;
    }

    // FIX: Deduct from pool — if the pool is empty for this champ, refuse purchase
    if (!_takeFromPool(champTemplate.name)) {
        showNotification(`No more copies of [${champTemplate.name}] available!`);
        return false;
    }

    updateGold(-champTemplate.cost);
    if (cardElement) cardElement.style.visibility = 'hidden';

    STATE.champions.push({
        id: Math.random().toString(36).substr(2, 9),
        name: champTemplate.name,
        team: STATE.myTeam || "Team1",
        star: 1,
        cost: champTemplate.cost,
        targetX: slot.x, targetY: slot.y,
        originalX: slot.x, originalY: slot.y,
        hp: champTemplate.hp, max_hp: champTemplate.hp,
        mana: 0, max_mana: champTemplate.max_mana,
        attack: champTemplate.attack,
        // FIX: Store base values so resetBoardForNextRound can restore them
        base_attack: champTemplate.attack,
        base_speed: champTemplate.speed,
        attack_range: champTemplate.attack_range,
        speed: champTemplate.speed,
        is_alive: true,
        shakeTimer: 0,
        skill: champTemplate.skill ? JSON.parse(JSON.stringify(champTemplate.skill)) : null,
        traits: champTemplate.traits || [],
    });

    checkAndMerge(champTemplate.name, 1);
    updateUnitCount();
    showNotification(`Purchased [${champTemplate.name}] to bench! ⭐`);
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

export function refreshShop() {
    selectedShopCard = null;
    const container = document.getElementById('shopContainer');
    if (!container) return;

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
        card.innerHTML = `<h3>${randomChamp.name}</h3><img src="${randomChamp.img}" width="40" height="40" style="border-radius: 5px;"><p class="cost">${randomChamp.cost} 🪙</p>`;

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
                        const synPanel = document.getElementById('synergyPanel');
                        if (synPanel) synPanel.classList.remove('show');
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
}

export function sellChampion(champ) {
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

        html += `
            <div class="synergy-item ${isActiveClass}" data-trait="${trait}">
                <div class="synergy-item-header">
                    <span>${trait}</span>
                    <span>${count} / ${displayReq}</span>
                </div>
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

            // Close synergy panel, open info panel
            const synergyPanel = document.getElementById('synergyPanel');
            const infoPanel = document.getElementById('infoPanel');
            if (synergyPanel) synergyPanel.classList.remove('show');
            if (infoPanel) infoPanel.classList.add('show');

            e.stopPropagation(); // prevent outside-click handler from closing immediately
        });
    });
}

export function showDisplayInfo(type, data, shopContext = null) {
    const panel = document.getElementById('infoPanel');
    if (!panel) return;

    if (!type || !data) {
        panel.innerHTML = `<div class="info-placeholder">Hover over a card or synergy to view details</div>`;
        return;
    }

    const isMobile = window.innerWidth <= 768 || window.matchMedia('(pointer: coarse)').matches;

    if (type === 'champ') {
        const template = CHAMPION_POOL.find(c => c.name === data.name) || {};
        const hp = Math.round(data.hp !== undefined ? data.hp : (data.max_hp || template.hp));
        const traitsHTML = template.traits ? `<p>🔮 Traits: <b>${template.traits.join(', ')}</b></p>` : '';
        const imgSrc = template.img || '';
        const currentStar = data.star || 1;
        const champCost = data.cost || template.cost || 1;

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

        const starMult = 1.8 ** (currentStar - 1);
        const skillPowerMult = 1.6 ** (currentStar - 1);

        // --- HP & Synergy calculation ---
        const rawHp = Math.round(data.raw_hp !== undefined ? data.raw_hp : ((template.hp || 1000) * starMult));
        const maxHp = Math.round(data.max_hp !== undefined ? data.max_hp : rawHp);
        const curHp = Math.round(data.hp !== undefined ? data.hp : maxHp);
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
                <div style="background: rgba(46, 204, 113, 0.15); border: 1px solid rgba(46, 204, 113, 0.4); border-left: 4px solid #2ecc71; padding: 7px 10px; margin: 8px 0; border-radius: 6px;">
                    <p style="margin: 0 0 5px 0; color: #2ecc71; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Active Synergies (In Combat):</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${data.applied_traits.map(t => `<span style="background: linear-gradient(135deg, #27ae60, #2ecc71); color: #ffffff; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">✓ ${t}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        // --- Mana & starting mana indicator ---
        const maxMana = data.max_mana || template.max_mana || 200;
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
                case 'damage': skillDesc = `Deals <b>${powerDisplay}</b> burst damage to the nearest enemy.`; break;
                case 'time_stop': skillDesc = `Freezes time for all enemies for <b>${scaledDuration.toFixed(1)}s</b>. Self gains massive Attack Speed.`; break;
                case 'return_to_zero': skillDesc = `Reverts all enemies' actions to zero, wiping their Mana and purging all active buffs instantly.`; break;
                case 'blink_strike': skillDesc = `Teleports behind the furthest enemy and deals <b>${powerDisplay}</b> damage.`; break;
                case 'execute': {
                    const execThreshold = (s.percent && s.percent > 0)
                        ? Math.round(s.percent * 100)
                        : (template.cost === 1 ? 10 : (template.cost === 2 ? 20 : (template.cost === 3 ? 25 : (template.cost >= 4 ? 30 : 20))));
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
                case 'revive': skillDesc = `Upon taking lethal damage, instantly revives with <b>100% HP</b>.`; break;
                case 'ricochet': skillDesc = `Fires a projectile bouncing ${Math.round(scaledRadius)} times, dealing <b>${powerDisplay}</b> per hit.`; break;
                case 'dot': skillDesc = `Inflicts <b>${powerDisplay}</b> DMG/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'aoe_dot': skillDesc = `Toxic zone (Radius <b>${scaledRadius}</b>) dealing <b>${powerDisplay}</b> DMG/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'global_slow': skillDesc = `Slows all enemies' Attack Speed by <b>50%</b> for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'mana_lock': skillDesc = `Silences the target, preventing Mana gain for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'stun': skillDesc = `Stuns the target for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'heal': skillDesc = (scaledDuration > 0) ? `Heals the most wounded ally for <b>${powerDisplay}</b> HP/s for <b>${scaledDuration.toFixed(1)}s</b>.` : `Instantly restores <b>${powerDisplay}</b> HP to the most wounded ally.`; break;
                case 'aoe_heal': skillDesc = `Heals allies in radius (<b>${scaledRadius}</b>) for <b>${powerDisplay}</b> HP/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'regen': skillDesc = `Regenerates <b>${powerDisplay}</b> HP/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'buff_atk': skillDesc = `Increases Attack by <b>+${powerDisplay}</b> for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'speed_buff': skillDesc = `Boosts Attack Speed by <b>+${powerDisplay}%</b> for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'swap': skillDesc = `Swaps positions with the target and deals <b>${powerDisplay}</b> damage.`; break;
                case 'clone': skillDesc = `Creates a Shadow Clone with <b>${Math.round(scaledPercent * 100)}%</b> of original stats.`; break;
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
                <div style="background: rgba(142, 68, 173, 0.2); border-left: 4px solid #9b59b6; padding: 10px; margin: 10px 0; border-radius: 4px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <p style="margin: 0; color: #e8daef; font-size: 15px; text-shadow: 1px 1px 2px black;">✨ <b>SKILL: ${skillName}</b></p>
                        ${isSkillAmped ? `<span style="background:linear-gradient(135deg,#27ae60,#2ecc71); color:#fff; font-size:11px; font-weight:800; padding:2px 7px; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.4);">⚡ AMPED</span>` : ''}
                    </div>
                    <p style="margin: 2px 0 5px 0; color: #e74c3c; font-size: 13px;">🎯 <b>Target:</b> ${targetStr}</p>
                    <p style="margin: 5px 0 0 0; color: #d2b4de; font-size: 14px; font-style: italic;">${skillDesc}</p>
                </div>
            `;
        }

        panel.innerHTML = `
            ${actionHeaderHTML}
            <h3 class="panel-title">${data.name} ${'⭐'.repeat(currentStar)}</h3>
            ${imgSrc ? `<img src="${imgSrc}" style="width:100%; height:300px; object-fit:cover; border-radius:8px; border:2px solid #f39c12; margin-bottom:10px;">` : ''}
            <div class="card-stats">
                ${activeSynergiesHTML}
                ${traitsHTML}
                ${skillHTML}
                <p>❤️ HP: <b>${curHp.toLocaleString()} / ${maxHp.toLocaleString()}</b>${hpBonusHTML}</p>
                ${data.shield > 0 ? `<p>🛡️ Shield: <b style="color: #ecf0f1;">${Math.round(data.shield).toLocaleString()}</b></p>` : ''}
                <p>⚔️ Attack: ${atkDisplay}</p>
                <p>🎯 Range: ${rngDisplay}</p>
                <p>⚡ Speed: ${spdDisplay}</p>
                <p>💧 Mana: <b>${data.mana || 0} / ${maxMana}</b>${manaExtra}</p>
                <p style="margin-top: 10px; border-top: 1px dashed #7f8c8d; padding-top: 10px;">🪙 Cost: <b>${champCost} Gold</b></p>
            </div>
        `;

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
                const synPanel = document.getElementById('synergyPanel');
                if (synPanel) synPanel.classList.add('show');
            };
        }
    }
}