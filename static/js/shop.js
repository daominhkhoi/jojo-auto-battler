// static/js/shop.js
import { CONFIG, STATE, CHAMPION_POOL, TRAITS_INFO } from './globals.js';
import { showNotification } from './notifications.js';

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

export function buyXp() {
    if (STATE.isCombatPhase) return;

    if (STATE.playerGold >= STATE.levelCost) {
        updateGold(-STATE.levelCost);

        STATE.playerLevel++;
        STATE.levelCost = STATE.levelCost * 2;

        document.getElementById('levelText').innerText = STATE.playerLevel;
        document.getElementById('buyXpBtn').innerText = `Level Up (${STATE.levelCost} 🪙)`;

        updateUnitCount();

        showNotification(`Level ${STATE.playerLevel} Reached! +1 Slot`);
    } else {
        showNotification(`Need ${STATE.levelCost} gold to level up!`);
    }
}

function checkAndMerge(champName, starLevel) {
    if (starLevel >= 3) return;
    const copies = STATE.champions.filter(c => c.name === champName && c.star === starLevel);
    if (copies.length >= 3) {
        const targets = copies.slice(0, 3);
        STATE.champions = STATE.champions.filter(c => !targets.includes(c));

        const upgraded = targets[0];
        upgraded.star += 1;

        upgraded.max_hp = Math.round(upgraded.max_hp * 1.8);
        upgraded.hp = upgraded.max_hp;
        upgraded.attack = Math.round(upgraded.attack * 1.8);
        upgraded.mana = 0;
        upgraded.max_mana = Math.round(upgraded.max_mana * 0.7);

        if (upgraded.skill) {
            if (upgraded.skill.power) upgraded.skill.power = Math.round(upgraded.skill.power * 1.6);
            if (upgraded.skill.duration) upgraded.skill.duration = parseFloat((upgraded.skill.duration * 1.2).toFixed(1));
            if (upgraded.skill.radius) upgraded.skill.radius = parseFloat((upgraded.skill.radius * 1.2).toFixed(1));
            if (upgraded.skill.percent) upgraded.skill.percent = parseFloat((upgraded.skill.percent * 1.3).toFixed(2));
        }

        STATE.champions.push(upgraded);
        showNotification(`Upgraded! [${champName}] is now ${upgraded.star} ⭐!`);
        checkAndMerge(champName, upgraded.star);
    }
}

export function buyChampion(champTemplate, cardElement) {
    if (STATE.isCombatPhase) return;
    if (STATE.playerGold < champTemplate.cost) return showNotification("Not enough gold!");

    let slot = null;
    for (let x = 0; x < CONFIG.BENCH_SLOTS; x++) {
        if (!STATE.champions.some(c => c.targetX === x && c.targetY === 6)) {
            slot = { x, y: 6 };
            break;
        }
    }

    if (!slot) return showNotification("Bench is full!");

    updateGold(-champTemplate.cost);
    cardElement.style.visibility = 'hidden';

    STATE.champions.push({
        id: Math.random().toString(36).substr(2, 9),
        name: champTemplate.name,
        team: "Team1",
        star: 1,
        cost: champTemplate.cost,
        targetX: slot.x, targetY: slot.y, originalX: slot.x, originalY: slot.y,
        hp: champTemplate.hp, max_hp: champTemplate.hp, mana: 0, max_mana: champTemplate.max_mana,
        attack: champTemplate.attack, attack_range: champTemplate.attack_range, speed: champTemplate.speed, is_alive: true, shakeTimer: 0,
        skill: champTemplate.skill ? JSON.parse(JSON.stringify(champTemplate.skill)) : null
    });

    checkAndMerge(champTemplate.name, 1);
    updateUnitCount();
}

