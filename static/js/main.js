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

    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

// 1. SỰ KIỆN NHẤN CHUỘT XUỐNG (Bắt đầu kéo)
canvas.addEventListener('mousedown', (e) => {
    if (STATE.isCombatPhase) return;
    const mP = getMousePos(e);

    STATE.champions.forEach(champ => {
        const size = getCanvasCoords(champ.targetX, champ.targetY);
        if (mP.x >= champ.pixelX && mP.x <= champ.pixelX + size.w &&
            mP.y >= champ.pixelY && mP.y <= champ.pixelY + size.h) {
            isDragging = true;
            draggedChamp = champ;
            originalX = champ.targetX;
            originalY = champ.targetY;
        }
    });
});

// 2. SỰ KIỆN DI CHUYỂN CHUỘT (Kéo thẻ & Xem thông tin)
canvas.addEventListener('mousemove', (e) => {
    const mP = getMousePos(e);

    if (isDragging && draggedChamp) {
        // Cập nhật tọa độ thẻ di chuyển theo con trỏ chuột
        const size = getCanvasCoords(draggedChamp.targetX, draggedChamp.targetY);
        draggedChamp.pixelX = mP.x - size.w / 2;
        draggedChamp.pixelY = mP.y - size.h / 2;
    } else {
        // --- LOGIC HOVER KHI RẢNH TAY ---
        let foundHover = null;

        // Quét ngược mảng để ưu tiên chọn thẻ nằm trên cùng nếu bị đè
        for (let i = STATE.champions.length - 1; i >= 0; i--) {
            const champ = STATE.champions[i];
            const size = getCanvasCoords(champ.targetX, champ.targetY);
            if (mP.x >= champ.pixelX && mP.x <= champ.pixelX + size.w &&
                mP.y >= champ.pixelY && mP.y <= champ.pixelY + size.h) {
                foundHover = champ;
                break;
            }
        }

        // Cập nhật DOM hiển thị InfoPanel
        if (foundHover !== hoveredChamp) {
            hoveredChamp = foundHover;
            showDisplayInfo('champ', hoveredChamp);
        }
    }
});

// 3. SỰ KIỆN NHẢ CHUỘT (Thả thẻ xuống ô)
canvas.addEventListener('mouseup', (e) => {
    if (isDragging && draggedChamp) {
        const mP = getMousePos(e);
        let gridX, gridY;

        if (mP.y < CONFIG.BENCH_START_Y) {
            // Thả trên sân đấu
            gridX = Math.max(0, Math.min(CONFIG.BOARD_COLS - 1, Math.floor(mP.x / CONFIG.BOARD_CELL_WIDTH)));
            gridY = Math.max(0, Math.min(CONFIG.BOARD_ROWS - 1, Math.floor(mP.y / CONFIG.BOARD_CELL_HEIGHT)));
            // Chặn không cho đặt sang vùng sân địch (Y = 0, 1, 2)
            if (gridY < 3) gridY = 3;
        } else {
            // Thả xuống hàng chờ
            gridX = Math.max(0, Math.min(CONFIG.BENCH_SLOTS - 1, Math.floor(mP.x / CONFIG.BENCH_CELL_WIDTH)));
            gridY = 6; // Y = 6 quy ước là hàng chờ
        }

        const occupied = STATE.champions.find(c =>
            c !== draggedChamp && c.targetX === gridX && c.targetY === gridY
        );

        if (occupied) {
            // Đổi chỗ nếu ô đã có chủ (Cập nhật tọa độ di chuyển)
            occupied.targetX = originalX;
            occupied.targetY = originalY;
            
            // ---> FIX LỖI: Bắt buộc phải cập nhật cả nhà gốc (original) cho Tướng bị đè <---
            occupied.originalX = originalX;
            occupied.originalY = originalY;
        }

        // Kiểm tra giới hạn quân số khi kéo thẻ từ hàng chờ lên sân
        if (gridY < 6 && originalY === 6) {
            const currentOnBoard = STATE.champions.filter(c => c.targetY < 6 && c !== draggedChamp).length;
            if (currentOnBoard >= STATE.playerLevel) {
                showNotification("Board limit reached! Level up to deploy more.");
                gridX = originalX;
                gridY = originalY;
            }
        }

        // Chốt tọa độ lưới
        draggedChamp.targetX = gridX;
        draggedChamp.targetY = gridY;
        draggedChamp.originalX = gridX;
        draggedChamp.originalY = gridY;

        isDragging = false;
        draggedChamp = null;
        updateUnitCount();
    }
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
    requestAnimationFrame(animationLoop);
}

// ==========================================
// TỰ ĐỘNG KHÔI PHỤC VÀ TÌM TRẬN (SAU KHI F5 TỪ GAME OVER)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
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
});

// Khởi chạy game
refreshShop();
updateUnitCount();
animationLoop();