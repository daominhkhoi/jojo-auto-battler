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

    if (!STATE.levelCost) STATE.levelCost = 5;

    if (STATE.playerGold >= STATE.levelCost) {
        updateGold(-STATE.levelCost);

        STATE.playerLevel++;
        STATE.levelCost *= 2;

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

        upgraded.max_hp = Math.round(upgraded.max_hp * 2.1);
        upgraded.hp = upgraded.max_hp;
        upgraded.attack = Math.round(upgraded.attack * 2.1);
        upgraded.attack_range = parseFloat((upgraded.attack_range * 1.1).toFixed(1));
        upgraded.max_mana = Math.round(upgraded.max_mana * 0.75);
        upgraded.mana = 0;
        upgraded.speed = Math.round(upgraded.speed * 1.25);

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
        attack: champTemplate.attack, attack_range: champTemplate.attack_range, speed: champTemplate.speed, is_alive: true, shakeTimer: 0
    });

    checkAndMerge(champTemplate.name, 1);
    updateUnitCount();
}

function rollChampion() {
    const roll = Math.random() * 100;
    let targetCost = 1;

    if (roll < 5) targetCost = 5;
    else if (roll < 15) targetCost = 4;
    else if (roll < 35) targetCost = 3;
    else if (roll < 65) targetCost = 2;
    else targetCost = 1;

    const pool = CHAMPION_POOL.filter(c => c.cost === targetCost);

    if (pool.length === 0) return CHAMPION_POOL[Math.floor(Math.random() * CHAMPION_POOL.length)];

    return pool[Math.floor(Math.random() * pool.length)];
}

export function refreshShop() {
    const container = document.getElementById('shopContainer');
    if (!container) return;

    container.innerHTML = '';
    for (let i = 0; i < 5; i++) {
        const randomChamp = rollChampion();

        const card = document.createElement('div');
        card.className = 'shop-card';
        card.innerHTML = `<h3>${randomChamp.name}</h3><img src="${randomChamp.img}" width="40" height="40" style="border-radius: 5px;"><p class="cost">${randomChamp.cost} 🪙</p>`;

        card.onclick = () => buyChampion(randomChamp, card);
        card.onmouseenter = () => showDisplayInfo('champ', randomChamp);
        card.onmouseleave = () => showDisplayInfo(null);

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

        // --- CẬP NHẬT: TÍNH TOÁN SKILL DỰA THEO SỐ SAO (STAR LEVEL) ---
        const currentStar = data.star || 1;
        const starFactor = currentStar - 1;

        let skillHTML = '';
        if (template.skill) {
            const s = template.skill;
            let skillName = s.type.toUpperCase();
            let skillDesc = '';

            // Công thức nhân mới y hệt như trên Server
            const scaledPower = Math.round((s.power || 0) * Math.pow(2.1, starFactor));
            const scaledDuration = (s.duration || 0) * Math.pow(1.1, starFactor);
            const scaledRadius = ((s.radius || 1.5) * Math.pow(1.1, starFactor)).toFixed(1);
            const scaledPercent = (s.percent || 0.5) + (starFactor * 0.15);

            switch (s.type) {
                case 'damage':
                    skillDesc = `Deals <b>${scaledPower.toLocaleString()}</b> burst damage to the target.`; break;
                case 'heal':
                    skillDesc = `Instantly restores <b>${scaledPower.toLocaleString()}</b> HP to itself.`; break;
                case 'regen':
                    skillDesc = `Regenerates <b>${scaledPower.toLocaleString()}</b> HP per second for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'buff_atk':
                    skillDesc = `Empowers itself with <b>+${scaledPower.toLocaleString()}</b> Attack for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'dot':
                    skillDesc = `Infects target, dealing <b>${scaledPower.toLocaleString()}</b> Damage per second for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'aoe_heal':
                    skillDesc = `Creates a healing zone (Radius <b>${s.radius}</b>), allies recover <b>${scaledPower.toLocaleString()}</b> HP/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'aoe_dot':
                    skillDesc = `Creates a toxic zone (Radius <b>${s.radius}</b>), enemies take <b>${scaledPower.toLocaleString()}</b> DMG/s for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'speed_buff':
                    skillDesc = `Gains <b>+${scaledPower.toLocaleString()}%</b> Attack Speed for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'swap':
                    skillDesc = `Teleports, swaps positions with a <b>RANDOM</b> enemy, and deals <b>${scaledPower.toLocaleString()}</b> damage.`; break;
                case 'clone':
                    skillDesc = `Creates a Shadow Clone with <b>${Math.round(scaledPercent * 100)}%</b> of original stats.`; break;
                case 'mana_lock':
                    skillDesc = `Silences the <b>TARGET</b>, stopping its Mana gain for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                case 'stun':
                    skillDesc = `Stuns the target, disabling attacks and movement for <b>${scaledDuration.toFixed(1)}s</b>.`; break;
                default:
                    skillDesc = 'Casts a mysterious ability.';
            }

            skillHTML = `
                <div style="background: rgba(142, 68, 173, 0.2); border-left: 4px solid #9b59b6; padding: 10px; margin: 10px 0; border-radius: 4px;">
                    <p style="margin: 0; color: #e8daef; font-size: 15px; text-shadow: 1px 1px 2px black;">✨ <b>SKILL: ${skillName}</b></p>
                    <p style="margin: 5px 0 0 0; color: #d2b4de; font-size: 14px; font-style: italic;">${skillDesc}</p>
                </div>
            `;
        }

        panel.innerHTML = `
            <h3 class="panel-title">${data.name} ${'⭐'.repeat(currentStar)}</h3>
            ${imgSrc ? `<img src="${imgSrc}" style="width:100%; height:300px; object-fit:cover; border-radius:8px; border:2px solid #f39c12; margin-bottom:10px;">` : ''}
            <div class="card-stats">
                ${traitsHTML}
                ${skillHTML} <p>❤️ HP: <b>${hp.toLocaleString()} / ${(data.max_hp || template.hp).toLocaleString()}</b></p>
                <p>⚔️ Attack: <b>${(data.attack || template.attack).toLocaleString()}</b></p>
                <p>🎯 Range: <b>${data.attack_range || template.attack_range}</b></p>
                <p>⚡ Speed: <b>${data.speed || template.speed}</b></p>
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