// static/js/entities.js
import { IMAGES } from './assets.js';
import { initChampPool } from './shop.js';
import { IMAGE_CACHE } from './globals.js';

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

    // ----------------------------------------------------------------
    // FIX: Preload all images NOW that we have the pool.
    // Show a slim loading bar so the player sees progress instead of grey boxes.
    // ----------------------------------------------------------------
    const total = Object.keys(IMAGES).length;
    let loaded = 0;

    // Create a minimal loading overlay
    const overlay = document.createElement('div');
    overlay.id = 'img-preload-overlay';
    overlay.style.cssText = (
        'position:fixed;top:0;left:0;width:100vw;height:100vh;'
        + 'background:rgba(0,0,0,0.75);display:flex;flex-direction:column;'
        + 'justify-content:center;align-items:center;z-index:9999;'
        + 'font-family:Arial,sans-serif;color:#ecf0f1;'
    );
    overlay.innerHTML = `
        <p style="font-size:18px;margin-bottom:12px;">Loading images... <span id="img-count">0</span>/${total}</p>
        <div style="width:280px;height:8px;background:#2c3e50;border-radius:4px;overflow:hidden;">
            <div id="img-bar" style="height:100%;width:0%;background:#3498db;transition:width 0.1s;"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    const bar   = document.getElementById('img-bar');
    const count = document.getElementById('img-count');

    // Kick off parallel preload — track progress per image
    const imgPromises = Object.entries(IMAGES).map(([name, src]) => {
        return new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = img.onerror = () => {
                loaded++;
                const pct = Math.round((loaded / total) * 100);
                if (bar)   bar.style.width   = pct + '%';
                if (count) count.textContent  = loaded;
                resolve({ name, img });
            };
            img.src = src;
            // Store in cache immediately so renderer can use partial results
            IMAGE_CACHE[name] = img;
        });
    });

    await Promise.all(imgPromises);

    // All done — remove overlay
    overlay.remove();
    console.log(`🖼️ All ${total} images preloaded.`);

} catch (error) {
    console.error('❌ Champion load error:', error);
    showLoadError();
}