// main.js
import { CONFIG, STATE, getCanvasCoords } from './globals.js';
import { buyXp, refreshShop, updateGold, updateUnitCount, sellChampion, showDisplayInfo } from './shop.js';
import { renderBoard } from './renderer.js';
import { updatePhysics } from './combat.js';
import { showNotification } from './notifications.js';
import { findMatch, declareReady } from './network.js';

const canvas = document.getElementById('gameBoard');
const ctx = canvas.getContext('2d');

// --- ĐĂNG KÝ SỰ KIỆN GIAO DIỆN ---
document.getElementById('buyXpBtn').addEventListener('click', buyXp);
document.getElementById('findMatchBtn').addEventListener('click', findMatch);
document.getElementById('readyBtn').addEventListener('click', declareReady);

document.getElementById('rollBtn').addEventListener('click', () => {
    if (STATE.isCombatPhase) {
        showNotification("Không thể đổi tướng khi đang chiến đấu!");
        return;
    }
    if (STATE.playerGold >= 2) {
        updateGold(-2);
        refreshShop();
    } else {
        showNotification("Không đủ vàng!");
    }
});

// --- HỆ THỐNG KÉO THẢ THẺ BÀI & HOVER ---
let isDragging = false;
let draggedChamp = null;
let originalX = null;
let originalY = null;
let hoveredChamp = null; // Biến lưu vết thẻ đang được trỏ chuột

// Thay thế hàm cũ bằng hàm này
function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    // Tính toán tỷ lệ chênh lệch giữa hiển thị CSS và kích thước thật của Game
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

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

canvas.addEventListener('mousemove', (e) => {
    const mP = getMousePos(e);

    if (isDragging && draggedChamp) {
        // Logic khi đang kéo thẻ: cập nhật tọa độ pixel theo chuột
        const size = getCanvasCoords(draggedChamp.targetX, draggedChamp.targetY);
        draggedChamp.pixelX = mP.x - size.w / 2;
        draggedChamp.pixelY = mP.y - size.h / 2;
    } else {
        // --- LOGIC HOVER KHI RẢNH TAY ---
        let foundHover = null;

        // Quét ngược mảng để ưu tiên chọn thẻ nằm trên cùng nếu lỡ đè nhau
        for (let i = STATE.champions.length - 1; i >= 0; i--) {
            const champ = STATE.champions[i];
            const size = getCanvasCoords(champ.targetX, champ.targetY);
            if (mP.x >= champ.pixelX && mP.x <= champ.pixelX + size.w &&
                mP.y >= champ.pixelY && mP.y <= champ.pixelY + size.h) {
                foundHover = champ;
                break;
            }
        }

        // Chỉ cập nhật DOM nếu chuột trỏ sang một mục tiêu mới (giảm tải giật lag)
        if (foundHover !== hoveredChamp) {
            hoveredChamp = foundHover;
            showDisplayInfo('champ', hoveredChamp);
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    if (isDragging && draggedChamp) {
        const mP = getMousePos(e);
        let gridX, gridY;

        if (mP.y < CONFIG.BENCH_START_Y) {
            // Thả trên sân đấu
            gridX = Math.max(0, Math.min(CONFIG.BOARD_COLS - 1, Math.floor(mP.x / CONFIG.BOARD_CELL_WIDTH)));
            gridY = Math.max(0, Math.min(CONFIG.BOARD_ROWS - 1, Math.floor(mP.y / CONFIG.BOARD_CELL_HEIGHT)));
            if (gridY < 3) gridY = 3; // Chặn không cho đặt sang vùng sân địch (Y = 0, 1, 2)
        } else {
            // Thả xuống hàng chờ
            gridX = Math.max(0, Math.min(CONFIG.BENCH_SLOTS - 1, Math.floor(mP.x / CONFIG.BENCH_CELL_WIDTH)));
            gridY = 6; // Y = 6 quy ước là hàng chờ
        }

        const occupied = STATE.champions.find(c =>
            c !== draggedChamp && c.targetX === gridX && c.targetY === gridY
        );

        if (occupied) {
            // Đổi chỗ nếu ô đã có chủ
            occupied.targetX = originalX;
            occupied.targetY = originalY;
        }

        if (gridY < 6 && originalY === 6) {
            // Kiểm tra giới hạn quân số khi kéo thẻ từ hàng chờ lên sân
            const currentOnBoard = STATE.champions.filter(c => c.targetY < 6 && c !== draggedChamp).length;
            if (currentOnBoard >= STATE.playerLevel) {
                showNotification("Đã đạt giới hạn quân số!");
                gridX = originalX; gridY = originalY;
            }
        }

        draggedChamp.targetX = gridX; draggedChamp.targetY = gridY;
        draggedChamp.originalX = gridX; draggedChamp.originalY = gridY;

        isDragging = false; draggedChamp = null; updateUnitCount();
    }
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); if (STATE.isCombatPhase) return;
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

// Xóa trắng bảng thông tin khi chuột rời hẳn khỏi Canvas bàn cờ
canvas.addEventListener('mouseleave', () => {
    if (!isDragging) {
        hoveredChamp = null;
        showDisplayInfo(null);
    }
});

function animationLoop() {
    updatePhysics();
    renderBoard(ctx, canvas);
    requestAnimationFrame(animationLoop);
}

// Khởi chạy game
refreshShop();
updateUnitCount();
animationLoop();