// static/js/stats.js
// Realtime Combat Damage Meter & Round Performance Tracker

import { STATE, CHAMPION_POOL } from './globals.js';
import { IMAGES } from './assets.js';

let activeTab = 'all'; // 'all' | 'ally' | 'enemy'
let cachedAllies = [];
let cachedEnemies = [];
let cachedRound = 1;
let isCombatActive = false;

/**
 * Helper to get 2-character initials for champion avatars fallback.
 */
function getChampInitials(name) {
    if (!name) return '??';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

/**
 * Switch right panel tabs between 'synergies' and 'stats'.
 */
export function switchRightTab(tabName) {
    const tabSynergy = document.getElementById('tabBtnSynergy');
    const tabStats = document.getElementById('tabBtnStats');
    const paneSynergy = document.getElementById('synergyTabContent');
    const paneStats = document.getElementById('statsTabContent');

    if (tabName === 'stats') {
        if (tabSynergy) tabSynergy.classList.remove('active');
        if (tabStats) tabStats.classList.add('active');
        if (paneSynergy) {
            paneSynergy.classList.remove('active');
            paneSynergy.style.display = 'none';
        }
        if (paneStats) {
            paneStats.classList.add('active');
            paneStats.style.display = 'flex';
        }
    } else {
        if (tabStats) tabStats.classList.remove('active');
        if (tabSynergy) tabSynergy.classList.add('active');
        if (paneStats) {
            paneStats.classList.remove('active');
            paneStats.style.display = 'none';
        }
        if (paneSynergy) {
            paneSynergy.classList.add('active');
            paneSynergy.style.display = 'flex';
        }
    }
}

/**
 * Initialize the Damage Stats Panel in the DOM.
 */
export function initStatsPanel() {
    const tabBtnSynergy = document.getElementById('tabBtnSynergy');
    const tabBtnStats = document.getElementById('tabBtnStats');
    if (tabBtnSynergy) {
        tabBtnSynergy.onclick = () => switchRightTab('synergies');
    }
    if (tabBtnStats) {
        tabBtnStats.onclick = () => switchRightTab('stats');
    }

    const panel = document.getElementById('statsPanel');
    if (!panel) return;

    panel.innerHTML = `
        <div class="stat-header">
            <div class="stat-title-row">
                <span class="stat-title">⚔️ DAMAGE METER</span>
                <span id="statStatusBadge" class="stat-status-badge prep">⏳ PREPARATION</span>
            </div>
            <div id="statRoundSubtitle" class="stat-subtitle">Round 1 • Ready for battle</div>
            
            <!-- Dual Team Total Comparison Bar -->
            <div class="stat-duel-wrapper" id="statDuelWrapper">
                <div class="stat-duel-labels">
                    <span id="statAllyTotalLabel" class="stat-duel-ally-label">🛡️ ALLY: 0</span>
                    <span id="statEnemyTotalLabel" class="stat-duel-enemy-label">ENEMY: 0 💀</span>
                </div>
                <div class="stat-duel-track">
                    <div id="statDuelAllyBar" class="stat-duel-ally-bar" style="width: 50%;"></div>
                    <div id="statDuelEnemyBar" class="stat-duel-enemy-bar" style="width: 50%;"></div>
                </div>
            </div>

            <!-- Segmented Filter Tabs -->
            <div class="stat-tabs">
                <button type="button" class="stat-tab-btn active" data-tab="all" id="statTabAll">⚔️ ALL</button>
                <button type="button" class="stat-tab-btn" data-tab="ally" id="statTabAlly">🛡️ ALLY</button>
                <button type="button" class="stat-tab-btn" data-tab="enemy" id="statTabEnemy">💀 ENEMY</button>
            </div>
        </div>

        <div id="statContentArea" class="stat-content-area">
            <div class="stat-empty-msg">
                ⚔️ Start combat to track real-time damage statistics!
            </div>
        </div>
    `;

    // Tab switcher events
    const tabBtns = panel.querySelectorAll('.stat-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.getAttribute('data-tab') || 'all';
            renderStatsList();
        });
    });
}

/**
 * Called when a new combat begins.
 * Resets combat stats for the new round.
 */
export function resetDamageStatsForNewRound() {
    isCombatActive = true;
    cachedAllies = [];
    cachedEnemies = [];
    cachedRound = STATE.currentRound || 1;

    const liveDot = document.getElementById('combatLiveDot');
    if (liveDot) liveDot.style.display = 'inline-block';

    const badge = document.getElementById('statStatusBadge');
    if (badge) {
        badge.className = 'stat-status-badge live';
        badge.innerText = '🔴 LIVE COMBAT';
    }

    const sub = document.getElementById('statRoundSubtitle');
    if (sub) {
        sub.innerText = `Round ${cachedRound} • Live Battlefield`;
    }

    renderStatsList();
}