function rollChampion() {
    const level = STATE.playerLevel || 1;
    const roll = Math.random() * 100;
    let targetCost = 1;

    // Tỉ lệ xuất hiện tướng phụ thuộc vào Level của người chơi
    if (level === 1) {
        if (roll < 100) targetCost = 1;
    } else if (level === 2) {
        if (roll < 70) targetCost = 1;
        else targetCost = 2;
    } else if (level === 3) {
        if (roll < 50) targetCost = 1;
        else if (roll < 85) targetCost = 2;
        else targetCost = 3;
    } else if (level === 4) {
        if (roll < 30) targetCost = 1;
        else if (roll < 70) targetCost = 2;
        else if (roll < 95) targetCost = 3;
        else targetCost = 4;
    } else if (level === 5) {
        if (roll < 15) targetCost = 1;
        else if (roll < 45) targetCost = 2;
        else if (roll < 85) targetCost = 3;
        else if (roll < 99) targetCost = 4;
        else targetCost = 5;
    } else {
        // Level 6+
        if (roll < 10) targetCost = 1;
        else if (roll < 25) targetCost = 2;
        else if (roll < 55) targetCost = 3;
        else if (roll < 80) targetCost = 4;
        else targetCost = 5;
    }

    const pool = CHAMPION_POOL.filter(c => c.cost === targetCost);

    if (pool.length === 0) return CHAMPION_POOL[Math.floor(Math.random() * CHAMPION_POOL.length)];

    return pool[Math.floor(Math.random() * pool.length)];
}

let selectedShopCard = null;

document.addEventListener('click', (e) => {
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (isTouchDevice && selectedShopCard) {
        if (!e.target.closest('.shop-card')) {
            selectedShopCard = null;
            document.querySelectorAll('.shop-card').forEach(c => c.style.transform = '');
            showDisplayInfo(null);
        }
    }
});

