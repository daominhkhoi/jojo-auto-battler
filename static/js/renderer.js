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

    // 2. VẼ LỚP THẺ BÀI (DƯỚI CÙNG)
    STATE.champions.forEach(champ => {
        if (!champ.is_alive && champ.hp <= 0) return;

        const currentSize = getCanvasCoords(champ.targetX, champ.targetY);

        let shakeX = 0; let shakeY = 0;
        if (champ.shakeTimer > 0) {
            const intensity = champ.shakeTimer * 0.8;
            shakeX = (Math.random() - 0.5) * 2 * intensity;
            shakeY = (Math.random() - 0.5) * 2 * intensity;
        }

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

        // Thanh Máu / Mana
        const barY = pY + currentSize.h - 11;
        const barW = currentSize.w - 8;
        const hpP = Math.max(0, Math.min(1, champ.hp / champ.max_hp));
        ctx.fillStyle = 'red'; ctx.fillRect(pX + 4, barY, barW, 3.5);
        ctx.fillStyle = '#00ff00'; ctx.fillRect(pX + 4, barY, barW * hpP, 3.5);

        const mnP = Math.max(0, Math.min(1, (champ.mana || 0) / champ.max_mana));

        // Nhận diện Mana Lock đổi màu thanh năng lượng
        const isManaLocked = (champ.buffs && champ.buffs.includes('mana_lock'));
        ctx.fillStyle = '#444'; ctx.fillRect(pX + 4, barY + 4.5, barW, 3.5);
        ctx.fillStyle = isManaLocked ? '#7f8c8d' : '#00aaff';
        ctx.fillRect(pX + 4, barY + 4.5, barW * mnP, 3.5);
    });

    // 2.5 LỚP HIỆU ỨNG BUFF/DEBUFF (ĐÈ LÊN MẶT LÁ BÀI)
    STATE.champions.forEach(champ => {
        if (!champ.is_alive && champ.hp <= 0) return;

        const activeBuffs = champ.buffs || [];
        if (activeBuffs.length === 0) return;

        const currentSize = getCanvasCoords(champ.targetX, champ.targetY);
        const timeNow = Date.now() / 1000;

        let shakeX = 0; let shakeY = 0;
        if (champ.shakeTimer > 0) {
            const intensity = champ.shakeTimer * 0.8;
            shakeX = (Math.random() - 0.5) * 2 * intensity;
            shakeY = (Math.random() - 0.5) * 2 * intensity;
        }
        const pX = champ.pixelX + shakeX;
        const pY = champ.pixelY + shakeY;
        const centerX = pX + currentSize.w / 2;
        const centerY = pY + currentSize.h / 2;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 1. Dính Độc (Đầu lâu báo hiệu bị độc)
        if (activeBuffs.includes('aoe_dot') || activeBuffs.includes('dot')) {
            ctx.font = '24px Arial';
            ctx.fillText('☠️', centerX, pY - 20);
        }

        if (activeBuffs.includes('aoe_heal') || activeBuffs.includes('regen')) {
            const beat = Math.abs(Math.sin(timeNow * 5)) * 5; // Trái tim đập thình thịch
            ctx.font = `${20 + beat}px Arial`;
            ctx.fillText('💖', centerX, pY - 45); // Nằm cao hơn đầu lâu 1 xíu để không bị đè
        }

        // 2. Buff Tốc Đánh (Chiếc cánh xanh dương TO)
        if (activeBuffs.includes('speed_buff')) {
            ctx.font = '32px Arial';
            ctx.fillText('🪽', pX - 5, centerY);
        }

        // 3. Buff Sức Mạnh (Cây kiếm TO)
        if (activeBuffs.includes('buff_atk')) {
            ctx.font = '32px Arial';
            ctx.fillText('⚔️', pX + currentSize.w + 5, centerY);
        }

        // 4. Stun (Choáng - Ngôi sao quay vòng)
        if (activeBuffs.includes('stun')) {
            ctx.translate(centerX, pY - 15);
            for (let i = 0; i < 3; i++) {
                const angle = (timeNow * 4) + (i * Math.PI * 2 / 3);
                const starX = Math.cos(angle) * 35;
                const starY = Math.sin(angle) * 12;

                ctx.fillStyle = '#f1c40f';
                ctx.font = '20px Arial';
                ctx.fillText('⭐', starX, starY);
            }
            ctx.translate(-centerX, -(pY - 15));
        }

        // 5. Khóa Mana (Sợi xích đen đè giữa card)
        if (activeBuffs.includes('mana_lock')) {
            ctx.font = '40px Arial';
            ctx.fillText('⛓️', centerX, centerY);
        }

        ctx.restore();
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
            const progress = 1 - (proj.lifeTime / 15);
            const punchDist = Math.sin(progress * Math.PI) * 45;

            ctx.translate(15 + punchDist, 0);

            ctx.fillStyle = '#d35400';
            ctx.fillRect(-25, -6, 25, 12);

            ctx.beginPath();
            ctx.arc(0, 0, 14, 0, Math.PI * 2);
            ctx.fillStyle = '#f39c12';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#fff';
            ctx.stroke();

            ctx.fillStyle = '#fff';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath();
                ctx.arc(10, -7 + i * 7, 3, 0, Math.PI * 2);
                ctx.fill();
            }

        } else {
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

    // 4. VỤ NỔ IMPACT KHI TRÚNG ĐÍCH HOẶC TUNG SKILL VÀ VÙNG CỐ ĐỊNH TRÊN SÂN
    if (STATE.hitEffects) {
        STATE.hitEffects.forEach(hit => {
            ctx.save();
            ctx.translate(hit.x, hit.y);
            const progress = 1 - (hit.lifeTime / hit.maxLife);

            // A. HIỆU ỨNG SÁT THƯƠNG ĐƠN MỤC TIÊU (Dấu X Chém)
            if (!hit.effectType || hit.effectType === 'damage') {
                ctx.globalAlpha = hit.lifeTime / hit.maxLife;
                const sz = 15 + progress * 20;
                ctx.beginPath();
                ctx.moveTo(-sz, -sz); ctx.lineTo(sz, sz);
                ctx.moveTo(sz, -sz); ctx.lineTo(-sz, sz);
                ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
                ctx.lineWidth = 6 * (1 - progress);
                ctx.stroke();

                ctx.beginPath(); ctx.arc(0, 0, sz / 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(231, 76, 60, ${1 - progress})`; ctx.fill();
            }
            // B. HIỆU ỨNG CÁC KỸ NĂNG VÙNG (AOE) DỰA THEO ĐÚNG DURATION VÀ RADIUS TRÊN SERVER
            else {
                // ĐỔI BÁN KÍNH Ô CỜ THÀNH PIXEL: Ô cờ * Rộng ô cờ
                const pixelRadius = (hit.radius || 1.5) * CONFIG.BOARD_CELL_WIDTH;

                // Hiệu ứng mờ dần (Fade Out) mượt mà ở 30 frame cuối cùng
                const currentAlpha = hit.lifeTime < 30 ? (hit.lifeTime / 30) : 1.0;

                if (hit.effectType === 'regen') {
                    ctx.globalAlpha = hit.lifeTime / hit.maxLife;
                    ctx.translate(0, -progress * 50);
                    ctx.fillStyle = '#2ecc71';
                    ctx.fillRect(-6, -18, 12, 36); ctx.fillRect(-18, -6, 36, 12);
                    ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2);
                    ctx.strokeStyle = 'rgba(46, 204, 113, 0.5)'; ctx.lineWidth = 5; ctx.stroke();
                }
                else if (hit.effectType === 'buff_atk' || hit.effectType === 'speed_buff') {
                    ctx.globalAlpha = hit.lifeTime / hit.maxLife;
                    ctx.beginPath(); ctx.arc(0, 0, 45, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(241, 196, 15, 0.4)'; ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(-25, 25); ctx.lineTo(0, -50); ctx.lineTo(25, 25);
                    ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 4; ctx.stroke();
                }

                // --- 1. VÙNG ĐỘC DIỆN RỘNG (AoE DoT) ---
                else if (hit.effectType === 'aoe_dot') {
                    ctx.globalAlpha = 1.0;
                    ctx.beginPath();
                    ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(142, 68, 173, ${currentAlpha * 0.45})`;
                    ctx.fill();
                    ctx.strokeStyle = `rgba(39, 174, 96, ${currentAlpha * 0.6})`;
                    ctx.lineWidth = 4; ctx.stroke();

                    // Bong bóng độc văng lách tách ngẫu nhiên tỉ lệ thuận với bán kính
                    const t = Date.now() / 150;
                    for (let j = 0; j < 5; j++) {
                        const bx = Math.cos(t + j * 1.5) * (pixelRadius * 0.6);
                        const by = Math.sin(t + j * 2.2) * (pixelRadius * 0.6);
                        ctx.beginPath();
                        ctx.arc(bx, by, 6, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(46, 204, 113, ${currentAlpha * 0.7})`;
                        ctx.fill();
                    }
                }

                // --- 2. ĐỘC ĐƠN MỤC TIÊU (DoT) ---
                else if (hit.effectType === 'dot') {
                    ctx.globalAlpha = 1.0;
                    ctx.beginPath();
                    // Vẽ một vũng độc nhỏ cố định (35 pixel) ngay dưới chân mục tiêu
                    ctx.arc(0, 0, 35, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(142, 68, 173, ${currentAlpha * 0.6})`;
                    ctx.fill();

                    // Thêm 1-2 hạt bong bóng sủi bọt nhỏ li ti
                    const t = Date.now() / 100;
                    const bx = Math.cos(t * 2.5) * 15;
                    const by = Math.sin(t * 3.5) * 15;
                    ctx.beginPath();
                    ctx.arc(bx, by, 4, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(46, 204, 113, ${currentAlpha * 0.9})`;
                    ctx.fill();
                }

                // --- VÙNG HỒI MÁU CỐ ĐỊNH THEO GIÂY CHUẨN RADIUS & DURATION ---
                else if (hit.effectType === 'aoe_heal') {
                    ctx.globalAlpha = 1.0;
                    ctx.beginPath();
                    ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(46, 204, 113, ${currentAlpha * 0.35})`; ctx.fill();
                    ctx.strokeStyle = `rgba(46, 204, 113, ${currentAlpha * 0.65})`; ctx.lineWidth = 4; ctx.stroke();

                    // Dấu cộng hồi phục bay lên liên tục
                    const dropY = ((Date.now() + hit.lifeTime * 8) % 1000) / 1000 * -60;
                    ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha * 0.8})`;
                    ctx.font = 'bold 20px Arial';
                    ctx.fillText('+', -5, dropY);
                }

                // --- VÙNG KHÓA MANA ĐƠN MỤC TIÊU (Mana Lock) ---
                else if (hit.effectType === 'mana_lock') {
                    ctx.globalAlpha = 1.0;
                    ctx.beginPath();
                    // Thay đổi bán kính thành pixelRadius (ôm theo ô cờ tướng dính chiêu) thay vì canvas.width
                    ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(44, 62, 80, ${currentAlpha * 0.8})`;
                    ctx.lineWidth = 6;
                    ctx.stroke();
                    ctx.fillStyle = `rgba(0, 0, 0, ${currentAlpha * 0.2})`;
                    ctx.fill();
                }
            }
            ctx.restore();
        });
    }   

    // 5. LỚP TRÊN CÙNG (TOP LAYER): VẼ SỐ SAO
    STATE.champions.forEach(champ => {
        if (!champ.is_alive && champ.hp <= 0) return;

        const starCount = champ.star || 1;
        const currentSize = getCanvasCoords(champ.targetX, champ.targetY);

        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';

        ctx.fillText('⭐'.repeat(starCount), champ.pixelX + currentSize.w / 2, champ.pixelY - 6);
        ctx.restore();
    });
}