/**
 * Called when combat ends.
 * Freezes the final stats so the user can inspect them during review and shop phase.
 */
export function freezeDamageStatsOnCombatEnd(result) {
    isCombatActive = false;

    const liveDot = document.getElementById('combatLiveDot');
    if (liveDot) liveDot.style.display = 'none';

    const badge = document.getElementById('statStatusBadge');
    if (badge) {
        badge.className = 'stat-status-badge finished';
        badge.innerText = '📊 ROUND REVIEW';
    }

    const sub = document.getElementById('statRoundSubtitle');
    if (sub) {
        sub.innerText = `Round ${cachedRound} Finished • Reference for Buy / Sell`;
    }

    renderStatsList();
}

/**
 * Called every sync tick with the latest champions array.
 */
export function updateDamageStats(champions) {
    if (!Array.isArray(champions) || champions.length === 0) return;

    cachedRound = STATE.currentRound || cachedRound;

    const myTeam = STATE.myTeam || 'Team1';
    const isBvB = STATE.isBotVsBot;

    const allies = [];
    const enemies = [];

    champions.forEach(c => {
        // Exclude bench units (y == 6)
        if (c.y === 6 || c.targetY === 6) return;

        const isAlly = isBvB ? (c.team === 'Team1') : (c.team === myTeam);
        const item = {
            id: c.id,
            name: c.name,
            team: c.team,
            star: c.star || 1,
            damage: Math.max(0, Math.round(c.damage_dealt || 0)),
            is_alive: (c.is_alive !== false && (c.hp === undefined || c.hp > 0)),
            hp: c.hp || 0,
            max_hp: c.max_hp || 1
        };

        if (isAlly) {
            allies.push(item);
        } else {
            enemies.push(item);
        }
    });

    // Sort each descending by damage
    allies.sort((a, b) => b.damage - a.damage);
    enemies.sort((a, b) => b.damage - a.damage);

    cachedAllies = allies;
    cachedEnemies = enemies;

    renderStatsList();
}

/**
 * Renders the full Damage Meter UI inside #statContentArea.
 */