export function refreshShop() {
    const container = document.getElementById('shopContainer');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < 7; i++) {
        const randomChamp = rollChampion();

        const card = document.createElement('div');
        card.className = 'shop-card';
        card.innerHTML = `<h3>${randomChamp.name}</h3><img src="${randomChamp.img}" width="40" height="40" style="border-radius: 5px;"><p class="cost">${randomChamp.cost} 🪙</p>`;

        // Màu background và viền theo cost giống common, uncommon,...
        const colors = {
            1: { border: '#bdc3c7', bg: 'linear-gradient(to bottom, #2c3e50, #7f8c8d)' }, // Trắng xám (Common)
            2: { border: '#2ecc71', bg: 'linear-gradient(to bottom, #2c3e50, #27ae60)' }, // Xanh lá (Uncommon)
            3: { border: '#3498db', bg: 'linear-gradient(to bottom, #2c3e50, #2980b9)' }, // Xanh dương (Rare)
            4: { border: '#9b59b6', bg: 'linear-gradient(to bottom, #2c3e50, #8e44ad)' }, // Tím (Epic)
            5: { border: '#e67e22', bg: 'linear-gradient(to bottom, #2c3e50, #d35400)' }  // Cam (Legendary)
        };
        const theme = colors[randomChamp.cost] || colors[1];
        card.style.border = `2px solid ${theme.border}`;
        card.style.background = theme.bg;

        card.onclick = (e) => {
            const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;

            if (isTouchDevice) {
                if (selectedShopCard === card) {
                    buyChampion(randomChamp, card);
                    selectedShopCard = null;
                } else {
                    document.querySelectorAll('.shop-card').forEach(c => c.style.transform = '');
                    selectedShopCard = card;
                    showDisplayInfo('champ', randomChamp);
                    card.style.transform = 'scale(1.05)';
                    card.style.borderColor = '#f1c40f';
                    
                    const infoPanel = document.getElementById('infoPanel');
                    if (infoPanel && window.innerWidth <= 768) {
                        infoPanel.classList.add('show');
                        const synPanel = document.getElementById('synergyPanel');
                        if (synPanel) synPanel.classList.remove('show');
                    }
                    e.stopPropagation(); // Ngăn sự kiện click ra ngoài làm reset
                }
            } else {
                // Laptop: Bấm là mua luôn
                buyChampion(randomChamp, card);
                selectedShopCard = null;
                showDisplayInfo(null);
            }
        };
        card.onmouseenter = () => {
            const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
            if (!isTouchDevice && selectedShopCard !== card) {
                showDisplayInfo('champ', randomChamp);
            }
        };
        card.onmouseleave = () => {
            const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
            if (!isTouchDevice && !selectedShopCard) {
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

    boardChamps.forEach(c => {
        if (c.team === 'Team1' && !countedNames.has(c.name)) {
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
        item.addEventListener('mouseenter', (e) => {
            const traitName = e.currentTarget.getAttribute('data-trait');
            showDisplayInfo('trait', { name: traitName, count: traitCounts[traitName] });
        });
        item.addEventListener('mouseleave', () => showDisplayInfo(null));
    });
}

export function showDisplayInfo(type, data) {
    const panel = document.getElementById('infoPanel');
    if (!panel) return;

    if (!type || !data) {
        panel.innerHTML = `<div class="info-placeholder">Hover over a card or synergy to view details</div>`;
        return;
    }

    if (type === 'champ') {
        const template = CHAMPION_POOL.find(c => c.name === data.name) || {};
        const hp = Math.round(data.hp !== undefined ? data.hp : (data.max_hp || template.hp));
        const traitsHTML = template.traits ? `<p>🔮 Traits: <b>${template.traits.join(', ')}</b></p>` : '';
        const imgSrc = template.img || '';

        const currentStar = data.star || 1;
        const starFactor = currentStar - 1;

        let skillHTML = '';
        if (data.skill || template.skill) {
            const s = data.skill || template.skill;
            let skillName = s.type.toUpperCase();
            let skillDesc = '';

            const scaledPower = s.power ? Math.round(s.power) : 0;
            const scaledDuration = s.duration ? s.duration : 0;
            const scaledRadius = s.radius ? s.radius : 1.5;
            const scaledPercent = s.percent ? s.percent : 0.5;

            switch (s.type) {
                case 'damage': skillDesc = `Deals <b>${scaledPower.toLocaleString()}</b> burst damage to the nearest enemy.`; break;
                case 'time_stop': skillDesc = `Freezes time for all enemies for <b>${scaledDuration.toFixed(1)}s</b>. Self gains massive Attack Speed.`; break;
                case 'return_to_zero': skillDesc = `Reverts all enemies' actions to zero, wiping their Mana and purging all their active buffs instantly.`; break;
                case 'blink_strike': skillDesc = `Teleports behind the furthest enemy and deals <b>${scaledPower.toLocaleString()}</b> damage, ignoring frontliners.`; break;
                case 'execute': skillDesc = `Instantly executes targets below 30% HP. Otherwise, deals <b>${scaledPower.toLocaleString()}</b> physical damage.`; break;
                case 'banish': skillDesc = `Removes the target from the battlefield for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'submerge': skillDesc = `Submerges into shadows, becoming untargetable for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'mana_battery': skillDesc = `Channels <b>${scaledPower.toLocaleString()}</b> Mana per second to the ally with lowest current Mana for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'pull': skillDesc = `Erases space, pulling all enemies to self and dealing <b>${scaledPower.toLocaleString()}</b> damage.`; break;
                case 'mind_control': skillDesc = `Brainwashes the target to fight for your team for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'polymorph': skillDesc = `Transforms the target into a harmless creature, disabling attacks for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'stat_steal': skillDesc = `Steals <b>${scaledPower.toLocaleString()}</b> Attack from the target for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'soul_swap': skillDesc = `Permanently swaps the souls of the strongest enemy and the weakest ally, exchanging their teams and fully healing both. Max 1 time per round.`; break;
                case 'banish': skillDesc = `Removes the target from the battlefield for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'hp_shield': skillDesc = `Activates a defensive barrier absorbing <b>${Math.round(scaledPercent * 100)}%</b> of Max HP in damage.`; break;
                case 'damage_link': skillDesc = `Links lifeforce with the target. Target absorbs your damage for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'life_tether': skillDesc = `Tethers to the target, draining <b>${scaledPower.toLocaleString()}</b> HP/s to heal yourself for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'evasion': skillDesc = `Dodges all incoming attacks and damage for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'revive': skillDesc = `Upon taking lethal damage, instantly revives with <b>100% HP</b>.`; break;
                case 'ricochet': skillDesc = `Fires a projectile that bounces between enemies, dealing <b>${scaledPower.toLocaleString()}</b> damage on each hit.`; break;
                case 'dot': skillDesc = `Inflicts damage over time, dealing <b>${scaledPower.toLocaleString()}</b> DMG/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'aoe_dot': skillDesc = `Creates a toxic zone (Radius <b>${s.radius}</b>) dealing <b>${scaledPower.toLocaleString()}</b> DMG/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'global_slow': skillDesc = `Manipulates gravity/time, slowing down all enemies' Attack Speed by <b>50%</b> for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'mana_lock': skillDesc = `Silences the target, preventing Mana gain for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'stun': skillDesc = `Stuns the target, completely disabling movement and actions for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'heal': skillDesc = `Heals the most wounded ally for <b>${scaledPower.toLocaleString()}</b> HP/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'aoe_heal': skillDesc = `Heals allies in a radius (<b>${s.radius}</b>) for <b>${scaledPower.toLocaleString()}</b> HP/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'regen': skillDesc = `Regenerates <b>${scaledPower.toLocaleString()}</b> HP per second for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'buff_atk': skillDesc = `Increases Attack by <b>+${scaledPower.toLocaleString()}</b> for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'speed_buff': skillDesc = `Boosts Attack Speed by <b>+${scaledPower.toLocaleString()}%</b> for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'swap': skillDesc = `Swaps positions with the target and deals <b>${scaledPower.toLocaleString()}</b> damage.`; break;
                case 'clone': skillDesc = `Creates a Shadow Clone with <b>${Math.round(scaledPercent * 100)}%</b> of your original stats.`; break;
                case 'hp_shield': skillDesc = `Activates a defensive barrier absorbing <b>${Math.round(scaledPercent * 100)}%</b> of Max HP in damage for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                default: skillDesc = 'Casts a unique and powerful Stand ability.';
            }

            const targetMap = {
                'self': 'Self',
                'enemy_closest': 'Nearest Enemy',
                'enemy_furthest': 'Furthest Enemy',
                'enemy_highest_atk': 'Highest Attack Enemy',
                'enemy_lowest_hp': 'Lowest HP Enemy',
                'enemy_random': 'Random Enemy',
                'ally_lowest_hp': 'Lowest HP Ally',
                'ally_lowest_mana': 'Lowest Mana Ally',
                'all_enemies': 'All Enemies',
                'all_except_self': 'Everyone Else',
                'bounce_closest': 'Nearest Enemy (Bouncing)',
                'area_closest': 'Nearest Enemy Area'
            };
            const targetStr = targetMap[s.target] || 'The Target';

            skillHTML = `
                <div style="background: rgba(142, 68, 173, 0.2); border-left: 4px solid #9b59b6; padding: 10px; margin: 10px 0; border-radius: 4px;">
                    <p style="margin: 0; color: #e8daef; font-size: 15px; text-shadow: 1px 1px 2px black;">✨ <b>SKILL: ${skillName}</b></p>
                    <p style="margin: 2px 0 5px 0; color: #e74c3c; font-size: 13px;">🎯 <b>Target:</b> ${targetStr}</p>
                    <p style="margin: 5px 0 0 0; color: #d2b4de; font-size: 14px; font-style: italic;">${skillDesc}</p>
                </div>
            `;
        }

        panel.innerHTML = `
            <h3 class="panel-title">${data.name} ${'⭐'.repeat(currentStar)}</h3>
            ${imgSrc ? `<img src="${imgSrc}" style="width:100%; height:300px; object-fit:cover; border-radius:8px; border:2px solid #f39c12; margin-bottom:10px;">` : ''}
            <div class="card-stats">
                ${traitsHTML}
                ${skillHTML} 
                <p>❤️ HP: <b>${hp.toLocaleString()} / ${(data.max_hp || template.hp).toLocaleString()}</b></p>
                ${data.shield > 0 ? `<p>🛡️ Shield: <b style="color: #ecf0f1;">${Math.round(data.shield).toLocaleString()}</b></p>` : ''}
                <p>⚔️ Attack: <b>${Math.round(data.attack !== undefined ? data.attack : template.attack).toLocaleString()}</b></p>
                <p>🎯 Range: <b>${(data.attack_range !== undefined ? data.attack_range : template.attack_range).toFixed(1)}</b></p>
                <p>⚡ Speed: <b>${(data.speed !== undefined ? data.speed : template.speed).toFixed(2)}</b></p>
                <p>💧 Mana: <b>${data.mana || 0} / ${data.max_mana || template.max_mana}</b></p>
                <p style="margin-top: 10px; border-top: 1px dashed #7f8c8d; padding-top: 10px;">🪙 Cost: <b>${data.cost || template.cost} Gold</b></p>
            </div>
        `;
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

        panel.innerHTML = `
            <h3 class="panel-title">${data.name}</h3>
            <div class="card-stats">
                <p style="margin-bottom: 25px; font-size: 17px; line-height: 1.6; color: #bdc3c7;"><i>${info.desc}</i></p>
                ${thresholdsHTML}
            </div>
        `;
    }
}