// static/js/main.js
import { CONFIG, STATE, getCanvasCoords } from './globals.js';
import { buyXp, refreshShop, updateGold, updateUnitCount, sellChampion, showDisplayInfo } from './shop.js';
import { renderBoard } from './renderer.js';
import { updatePhysics } from './combat.js';
import { showNotification } from './notifications.js';
import { findMatch, declareReady } from './network.js';

const canvas = document.getElementById('gameBoard');
const ctx = canvas.getContext('2d');

// ==========================================
// ĐĂNG KÝ SỰ KIỆN GIAO DIỆN (UI BUTTONS)
// ==========================================
document.getElementById('buyXpBtn').addEventListener('click', buyXp);
document.getElementById('findMatchBtn').addEventListener('click', findMatch);
document.getElementById('readyBtn').addEventListener('click', declareReady);

document.getElementById('rollBtn').addEventListener('click', () => {
    if (STATE.isCombatPhase) {
        showNotification("Cannot roll during combat!");
        return;
    }
    if (STATE.playerGold >= 1) {
        updateGold(-1);
        refreshShop();
    } else {
        showNotification("Not enough gold!");
    }
});

// ==========================================
// HỆ THỐNG KÉO THẢ THẺ BÀI & HOVER
// ==========================================
let isDragging = false;
let draggedChamp = null;
let originalX = null;
let originalY = null;
let hoveredChamp = null; // Biến lưu vết thẻ đang được trỏ chuột

// Hàm tính tọa độ chuột chuẩn xác khi Canvas bị thu phóng bằng CSS
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

// 1. SỰ KIỆN NHẤN CHUỘT XUỐNG (Bắt đầu kéo)
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
        if (!STATE.isCombatPhase) {
            isDragging = true;
            draggedChamp = touchedChamp;
            originalX = touchedChamp.targetX;
            originalY = touchedChamp.targetY;
            touchedChamp.startPixelX = touchedChamp.pixelX;
            touchedChamp.startPixelY = touchedChamp.pixelY;
            
            if (sellZone && isTouchDevice) sellZone.style.display = 'block';
        } else {
            if (isTouchDevice) {
                showDisplayInfo('champ', touchedChamp);
                const infoPanel = document.getElementById('infoPanel');
                if (infoPanel) {
                    infoPanel.classList.add('show');
                    const synPanel = document.getElementById('synergyPanel');
                    if (synPanel) synPanel.classList.remove('show');
                }
            }
        }
    } else {
        if (isTouchDevice) {
            const infoPanel = document.getElementById('infoPanel');
            if (infoPanel) infoPanel.classList.remove('show');
        }
    }
}
canvas.addEventListener('mousedown', handlePointerDown);
canvas.addEventListener('touchstart', (e) => {
    handlePointerDown(e);
    if (isDragging) e.preventDefault();
}, { passive: false });

// 2. SỰ KIỆN DI CHUYỂN CHUỘT (Kéo thẻ & Xem thông tin)
function handlePointerMove(e) {
    const mP = getMousePos(e);

    if (isDragging && draggedChamp) {
        if (e.type === 'touchmove') e.preventDefault(); // Ngăn cuộn trang

        const size = getCanvasCoords(draggedChamp.targetX, draggedChamp.targetY);
        draggedChamp.pixelX = mP.x - size.w / 2;
        draggedChamp.pixelY = mP.y - size.h / 2;

        const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
        if (sellZone && isTouchDevice) {
            const rect = sellZone.getBoundingClientRect();
            if (mP.rawX >= rect.left && mP.rawX <= rect.right &&
                mP.rawY >= rect.top && mP.rawY <= rect.bottom) {
                sellZone.classList.add('active');
            } else {
                sellZone.classList.remove('active');
            }
        }
    } else {
        let foundHover = null;
        for (let i = STATE.champions.length - 1; i >= 0; i--) {
            const champ = STATE.champions[i];
            if (STATE.isCombatPhase && (!champ.is_alive || champ.hp <= 0)) continue;
            const size = getCanvasCoords(champ.targetX, champ.targetY);
            if (mP.x >= champ.pixelX && mP.x <= champ.pixelX + size.w &&
                mP.y >= champ.pixelY && mP.y <= champ.pixelY + size.h) {
                foundHover = champ;
                break;
            }
        }
        if (foundHover !== hoveredChamp) {
            hoveredChamp = foundHover;
            showDisplayInfo('champ', hoveredChamp);
        }
    }
}
canvas.addEventListener('mousemove', handlePointerMove);
canvas.addEventListener('touchmove', handlePointerMove, { passive: false });

