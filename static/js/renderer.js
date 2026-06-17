// static/js/renderer.js
import { CONFIG, STATE, IMAGE_CACHE, getCanvasCoords } from './globals.js';

export function renderBoard(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. VẼ LƯỚI SÂN ĐẤU
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    for (let x = 0; x <= canvas.width; x += CONFIG.BOARD_CELL_WIDTH) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CONFIG.BOARD_ROWS * CONFIG.BOARD_CELL_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y <= CONFIG.BOARD_ROWS * CONFIG.BOARD_CELL_HEIGHT; y += CONFIG.BOARD_CELL_HEIGHT) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(231, 76, 60, 0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 3 * CONFIG.BOARD_CELL_HEIGHT); ctx.lineTo(canvas.width, 3 * CONFIG.BOARD_CELL_HEIGHT); ctx.stroke(); ctx.lineWidth = 1;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(0, CONFIG.BENCH_START_Y, canvas.width, CONFIG.BENCH_CELL_HEIGHT);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    for (let x = 0; x <= canvas.width; x += CONFIG.BENCH_CELL_WIDTH) {
        ctx.strokeRect(x, CONFIG.BENCH_START_Y, CONFIG.BENCH_CELL_WIDTH, CONFIG.BENCH_CELL_HEIGHT);
    }

    // 2. VẼ THẺ BÀI VÀ XỬ LÝ ĐỘ RUNG (SHAKE)
    STATE.champions.forEach(champ => {
        if (!champ.is_alive && champ.hp <= 0) return;

        const currentSize = getCanvasCoords(champ.targetX, champ.targetY);

        // CÔNG THỨC RUNG: Càng nhiều shakeTimer thì giật càng mạnh
        let shakeX = 0;
        let shakeY = 0;
        if (champ.shakeTimer > 0) {
            const intensity = champ.shakeTimer * 0.8; // Biên độ rung giật
            shakeX = (Math.random() - 0.5) * 2 * intensity;
            shakeY = (Math.random() - 0.5) * 2 * intensity;
        }

        // Tọa độ thực tế của lá bài sau khi đã cộng thêm lực rung
        const pX = champ.pixelX + shakeX;
        const pY = champ.pixelY + shakeY;

        const img = IMAGE_CACHE[champ.name];
        if (img) {
            ctx.drawImage(img, pX + 2, pY + 2, currentSize.w - 4, currentSize.h - 4);
        } else {
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(pX + 2, pY + 2, currentSize.w - 4, currentSize.h - 4);
        }

        ctx.strokeStyle = champ.team === 'Team1' ? '#4facfe' : '#ff0844';
        ctx.lineWidth = champ.targetY >= 6 ? 2 : 3.5;
        ctx.strokeRect(pX + 2, pY + 2, currentSize.w - 4, currentSize.h - 4);

        // (Đã xóa đoạn vẽ sao ở đây để dời xuống Top Layer)

        // Thanh Máu / Mana (Chống tràn viền)
        const barY = pY + currentSize.h - 11;
        const barW = currentSize.w - 8;
        const hpP = Math.max(0, Math.min(1, champ.hp / champ.max_hp));
        ctx.fillStyle = 'red'; ctx.fillRect(pX + 4, barY, barW, 3.5);
        ctx.fillStyle = '#00ff00'; ctx.fillRect(pX + 4, barY, barW * hpP, 3.5);

        const mnP = Math.max(0, Math.min(1, (champ.mana || 0) / champ.max_mana));
        ctx.fillStyle = '#444'; ctx.fillRect(pX + 4, barY + 4.5, barW, 3.5);
        ctx.fillStyle = '#00aaff'; ctx.fillRect(pX + 4, barY + 4.5, barW * mnP, 3.5);
    });

    // 3. VẼ NẮM ĐẤM VÀ ĐẠN BAY
    STATE.activeProjectiles.forEach((proj) => {
        const dx = proj.targetX - proj.x;
        const dy = proj.targetY - proj.y;
        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(proj.x, proj.y);
        ctx.rotate(angle);

        if (proj.type === 'melee') {
            // HIỆU ỨNG NẮM ĐẤM ĐỘNG NĂNG
            // Dùng sóng Sine để mô phỏng tay vươn ra (1.0) và rút về (0.0) cực kì mượt
            const progress = 1 - (proj.lifeTime / 15);
            const punchDist = Math.sin(progress * Math.PI) * 45; // Vươn ra tối đa 45px

            ctx.translate(15 + punchDist, 0); // Đẩy nắm đấm vươn về phía trước

            // Cánh tay nối từ lá bài
            ctx.fillStyle = '#d35400';
            ctx.fillRect(-25, -6, 25, 12);

            // Khối Nắm Đấm chính
            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.fillStyle = '#f39c12'; // Màu găng tay cam chói
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            // 3 Đốt ngón tay bằng sắt
            ctx.fillStyle = '#fff';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(10, -7 + i * 7, 3, 0, Math.PI * 2);
                ctx.fill();
            }

        } else {
            // Đạn năng lượng Xạ thủ (Giữ nguyên)
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00ffff';

            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(-30, 0);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff'; ctx.fill();
        }
        ctx.restore();
    });

    // 4. VỤ NỔ IMPACT KHI TRÚNG ĐÍCH HOẶC TUNG SKILL
    if (STATE.hitEffects) {
        STATE.hitEffects.forEach(hit => {
            ctx.save();
            ctx.translate(hit.x, hit.y);
            const progress = 1 - (hit.lifeTime / hit.maxLife);
            ctx.globalAlpha = hit.lifeTime / hit.maxLife;

            // A. HIỆU ỨNG ĐÁNH THƯỜNG (Không có effectType)
            if (!hit.effectType) {
                ctx.beginPath();
                ctx.arc(0, 0, 10 + progress * 30, 0, Math.PI * 2);
                ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 4 * (1 - progress); ctx.stroke();

                const sparkSize = 25 * progress;
                ctx.beginPath();
                ctx.moveTo(-sparkSize, 0); ctx.lineTo(sparkSize, 0);
                ctx.moveTo(0, -sparkSize); ctx.lineTo(0, sparkSize);
                ctx.moveTo(-sparkSize * 0.7, -sparkSize * 0.7); ctx.lineTo(sparkSize * 0.7, sparkSize * 0.7);
                ctx.moveTo(-sparkSize * 0.7, sparkSize * 0.7); ctx.lineTo(sparkSize * 0.7, -sparkSize * 0.7);
                ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3; ctx.stroke();
            }
            // B. HIỆU ỨNG TUNG KỸ NĂNG (SKILLS)
            else {
                if (hit.effectType === 'damage') {
                    // Cột sáng tím/đỏ nổ tung siêu to
                    ctx.beginPath(); ctx.arc(0, 0, 20 + progress * 70, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(155, 89, 182, 0.6)'; ctx.fill();
                    ctx.strokeStyle = '#8e44ad'; ctx.lineWidth = 6; ctx.stroke();
                }
                else if (hit.effectType === 'heal' || hit.effectType === 'regen') {
                    // Dấu thập phân xanh lá bay lên không trung
                    ctx.translate(0, -progress * 50);
                    ctx.fillStyle = '#2ecc71';
                    ctx.fillRect(-6, -18, 12, 36); ctx.fillRect(-18, -6, 36, 12);

                    // Vòng bảo hộ Aura xanh
                    ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(46, 204, 113, 0.5)'; ctx.lineWidth = 5; ctx.stroke();
                }
                else if (hit.effectType === 'buff_atk') {
                    // Lửa bốc lên hừng hực (Màu vàng/cam)
                    ctx.beginPath(); ctx.arc(0, 0, 45, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(241, 196, 15, 0.4)'; ctx.fill();

                    // Vẽ tia lửa điện
                    ctx.beginPath();
                    ctx.moveTo(-25, 25); ctx.lineTo(0, -50); ctx.lineTo(25, 25);
                    ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 4; ctx.stroke();
                }
            }
            ctx.restore();
        });
    }

    // 5. LỚP TRÊN CÙNG (TOP LAYER): VẼ SỐ SAO
    // Nằm ở cuối cùng để không bị bất kỳ thẻ bài hay đạn đạo nào che lấp
    STATE.champions.forEach(champ => {
        if (!champ.is_alive && champ.hp <= 0) return;

        // Cho phép vẽ từ 1 sao trở lên (Lúc nãy mình lỡ giấu mất thẻ 1 sao 😅)
        const starCount = champ.star || 1;
        const currentSize = getCanvasCoords(champ.targetX, champ.targetY);

        ctx.save();
        // Ép các chỉ số môi trường về chuẩn để sao không bị mờ hay ám màu của vụ nổ
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#f1c40f'; // Màu vàng lấp lánh
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';

        // Vẽ số sao lên đỉnh đầu của thẻ bài (đứng im tuyệt đối, đè lên mọi layer)
        ctx.fillText('⭐'.repeat(starCount), champ.pixelX + currentSize.w / 2, champ.pixelY - 6);

        ctx.restore();
    });
} // <--- Dấu đóng ngoặc của hàm renderBoard