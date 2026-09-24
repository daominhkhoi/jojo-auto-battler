// static/js/entities.js
import { IMAGES } from './assets.js';
import { initChampPool } from './shop.js';

// Champion pool — populated from the server's /api/champions route
export let CHAMPION_POOL = [];

function showLoadError() {
    // FIX: Show a clear error overlay so the player knows the game failed to load
    // instead of silently crashing when they try to buy a champion.
    const overlay = document.createElement('div');
    overlay.style.cssText = (
        'position:fixed;top:0;left:0;width:100vw;height:100vh;'
        + 'background:rgba(0,0,0,0.92);color:#e74c3c;display:flex;'
        + 'flex-direction:column;justify-content:center;align-items:center;z-index:99999;'
    );
    overlay.innerHTML = `
        <h1 style="font-size:48px;margin-bottom:16px;">⚠️ Failed to Load Champions</h1>
        <p style="font-size:20px;color:#bdc3c7;margin-bottom:32px;">
            Could not connect to the data server.<br>
            Check your internet connection or server status.
        </p>
        <button onclick="window.location.reload()"
            style="padding:14px 36px;font-size:20px;font-weight:bold;cursor:pointer;
                   background:#3498db;color:#fff;border:none;border-radius:8px;">
            🔄 Retry
        </button>
    `;
    document.body.appendChild(overlay);
}

try {
    const response = await fetch('/api/champions');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Empty champion list returned from server.');
    }

    // Attach image URLs (from assets.js) to each champion template
    CHAMPION_POOL = data.map(champ => {
        champ.img = IMAGES[champ.name] || '';
        return champ;
    });

    // FIX: Initialize the depletion pool once champion data is confirmed loaded
    initChampPool();

    console.log(`✅ Loaded ${CHAMPION_POOL.length} champions successfully!`);
} catch (error) {
    console.error('❌ Champion load error:', error);
    showLoadError();
}