// 3. SỰ KIỆN NHẢ CHUỘT (Thả thẻ xuống ô)
function handlePointerUp(e) {
    if (isDragging && draggedChamp) {
        const mP = getMousePos(e);
        
        const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
        if (sellZone && isTouchDevice) {
            const rect = sellZone.getBoundingClientRect();
            if (mP.rawX >= rect.left && mP.rawX <= rect.right &&
                mP.rawY >= rect.top && mP.rawY <= rect.bottom) {
                sellChampion(draggedChamp);
                hoveredChamp = null;
                showDisplayInfo(null);
                
                isDragging = false;
                draggedChamp = null;
                sellZone.style.display = 'none';
                sellZone.classList.remove('active');
                return;
            }
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
            c !== draggedChamp && c.targetX === gridX && c.targetY === gridY
        );

        if (occupied) {
            occupied.targetX = originalX;
            occupied.targetY = originalY;
            occupied.originalX = originalX;
            occupied.originalY = originalY;
        }

        if (gridY < 6 && originalY === 6) {
            const currentOnBoard = STATE.champions.filter(c => c.targetY < 6 && c !== draggedChamp).length;
            if (currentOnBoard >= STATE.playerLevel) {
                showNotification("Board limit reached! Level up to deploy more.");
                gridX = originalX;
                gridY = originalY;
            }
        }

        draggedChamp.targetX = gridX;
        draggedChamp.targetY = gridY;
        draggedChamp.originalX = gridX;
        draggedChamp.originalY = gridY;

        const isTouchDev = window.matchMedia("(pointer: coarse)").matches;
        if (isTouchDev) {
            const dx = (draggedChamp.pixelX || 0) - (draggedChamp.startPixelX || 0);
            const dy = (draggedChamp.pixelY || 0) - (draggedChamp.startPixelY || 0);
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                showDisplayInfo('champ', draggedChamp);
                const infoPanel = document.getElementById('infoPanel');
                if (infoPanel) {
                    infoPanel.classList.add('show');
                    const synPanel = document.getElementById('synergyPanel');
                    if (synPanel) synPanel.classList.remove('show');
                }
            }
        }

        isDragging = false;
        draggedChamp = null;
        updateUnitCount();
        
        if (sellZone) {
            sellZone.style.display = 'none';
            sellZone.classList.remove('active');
        }
    }
}
canvas.addEventListener('mouseup', handlePointerUp);
canvas.addEventListener('touchend', handlePointerUp);

// Mobile UI Toggles
const infoPanel = document.getElementById('infoPanel');
const synergyPanel = document.getElementById('synergyPanel');

document.getElementById('toggleInfoBtn')?.addEventListener('click', () => {
    infoPanel.classList.toggle('show');
    if (synergyPanel) synergyPanel.classList.remove('show');
});

document.getElementById('toggleSynergyBtn')?.addEventListener('click', () => {
    synergyPanel.classList.toggle('show');
    if (infoPanel) infoPanel.classList.remove('show');
});

// 4. SỰ KIỆN CLICK CHUỘT PHẢI (Bán tướng)
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (STATE.isCombatPhase) return;

    const mP = getMousePos(e);
    const clickedChamp = STATE.champions.find(champ => {
        const size = getCanvasCoords(champ.targetX, champ.targetY);
        return mP.x >= champ.pixelX && mP.x <= champ.pixelX + size.w &&
            mP.y >= champ.pixelY && mP.y <= champ.pixelY + size.h;
    });

    if (clickedChamp) {
        sellChampion(clickedChamp);
        // Reset bảng thông tin về rỗng sau khi bán thẻ
        hoveredChamp = null;
        showDisplayInfo(null);
    }
});

// 5. MẤT HOVER KHI CHUỘT RỜI CANVAS
canvas.addEventListener('mouseleave', () => {
    if (!isDragging) {
        hoveredChamp = null;
        showDisplayInfo(null);
    }
});

// ==========================================
// VÒNG LẶP RENDER (GAME LOOP)
// ==========================================
function animationLoop() {
    updatePhysics();
    renderBoard(ctx, canvas);
    
    // Liên tục cập nhật thông tin panel nếu đang trong trận để hiện HP/Mana thời gian thực
    if (STATE.isCombatPhase && hoveredChamp) {
        showDisplayInfo('champ', hoveredChamp);
    }
    
    requestAnimationFrame(animationLoop);
}

// ==========================================
// TỰ ĐỘNG KHÔI PHỤC VÀ TÌM TRẬN (SAU KHI F5 TỪ GAME OVER)
// ==========================================
// 1. Kiểm tra xem ván trước có để lại lệnh "tự tìm trận" không
if (sessionStorage.getItem('autoFindMatch') === 'true') {

    // 2. Lấy tên đã cất ra và gán lại vào ô input
    const savedName = sessionStorage.getItem('savedPlayerName');
    const nameInput = document.getElementById('playerNameInput');
    if (nameInput && savedName) {
        nameInput.value = savedName;
    }

    // Xóa thư đi để nếu user tự bấm F5 bằng tay thì nó không tự tìm trận nữa
    sessionStorage.removeItem('autoFindMatch');
    sessionStorage.removeItem('savedPlayerName');

    // 3. Tự động giả lập cú Click vào nút FIND MATCH
    const findBtn = document.getElementById('findMatchBtn');
    if (findBtn) {
        setTimeout(() => {
            findBtn.click();
        }, 500); // Đợi 500ms cho socket kết nối rồi mới click
    }
}

// Khởi chạy game
refreshShop();
updateUnitCount();
animationLoop();