function renderStatsList() {
    const container = document.getElementById('statContentArea');
    if (!container) return;

    if (cachedAllies.length === 0 && cachedEnemies.length === 0) {
        container.innerHTML = `
            <div class="stat-empty-msg">
                ⚔️ Start combat to track real-time damage statistics!
            </div>
        `;
        updateDuelBar(0, 0);
        return;
    }

    const totalAllyDmg = cachedAllies.reduce((sum, c) => sum + c.damage, 0);
    const totalEnemyDmg = cachedEnemies.reduce((sum, c) => sum + c.damage, 0);

    const maxDmgInCombat = Math.max(
        1,
        ...cachedAllies.map(c => c.damage),
        ...cachedEnemies.map(c => c.damage)
    );

    updateDuelBar(totalAllyDmg, totalEnemyDmg);

    const isBvB = STATE.isBotVsBot;
    // Strip duplicate bot icons if present
    const allyTeamTitle = isBvB ? (STATE.bot1Name || 'Bot 1') : `🛡️ ALLY (YOU)`;
    const enemyTeamTitle = isBvB ? (STATE.bot2Name || 'Bot 2') : `💀 ENEMY`;

    // Update tab button labels dynamically if in Bot vs Bot
    const tabAllyBtn = document.getElementById('statTabAlly');
    const tabEnemyBtn = document.getElementById('statTabEnemy');
    if (tabAllyBtn) {
        tabAllyBtn.innerText = isBvB ? 'TEAM 1' : '🛡️ ALLY';
    }
    if (tabEnemyBtn) {
        tabEnemyBtn.innerText = isBvB ? 'TEAM 2' : '💀 ENEMY';
    }

    let html = '';

    if (activeTab === 'all' || activeTab === 'ally') {
        html += `
            <div class="stat-section ally-section">
                <div class="stat-section-header ally">
                    <span>${allyTeamTitle}</span>
                    <span class="stat-section-total">${totalAllyDmg.toLocaleString()} DMG</span>
                </div>
                <div class="stat-list">
                    ${renderChampionRows(cachedAllies, totalAllyDmg, maxDmgInCombat, 'ally')}
                </div>
            </div>
        `;
    }

    if (activeTab === 'all' || activeTab === 'enemy') {
        html += `
            <div class="stat-section enemy-section">
                <div class="stat-section-header enemy">
                    <span>${enemyTeamTitle}</span>
                    <span class="stat-section-total">${totalEnemyDmg.toLocaleString()} DMG</span>
                </div>
                <div class="stat-list">
                    ${renderChampionRows(cachedEnemies, totalEnemyDmg, maxDmgInCombat, 'enemy')}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

/**
 * Renders individual champion rows with progress bars, avatars, and numbers.
 */
function renderChampionRows(list, teamTotal, maxCombatDmg, side) {
    if (list.length === 0) {
        return `<div class="stat-no-units">No units deployed</div>`;
    }

    return list.map((champ, index) => {
        const barPct = Math.min(100, Math.round((champ.damage / maxCombatDmg) * 100));
        const sharePct = teamTotal > 0 ? Math.round((champ.damage / teamTotal) * 100) : 0;
        const isMvp = index === 0 && champ.damage > 0;
        const stars = '⭐'.repeat(Math.min(3, Math.max(1, champ.star)));
        const baseName = (champ.name || '').replace(/\s*\(CLONE\)$/i, '').trim();
        const template = (CHAMPION_POOL || []).find(c => c.name === champ.name || c.name === baseName);
        const cost = template ? (template.cost || 1) : 1;
        const tierBorderColors = {
            1: 'rgba(189, 195, 199, 0.45)',
            2: 'rgba(46, 204, 113, 0.65)',
            3: 'rgba(52, 152, 219, 0.65)',
            4: 'rgba(155, 89, 182, 0.7)',
            5: 'rgba(241, 196, 15, 0.85)'
        };
        const tierBorder = tierBorderColors[cost] || 'rgba(255, 255, 255, 0.2)';
        const rawAvatarUrl = IMAGES[champ.name] || IMAGES[baseName] || '';
        const safeAvatarUrl = rawAvatarUrl ? encodeURI(rawAvatarUrl) : '';
        const initials = getChampInitials(baseName || champ.name);
        const statusIcon = champ.is_alive ? '🟢' : '💀';
        const rankLabel = `#${index + 1}`;

        return `
            <div class="stat-row ${side} ${isMvp ? 'is-mvp' : ''}">
                <div class="stat-row-top">
                    <span class="stat-rank">${rankLabel}</span>
                    <div class="stat-avatar-wrapper" style="border-color: ${tierBorder};">
                        <div class="stat-avatar-placeholder">${initials}</div>
                        ${safeAvatarUrl 
                            ? `<img src="${safeAvatarUrl}" class="stat-avatar" alt="${champ.name}" loading="lazy" onload="if(this.previousElementSibling)this.previousElementSibling.style.display='none';" onerror="this.style.display='none';if(this.previousElementSibling)this.previousElementSibling.style.display='flex';">` 
                            : ''}
                    </div>
                    <div class="stat-name-stars">
                        <span class="stat-champ-name" title="${champ.name}">${champ.name}</span>
                        <span class="stat-stars">${stars}</span>
                    </div>
                    ${isMvp ? `<span class="stat-mvp-badge" title="Top Damage Dealer (MVP)">👑 MVP</span>` : ''}
                    <span class="stat-alive-badge" title="${champ.is_alive ? 'Alive' : 'Defeated'}">${statusIcon}</span>
                    <div class="stat-dmg-val-box">
                        <span class="stat-dmg-number">${champ.damage.toLocaleString()}</span>
                        <span class="stat-dmg-share">${sharePct}%</span>
                    </div>
                </div>

                <div class="stat-progress-track">
                    <div class="stat-progress-fill ${side}" style="width: ${barPct}%;"></div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Updates the top duel comparison bar between Ally and Enemy damage totals.
 */
function updateDuelBar(allyDmg, enemyDmg) {
    const allyLabel = document.getElementById('statAllyTotalLabel');
    const enemyLabel = document.getElementById('statEnemyTotalLabel');
    const allyBar = document.getElementById('statDuelAllyBar');
    const enemyBar = document.getElementById('statDuelEnemyBar');

    const isBvB = STATE.isBotVsBot;
    // Clean names without duplicate icons
    const allyName = isBvB ? (STATE.bot1Name || 'Bot 1') : '🛡️ ALLY';
    const enemyName = isBvB ? (STATE.bot2Name || 'Bot 2') : 'ENEMY 💀';

    if (allyLabel) allyLabel.innerText = `${allyName}: ${allyDmg.toLocaleString()}`;
    if (enemyLabel) enemyLabel.innerText = `${enemyName}: ${enemyDmg.toLocaleString()}`;

    const total = allyDmg + enemyDmg;
    let allyPct = 50;
    let enemyPct = 50;

    if (total > 0) {
        allyPct = Math.round((allyDmg / total) * 100);
        enemyPct = 100 - allyPct;
    }

    if (allyBar) allyBar.style.width = `${allyPct}%`;
    if (enemyBar) enemyBar.style.width = `${enemyPct}%`;
}
