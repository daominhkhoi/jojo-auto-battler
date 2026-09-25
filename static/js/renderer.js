// static/js/renderer.js
import { CONFIG, STATE, IMAGE_CACHE, getCanvasCoords } from './globals.js';

export function renderBoard(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const timeNow = Date.now() / 1000;

    ctx.save();
    // Screen Shake effect
    if (STATE.screenShake && STATE.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * STATE.screenShake;
        const shakeY = (Math.random() - 0.5) * STATE.screenShake;
        ctx.translate(shakeX, shakeY);
        STATE.screenShake = Math.max(0, STATE.screenShake - 0.5);
    }

    if (IMAGE_CACHE["Background"] && IMAGE_CACHE["Background"].complete && IMAGE_CACHE["Background"].naturalHeight) {
        const bg = IMAGE_CACHE["Background"];
        const scale = canvas.height / bg.naturalHeight;
        const newWidth = bg.naturalWidth * scale;
        const xOffset = (canvas.width - newWidth) / 2;
        ctx.drawImage(bg, xOffset, 0, newWidth, canvas.height);
    }

    // 1. VẼ LƯỚI SÂN ĐẤU
    ctx.strokeStyle = 'rgba(10, 30, 60, 0.8)'; // Xanh đen
    for (let x = 0; x <= canvas.width; x += CONFIG.BOARD_CELL_WIDTH) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CONFIG.BOARD_ROWS * CONFIG.BOARD_CELL_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y <= CONFIG.BOARD_ROWS * CONFIG.BOARD_CELL_HEIGHT; y += CONFIG.BOARD_CELL_HEIGHT) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(231, 76, 60, 0.6)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 3 * CONFIG.BOARD_CELL_HEIGHT); ctx.lineTo(canvas.width, 3 * CONFIG.BOARD_CELL_HEIGHT); ctx.stroke(); ctx.lineWidth = 1;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // Nền khu chờ tối đi chút
    ctx.fillRect(0, CONFIG.BENCH_START_Y, canvas.width, CONFIG.BENCH_CELL_HEIGHT);
    ctx.strokeStyle = 'rgba(10, 30, 60, 0.8)'; // Xanh đen cho viền khu chờ
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
        const centerX = pX + currentSize.w / 2;
        const centerY = pY + currentSize.h / 2;

        ctx.globalAlpha = (champ.buffs && champ.buffs.includes('submerge')) ? 0.3 : 1.0;

        // VẼ AURA DƯỚI CHÂN TƯỚNG (THAY CHO EMOJI)
        ctx.save();
        if (champ.buffs && champ.buffs.includes('buff_atk')) {
            const angle = timeNow * 3;
            ctx.translate(centerX, centerY); ctx.rotate(angle);
            ctx.beginPath(); ctx.arc(0, 0, currentSize.w/2 + 10, 0, Math.PI * 2);
            ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 4; ctx.setLineDash([15, 10]);
            ctx.stroke(); ctx.restore(); ctx.save();
        }
        if (champ.buffs && champ.buffs.includes('speed_buff')) {
            const angle = -timeNow * 5;
            ctx.translate(centerX, centerY); ctx.rotate(angle);
            ctx.beginPath(); ctx.arc(0, 0, currentSize.w/2 + 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; ctx.setLineDash([20, 20]);
            ctx.stroke(); ctx.restore(); ctx.save();
        }
        ctx.restore();

        // XỬ LÝ HÓA BIẾN (POLYMORPH) - BIẾN THÀNH ỐC SÊN
        if (champ.buffs && champ.buffs.includes('polymorph')) {
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(pX + 2, pY + 2, currentSize.w - 4, currentSize.h - 4);
            ctx.font = '50px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('🐌', pX + currentSize.w / 2, pY + currentSize.h / 2);
        } else {
            // Vẽ ảnh bình thường
            const img = IMAGE_CACHE[champ.name];
            if (img) {
                ctx.drawImage(img, pX + 2, pY + 2, currentSize.w - 4, currentSize.h - 4);
            } else {
                ctx.fillStyle = '#2c3e50'; ctx.fillRect(pX + 2, pY + 2, currentSize.w - 4, currentSize.h - 4);
            }
        }

        // HIT REACTION: Flash white briefly when taking damage
        if (champ.hitFlashTimer && champ.hitFlashTimer > 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
            ctx.fillRect(pX + 2, pY + 2, currentSize.w - 4, currentSize.h - 4);
        }

        // Xác định team của người chơi hiện tại dựa trên các tướng có originalX
        const localTeam = STATE.champions.find(c => c.originalX !== undefined)?.team || 'Team1';
        const isAlly = (champ.team === localTeam);

        // VẼ HÀO QUANG CHO TƯỚNG 2⭐ VÀ 3⭐ (GODLY STAR AURA)
        const starCount = champ.star || 1;
        if (starCount >= 2) {
            ctx.save();
            if (starCount === 2) {
                // 2⭐: Hào quang Lục Bảo nhẹ nhàng pulsing
                const glowAlpha = 0.5 + Math.sin(timeNow * 4 + pX * 0.1) * 0.3;
                ctx.shadowBlur = 14;
                ctx.shadowColor = '#2ecc71';
                ctx.strokeStyle = `rgba(46, 204, 113, ${glowAlpha})`;
                ctx.lineWidth = 3.5;
                ctx.strokeRect(pX + 1, pY + 1, currentSize.w - 2, currentSize.h - 2);
            } else if (starCount >= 3) {
                // 3⭐: HÀO QUANG THẦN THOẠI (GOLDEN FLAME & ORBITING ORBS)
                const pulse = 0.65 + Math.sin(timeNow * 6 + pY * 0.1) * 0.35;
                ctx.shadowBlur = 22;
                ctx.shadowColor = '#ffd700';
                ctx.strokeStyle = `rgba(255, 215, 0, ${pulse})`;
                ctx.lineWidth = 4.5;
                ctx.strokeRect(pX, pY, currentSize.w, currentSize.h);

                // 4 Hạt ánh sáng thần thoại xoay quanh tướng 3⭐
                for (let orb = 0; orb < 4; orb++) {
                    const orbAngle = (timeNow * 3.5) + (orb * Math.PI / 2);
                    const rx = (currentSize.w / 2 + 8) * Math.cos(orbAngle);
                    const ry = (currentSize.h / 2 + 8) * Math.sin(orbAngle);
                    ctx.beginPath();
                    ctx.arc(centerX + rx, centerY + ry, 3.5, 0, Math.PI * 2);
                    ctx.fillStyle = orb % 2 === 0 ? '#ffffff' : '#ffd700';
                    ctx.shadowBlur = 12;
                    ctx.shadowColor = '#ffd700';
                    ctx.fill();
                }
            }
            ctx.restore();
        }

        ctx.strokeStyle = isAlly ? '#4facfe' : '#ff0844';
        ctx.lineWidth = champ.targetY >= 6 ? 2 : 3.5;
        ctx.strokeRect(pX + 2, pY + 2, currentSize.w - 4, currentSize.h - 4);

        // Thanh Máu / Mana (Dày hơn và có viền phân biệt đội)
        const barHeight = 5;
        const barSpacing = 1;
        const totalBarHeight = barHeight * 2 + barSpacing;
        const barY = pY + currentSize.h - totalBarHeight - 4;
        const barW = currentSize.w - 8;
        
        // Vẽ viền (Border)
        ctx.strokeStyle = isAlly ? '#4facfe' : '#ff0844';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pX + 4 - 1, barY - 1, barW + 2, totalBarHeight + 2);

        // Thanh Máu Nền Đen
        ctx.fillStyle = '#111111';
        ctx.fillRect(pX + 4, barY, barW, barHeight);

        // Ghost HP (Thanh máu bóng mờ tụt dần phía sau)
        const ghostHpP = Math.max(0, Math.min(1, (champ.ghostHp || champ.hp) / champ.max_hp));
        ctx.fillStyle = '#ffecb3';
        ctx.fillRect(pX + 4, barY, barW * ghostHpP, barHeight);

        // Thanh Máu Thực
        const hpP = Math.max(0, Math.min(1, champ.hp / champ.max_hp));
        ctx.fillStyle = isAlly ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(pX + 4, barY, barW * hpP, barHeight);

        // Giáp ảo (Shield) - Vẽ đè lên thanh máu
        if (champ.shield && champ.shield > 0) {
            const shP = Math.min(1, champ.shield / champ.max_hp);
            ctx.fillStyle = 'rgba(236, 240, 241, 0.9)'; // Màu trắng đục
            ctx.fillRect(pX + 4, barY, barW * shP, barHeight);
        }

        // Thanh Mana & Sẵn Sàng Chiêu Cuối (NEON CYAN SURGE)
        const mnP = Math.max(0, Math.min(1, (champ.mana || 0) / champ.max_mana));
        const isManaLocked = (champ.buffs && champ.buffs.includes('mana_lock'));
        const isUltimateReady = !isManaLocked && (champ.mana >= champ.max_mana);

        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(pX + 4, barY + barHeight + barSpacing, barW, barHeight);

        if (isUltimateReady) {
            // PULSING NEON CYAN-WHITE (ULTIMATE READY!)
            const readyGlow = 0.75 + Math.sin(timeNow * 10) * 0.25;
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00ffff';
            ctx.fillStyle = `rgba(0, 255, 255, ${readyGlow})`;
            ctx.fillRect(pX + 4, barY + barHeight + barSpacing, barW, barHeight);
            ctx.restore();
        } else {
            ctx.fillStyle = isManaLocked ? '#7f8c8d' : '#00aaff';
            ctx.fillRect(pX + 4, barY + barHeight + barSpacing, barW * mnP, barHeight);
        }
    });

    // 2.5 LỚP HIỆU ỨNG BUFF/DEBUFF (ĐÈ LÊN MẶT LÁ BÀI VÀ CÁC HIỆU ỨNG ĐẶC BIỆT)
    STATE.champions.forEach(champ => {
        if (!champ.is_alive && champ.hp <= 0) return;

        const activeBuffs = champ.buffs || [];
        if (activeBuffs.length === 0) return;

        const currentSize = getCanvasCoords(champ.targetX, champ.targetY);
        const pX = champ.pixelX; const pY = champ.pixelY;
        const centerX = pX + currentSize.w / 2;
        const centerY = pY + currentSize.h / 2;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (activeBuffs.includes('hp_shield')) {
            const radius = currentSize.w / 2 + 5;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(236, 240, 241, ${0.5 + Math.sin(timeNow*5)*0.3})`;
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.fillStyle = `rgba(236, 240, 241, 0.2)`;
            ctx.fill();
        }

        if (activeBuffs.includes('reflect_shield')) {
            const hRadius = currentSize.w / 2 + 5;
            const pulse = 0.55 + Math.sin(timeNow * 4) * 0.25;
            ctx.save();
            ctx.beginPath();
            // Draw sleek 6-point crystal hexagon barrier
            for (let side = 0; side < 6; side++) {
                const angle = (Math.PI / 3) * side - Math.PI / 6;
                const hx = centerX + hRadius * Math.cos(angle);
                const hy = centerY + (hRadius * 1.1) * Math.sin(angle);
                if (side === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            ctx.strokeStyle = `rgba(162, 155, 254, ${pulse})`;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // 6 glowing vertex crystals (tiny 3px diamond points)
            ctx.fillStyle = '#ffffff';
            for (let side = 0; side < 6; side++) {
                const angle = (Math.PI / 3) * side - Math.PI / 6;
                const hx = centerX + hRadius * Math.cos(angle);
                const hy = centerY + (hRadius * 1.1) * Math.sin(angle);
                ctx.fillRect(hx - 1.5, hy - 1.5, 3, 3);
            }
            ctx.restore();
        }

        if (activeBuffs.includes('stun')) {
            ctx.translate(centerX, pY - 15);
            for (let i = 0; i < 3; i++) {
                const angle = (timeNow * 4) + (i * Math.PI * 2 / 3);
                const starX = Math.cos(angle) * 30;
                const starY = Math.sin(angle) * 8;
                ctx.fillStyle = '#f1c40f'; ctx.font = '18px Arial'; ctx.fillText('⭐', starX, starY);
            }
            ctx.translate(-centerX, -(pY - 15));
        }

        if (activeBuffs.includes('time_stopped')) {
            ctx.fillStyle = 'rgba(127, 140, 141, 0.5)';
            ctx.fillRect(pX, pY, currentSize.w, currentSize.h);
        }

        if (activeBuffs.includes('mind_control')) {
            ctx.font = '30px Arial'; ctx.fillText('💔', centerX, centerY - 20);
        }

        if (activeBuffs.includes('banish')) {
            ctx.translate(centerX, centerY);
            ctx.rotate(timeNow * 10);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.beginPath(); ctx.arc(0, 0, currentSize.w/2, 0, Math.PI*2); ctx.fill();
            ctx.translate(-centerX, -centerY);
        }

        if (activeBuffs.includes('dot')) {
            ctx.fillStyle = `rgba(142, 68, 173, ${0.4 + Math.sin(timeNow*8)*0.2})`;
            ctx.beginPath(); ctx.arc(centerX, pY + currentSize.h - 10, 15, 0, Math.PI*2); ctx.fill();
        }

        if (activeBuffs.includes('regen') || activeBuffs.includes('aoe_heal')) {
            ctx.fillStyle = `rgba(46, 204, 113, ${0.4 + Math.sin(timeNow*5)*0.2})`;
            ctx.beginPath(); ctx.arc(centerX, pY + currentSize.h - 10, 15, 0, Math.PI*2); ctx.fill();
        }

        if (activeBuffs.includes('damage_link') || activeBuffs.includes('life_tether')) {
            const buffDetails = champ.buff_details || [];
            const linkBuff = buffDetails.find(b => b.type === 'damage_link' || b.type === 'life_tether');
            if (linkBuff && linkBuff.caster_id) {
                const caster = STATE.champions.find(c => c.id === linkBuff.caster_id);
                if (caster) {
                    const cSize = getCanvasCoords(caster.targetX, caster.targetY);
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.lineTo(caster.pixelX + cSize.w/2, caster.pixelY + cSize.h/2);
                    ctx.strokeStyle = activeBuffs.includes('damage_link') ? '#c0392b' : '#2ecc71';
                    ctx.lineWidth = 4;
                    ctx.setLineDash([10, 15]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }

            ctx.strokeStyle = activeBuffs.includes('damage_link') ? '#c0392b' : '#2ecc71';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath(); ctx.arc(centerX, centerY, currentSize.w/2 + 2, 0, Math.PI*2); ctx.stroke();
            ctx.setLineDash([]);
        }

        if (activeBuffs.includes('stat_steal_beneficiary')) {
            const pulse = 0.5 + Math.sin(timeNow * 8) * 0.3;
            ctx.save();
            ctx.shadowBlur = 14;
            ctx.shadowColor = '#e74c3c';
            ctx.beginPath();
            ctx.ellipse(centerX, centerY + currentSize.h / 2 - 4, currentSize.w / 2 + 6, 12, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(231, 76, 60, ${pulse})`;
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.fillStyle = `rgba(155, 89, 182, 0.25)`;
            ctx.fill();

            ctx.fillStyle = '#f1c40f';
            ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
            ctx.fillText('⚔️+ATK', centerX, pY - 8);
            ctx.restore();
        }

        if (activeBuffs.includes('stat_steal_victim')) {
            const pulse = 0.4 + Math.sin(timeNow * 6) * 0.25;
            ctx.save();
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#c0392b';
            ctx.beginPath();
            ctx.ellipse(centerX, centerY + currentSize.h / 2 - 4, currentSize.w / 2 + 4, 10, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(192, 57, 43, ${pulse})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = '#ff4757';
            ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
            ctx.fillText('🔻-ATK', centerX, pY - 8);
            ctx.restore();
        }
        
        ctx.restore();
    });

    // 3. VẼ ĐẠN BAY VÀ HIỆU ỨNG ĐÁNH GẦN (PROJECTILES & MELEE)
    STATE.activeProjectiles.forEach((proj) => {
        const dx = proj.targetX - proj.x;
        const dy = proj.targetY - proj.y;
        const angle = proj.angle !== undefined ? proj.angle : Math.atan2(dy, dx);
        const isCrit = !!proj.isCrit;

        ctx.save();
        ctx.translate(proj.x, proj.y);
        ctx.rotate(angle);

        if (proj.type === 'melee') {
            const maxL = proj.maxLife || 10;
            const progress = 1 - (proj.lifeTime / maxL);
            const fade = Math.sin(progress * Math.PI); // Smooth in & out fade
            const slashDist = 15 + progress * 35;

            ctx.save();
            ctx.translate(slashDist, 0);

            // A. Expanding Compressed Shockwave Arc
            ctx.beginPath();
            ctx.arc(10, 0, 15 + progress * 25, -Math.PI * 0.4, Math.PI * 0.4);
            ctx.strokeStyle = isCrit ? `rgba(255, 215, 0, ${fade * 0.5})` : `rgba(255, 255, 255, ${fade * 0.4})`;
            ctx.lineWidth = Math.max(1, 2 * (1 - progress));
            ctx.stroke();

            // B. Dynamic Crescent Slash Blade (Lưỡi liềm sắc nhọn cong vút)
            // Outer radiant flame/blade (Multi-layer glow, zero shadowBlur!)
            ctx.beginPath();
            ctx.moveTo(-15, -35);
            ctx.quadraticCurveTo(18, 0, -15, 35);
            ctx.quadraticCurveTo(8, 0, -15, -35);
            ctx.closePath();
            ctx.fillStyle = isCrit ? `rgba(241, 196, 15, ${fade * 0.85})` : `rgba(231, 76, 60, ${fade * 0.85})`;
            ctx.fill();

            // Inner razor white core
            ctx.beginPath();
            ctx.moveTo(-8, -25);
            ctx.quadraticCurveTo(15, 0, -8, 25);
            ctx.quadraticCurveTo(7, 0, -8, -25);
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 255, 255, ${fade * 0.95})`;
            ctx.fill();

            // C. Speed cutting lines (Vệt chém xé gió)
            ctx.beginPath();
            ctx.moveTo(-20, -18); ctx.lineTo(12, -22);
            ctx.moveTo(-20, 18);  ctx.lineTo(12, 22);
            ctx.strokeStyle = isCrit ? `rgba(255, 242, 0, ${fade * 0.8})` : `rgba(255, 255, 255, ${fade * 0.7})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.restore();
        } else {
            // A. Aero-Ribbon Tail (Đuôi dải lụa năng lượng vuốt nhọn không đứt đoạn)
            const tailLen = 42;
            const tailGrad = ctx.createLinearGradient(0, 0, -tailLen, 0);
            if (isCrit) {
                tailGrad.addColorStop(0, 'rgba(255, 215, 0, 0.95)');
                tailGrad.addColorStop(0.4, 'rgba(243, 156, 18, 0.6)');
                tailGrad.addColorStop(1, 'rgba(231, 76, 60, 0)');
            } else {
                tailGrad.addColorStop(0, 'rgba(0, 255, 255, 0.95)');
                tailGrad.addColorStop(0.4, 'rgba(30, 144, 255, 0.6)');
                tailGrad.addColorStop(1, 'rgba(10, 61, 98, 0)');
            }

            // Tapered aerodynamic ribbon
            ctx.beginPath();
            ctx.moveTo(0, -4.5);
            ctx.lineTo(-tailLen, 0);
            ctx.lineTo(0, 4.5);
            ctx.closePath();
            ctx.fillStyle = tailGrad;
            ctx.fill();

            // Inner white high-speed core streak
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-tailLen * 0.65, 0);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.stroke();

            // B. Orbiting Plasma Sparks (2 Hạt quang năng xoắn ốc DNA)
            const spiralAngle = timeNow * 24;
            const orbY1 = Math.sin(spiralAngle) * 7.5;
            const orbY2 = Math.sin(spiralAngle + Math.PI) * 6;

            ctx.beginPath();
            ctx.arc(0, orbY1, 2.2, 0, Math.PI * 2);
            ctx.fillStyle = isCrit ? '#ffffff' : '#00ffff';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(-8, orbY2, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = isCrit ? '#ffd700' : '#70a1ff';
            ctx.fill();

            // C. Multi-layer Glowing Energy Head (Zero shadowBlur - blazing fast!)
            ctx.beginPath();
            ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = isCrit ? 'rgba(241, 196, 15, 0.45)' : 'rgba(0, 255, 255, 0.45)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = isCrit ? '#ffd700' : '#00d2d3';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
        ctx.restore();
    });

    // 4. VỤ NỔ IMPACT KHI TRÚNG ĐÍCH HOẶC TUNG SKILL VÀ VÙNG CỐ ĐỊNH TRÊN SÂN
    if (STATE.hitEffects) {
        STATE.hitEffects.forEach(hit => {
            ctx.save();
            ctx.translate(hit.x, hit.y);
            const progress = 1 - (hit.lifeTime / hit.maxLife);
            const currentAlpha = hit.lifeTime < 30 ? (hit.lifeTime / 30) : 1.0;
            const pixelRadius = (hit.radius || 1.5) * CONFIG.BOARD_CELL_WIDTH;

            if (!hit.effectType || hit.effectType === 'damage' || hit.effectType === 'attack_hit') {
                const isCrit = hit.isCrit;
                const isRanged = hit.hitType === 'ranged';
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.2);

                // 1. Expanding Shockwave Ring (Đậm nét với viền bóng tối tương phản)
                const ringRadius = (isCrit ? 10 : 6) + progress * (isCrit ? 38 : 24);
                const ringAlpha = (1 - progress) * (isCrit ? 0.95 : 0.75);
                
                // Dark contrast backing ring
                ctx.beginPath();
                ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(15, 15, 20, ${ringAlpha * 0.75})`;
                ctx.lineWidth = Math.max(1, (1 - progress) * (isCrit ? 7 : 4.5));
                ctx.stroke();

                // Vibrant colored shockwave
                ctx.beginPath();
                ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
                ctx.strokeStyle = isCrit
                    ? `rgba(255, 215, 0, ${ringAlpha})`
                    : (isRanged ? `rgba(0, 255, 255, ${ringAlpha})` : `rgba(255, 71, 87, ${ringAlpha})`);
                ctx.lineWidth = Math.max(1, (1 - progress) * (isCrit ? 4.5 : 2.5));
                ctx.stroke();

                // 2. 4-Point Radiant Diamond Star (Ngôi sao phát quang 4 cánh đậm đà)
                const starSize = (isCrit ? 30 : 20) * (1 - progress * 0.7);
                const starInner = starSize * 0.22;

                const drawStarPath = (sz, inSz) => {
                    ctx.beginPath();
                    ctx.moveTo(0, -sz);
                    ctx.lineTo(inSz, -inSz);
                    ctx.lineTo(sz, 0);
                    ctx.lineTo(inSz, inSz);
                    ctx.lineTo(0, sz);
                    ctx.lineTo(-inSz, inSz);
                    ctx.lineTo(-sz, 0);
                    ctx.lineTo(-inSz, -inSz);
                    ctx.closePath();
                };

                // Dark outline for star
                drawStarPath(starSize + 2.5, (starSize + 2.5) * 0.22);
                ctx.fillStyle = `rgba(10, 10, 15, ${alpha * 0.85})`;
                ctx.fill();

                // Vibrant colored star
                drawStarPath(starSize, starInner);
                ctx.fillStyle = isCrit
                    ? `rgba(243, 156, 18, ${alpha * 0.95})`
                    : (isRanged ? `rgba(0, 210, 211, ${alpha * 0.95})` : `rgba(235, 77, 75, ${alpha * 0.95})`);
                ctx.fill();

                // Inner Star Core (Brilliant White)
                const innerSz = starSize * 0.55;
                drawStarPath(innerSz, innerSz * 0.22);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();

                // 3. Diagonal Sparks for Crit (Tia chớp chí mạng đậm nét)
                if (isCrit) {
                    const rayLen = starSize * 1.4;
                    // Dark back-stroke
                    ctx.beginPath();
                    ctx.moveTo(-rayLen, -rayLen); ctx.lineTo(rayLen, rayLen);
                    ctx.moveTo(rayLen, -rayLen);  ctx.lineTo(-rayLen, rayLen);
                    ctx.strokeStyle = `rgba(20, 15, 0, ${alpha * 0.85})`;
                    ctx.lineWidth = Math.max(1, 4.5 * (1 - progress));
                    ctx.lineCap = 'round';
                    ctx.stroke();

                    // Golden stroke
                    ctx.beginPath();
                    ctx.moveTo(-rayLen, -rayLen); ctx.lineTo(rayLen, rayLen);
                    ctx.moveTo(rayLen, -rayLen);  ctx.lineTo(-rayLen, rayLen);
                    ctx.strokeStyle = `rgba(255, 242, 0, ${alpha})`;
                    ctx.lineWidth = Math.max(1, 2.8 * (1 - progress));
                    ctx.stroke();
                }
            }
            else if (hit.effectType === 'aoe_dot') {
                const alpha = Math.min(1.0, currentAlpha * 1.3);
                ctx.globalAlpha = alpha;

                // 1. Dark Miasma Pool (Vùng ăn mòn tím độc siêu đậm & sắc nét)
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(38, 8, 68, ${alpha * 0.78})`;
                ctx.fill();

                // Dark outer boundary ring
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(18, 4, 32, ${alpha * 0.95})`;
                ctx.lineWidth = 7;
                ctx.stroke();

                // 2. Neon Biohazard Perimeter Ring (Vành đai độc tố phát quang rực rỡ)
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(186, 85, 211, ${alpha})`;
                ctx.lineWidth = 4.5;
                ctx.stroke();

                // Inner magenta dashed ring
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius - 3, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(243, 104, 224, ${alpha * 0.85})`;
                ctx.lineWidth = 1.8;
                ctx.stroke();

                // 3. Rotating Toxic Sawblade Vortex (Vòng xoáy cưa răng cưa sắc bén)
                ctx.save();
                ctx.rotate(timeNow * 2.2);
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius * 0.72, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(224, 86, 253, ${alpha})`;
                ctx.lineWidth = 4.5;
                ctx.setLineDash([18, 12]);
                ctx.stroke();

                // 4 Orbiting toxic acid orbs (Hạt độc ngọc xanh phát quang có viền đậm)
                for (let orb = 0; orb < 4; orb++) {
                    const oAngle = (orb * Math.PI / 2);
                    const ox = Math.cos(oAngle) * pixelRadius * 0.72;
                    const oy = Math.sin(oAngle) * pixelRadius * 0.72;
                    
                    // Dark contour
                    ctx.beginPath();
                    ctx.arc(ox, oy, 7, 0, Math.PI * 2);
                    ctx.fillStyle = '#0f1412';
                    ctx.fill();

                    // Neon acid body
                    ctx.beginPath();
                    ctx.arc(ox, oy, 5.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#00ff88';
                    ctx.fill();

                    // Core bright white
                    ctx.beginPath();
                    ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                }
                ctx.restore();
            }
            else if (hit.effectType === 'aoe_heal') {
                const alpha = Math.min(1.0, currentAlpha * 1.3);
                ctx.globalAlpha = alpha;

                // 1. Radiant Sanctuary Base (Vùng thánh địa sinh mệnh xanh ngọc lục bảo đậm đà)
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(16, 85, 45, ${alpha * 0.68})`;
                ctx.fill();

                // Dark forest border ring
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(8, 42, 22, ${alpha * 0.95})`;
                ctx.lineWidth = 7;
                ctx.stroke();

                // 2. Luminous Emerald Perimeter Ring (Vành đai ngọc lục bảo nổi bật)
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(46, 204, 113, ${alpha})`;
                ctx.lineWidth = 4.5;
                ctx.stroke();

                // Inner bright white halo
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius - 3, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
                ctx.lineWidth = 1.8;
                ctx.stroke();

                // 3. Sacred Lotus / Hexagram Mandala (Hoa sen ánh sáng quay êm dịu, nét đậm tinh xảo)
                ctx.save();
                ctx.rotate(-timeNow * 1.2);
                const petalCount = 6;
                const mR = pixelRadius * 0.68;

                // Dark back-stroke mandala
                ctx.beginPath();
                for (let pt = 0; pt < petalCount; pt++) {
                    const ang = (pt * Math.PI * 2) / petalCount;
                    const px = Math.cos(ang) * mR;
                    const py = Math.sin(ang) * mR;
                    if (pt === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.strokeStyle = `rgba(10, 45, 25, ${alpha * 0.9})`;
                ctx.lineWidth = 5.5;
                ctx.stroke();

                // Brilliant white sacred geometry lines
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
                ctx.lineWidth = 3.2;
                ctx.stroke();

                // 6 Floating Life Sparks on vertices (Ngọc ngọc bích phát quang tại các đỉnh)
                for (let pt = 0; pt < petalCount; pt++) {
                    const ang = (pt * Math.PI * 2) / petalCount;
                    const px = Math.cos(ang) * mR;
                    const py = Math.sin(ang) * mR;
                    
                    ctx.beginPath();
                    ctx.arc(px, py, 6, 0, Math.PI * 2);
                    ctx.fillStyle = '#082a16';
                    ctx.fill();

                    ctx.beginPath();
                    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
                    ctx.fillStyle = '#2ecc71';
                    ctx.fill();

                    ctx.beginPath();
                    ctx.arc(px, py, 2.2, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                }

                // Center Healing Cross / Holy Star
                ctx.beginPath();
                ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
                ctx.moveTo(0, -10); ctx.lineTo(0, 10);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.lineWidth = 3.5;
                ctx.stroke();

                ctx.restore();
            }
            else if (hit.effectType === 'mana_lock') {
                const alpha = Math.min(1.0, currentAlpha * 1.3);
                ctx.globalAlpha = alpha;

                // 1. Dark Abyssal Seal Ground (Trận đồ phong ấn hắc ám siêu đậm)
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(12, 16, 26, ${alpha * 0.92})`;
                ctx.fill();

                // Outer blood-crimson runic ring
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(192, 57, 43, ${alpha * 0.98})`;
                ctx.lineWidth = 5.5;
                ctx.stroke();

                // Inner dark ring
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius - 3.5, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(20, 5, 5, ${alpha})`;
                ctx.lineWidth = 2;
                ctx.stroke();

                // 2. Cursed Iron Chains crossed in 'X' (Xích cấm chú 3 lớp cực nặng và nổi bật)
                const sz = pixelRadius * 0.72;
                ctx.save();
                
                // Layer 1: Dark chain shadow
                ctx.strokeStyle = `rgba(10, 5, 5, ${alpha * 0.95})`;
                ctx.lineWidth = 9;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(-sz, -sz); ctx.lineTo(sz, sz);
                ctx.moveTo(sz, -sz); ctx.lineTo(-sz, sz);
                ctx.stroke();

                // Layer 2: Heavy cursed bloody steel
                ctx.strokeStyle = `rgba(231, 76, 60, ${alpha})`;
                ctx.lineWidth = 6;
                ctx.setLineDash([12, 6]);
                ctx.beginPath();
                ctx.moveTo(-sz, -sz); ctx.lineTo(sz, sz);
                ctx.moveTo(sz, -sz); ctx.lineTo(-sz, sz);
                ctx.stroke();

                // Layer 3: Razor white chain links
                ctx.setLineDash([]);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.moveTo(-sz, -sz); ctx.lineTo(sz, sz);
                ctx.moveTo(sz, -sz); ctx.lineTo(-sz, sz);
                ctx.stroke();

                // Center heavy lock seal badge (Khóa phong ấn to bản, đậm nét)
                ctx.beginPath();
                ctx.arc(0, 0, 13, 0, Math.PI * 2);
                ctx.fillStyle = '#1e0505';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(0, 0, 11, 0, Math.PI * 2);
                ctx.fillStyle = '#c0392b';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.restore();
            }
            else if (hit.effectType === 'return_to_zero') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                const maxRadius = canvas.width * 1.5;
                const r = progress * maxRadius;
                
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                
                const innerR = Math.max(1, r * 0.8);
                const outerR = Math.max(2, r);
                const gradient = ctx.createRadialGradient(0, 0, innerR, 0, 0, outerR);
                gradient.addColorStop(0, `rgba(255, 215, 0, 0)`);
                gradient.addColorStop(0.8, `rgba(255, 215, 0, ${1 - progress})`);
                gradient.addColorStop(1, `rgba(255, 255, 255, ${1 - progress})`);
                
                ctx.fillStyle = gradient;
                ctx.fill();
                
                // Dark outer backing ring for high contrast
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(30, 20, 0, ${(1 - progress) * 0.9})`;
                ctx.lineWidth = 14;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
                ctx.lineWidth = 8;
                ctx.stroke();
            }
            else if (hit.effectType === 'time_stop' || hit.effectType === 'global_slow') {
                // Sóng âm đồng hồ ngưng đọng thời gian với mặt đồng hồ La Mã - Đậm nét, sắc sảo
                ctx.globalAlpha = 1.0;
                const r = progress * canvas.width * 0.9;
                
                // Dark backing
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 20, 30, ${(1 - progress) * 0.85})`;
                ctx.lineWidth = 18 * (1 - progress);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.strokeStyle = hit.effectType === 'time_stop' ? `rgba(0, 255, 255, ${1 - progress})` : `rgba(230, 126, 34, ${1 - progress})`;
                ctx.lineWidth = 12 * (1 - progress);
                ctx.stroke();

                if (hit.effectType === 'time_stop' && r > 40) {
                    ctx.save();
                    ctx.font = 'bold 24px "Times New Roman", serif';
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    const clockR = r * 0.72;
                    
                    // Dark text shadow outline
                    ctx.fillStyle = `rgba(0, 15, 25, ${(1 - progress) * 0.95})`;
                    [-1.5, 1.5].forEach(dx => {
                        [-1.5, 1.5].forEach(dy => {
                            ctx.fillText('XII', dx, -clockR + dy);
                            ctx.fillText('III', clockR + dx, dy);
                            ctx.fillText('VI', dx, clockR + dy);
                            ctx.fillText('IX', -clockR + dx, dy);
                        });
                    });

                    // Bright text
                    ctx.fillStyle = `rgba(255, 255, 255, ${(1 - progress) * 0.95})`;
                    ctx.fillText('XII', 0, -clockR);
                    ctx.fillText('III', clockR, 0);
                    ctx.fillText('VI', 0, clockR);
                    ctx.fillText('IX', -clockR, 0);

                    // Kim đồng hồ xoay đậm nét
                    ctx.rotate(timeNow * 8);
                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -clockR * 0.8);
                    ctx.strokeStyle = `rgba(0, 20, 30, ${1 - progress})`;
                    ctx.lineWidth = 7; ctx.stroke();

                    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -clockR * 0.8);
                    ctx.strokeStyle = `rgba(0, 255, 255, ${1 - progress})`;
                    ctx.lineWidth = 4; ctx.stroke();
                    ctx.restore();
                }
            }
            else if (hit.effectType === 'execute') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.5);
                ctx.globalAlpha = alpha;
                const sz = progress * 115;

                // Guillotine Crimson Cross Cleave (Trảm quyết lưỡi hái tử thần - Siêu đậm, siêu bén)
                // Layer 1: Obsidian Shadow Border (Viền đen tương phản cực mạnh)
                ctx.beginPath();
                ctx.moveTo(-sz, -sz); ctx.lineTo(sz, sz);
                ctx.moveTo(sz, -sz); ctx.lineTo(-sz, sz);
                ctx.strokeStyle = `rgba(25, 0, 5, ${alpha * 0.95})`;
                ctx.lineWidth = Math.max(1, 22 * (1 - progress));
                ctx.lineCap = 'round';
                ctx.stroke();

                // Layer 2: Outer bloody crimson slash cross
                ctx.beginPath();
                ctx.moveTo(-sz, -sz); ctx.lineTo(sz, sz);
                ctx.moveTo(sz, -sz); ctx.lineTo(-sz, sz);
                ctx.strokeStyle = `rgba(255, 23, 68, ${alpha})`;
                ctx.lineWidth = Math.max(1, 14 * (1 - progress));
                ctx.stroke();

                // Layer 3: Inner razor-sharp pure white core
                ctx.beginPath();
                ctx.moveTo(-sz * 0.8, -sz * 0.8); ctx.lineTo(sz * 0.8, sz * 0.8);
                ctx.moveTo(sz * 0.8, -sz * 0.8); ctx.lineTo(-sz * 0.8, sz * 0.8);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.lineWidth = Math.max(1, 5 * (1 - progress));
                ctx.stroke();

                // 4 Heavy Blood Splatter Sparks erupting outward
                const sparkDist = sz * 0.65;
                [-sparkDist, sparkDist].forEach(sx => {
                    [-sparkDist, sparkDist].forEach(sy => {
                        ctx.beginPath();
                        ctx.arc(sx, sy, Math.max(1, 5 * (1 - progress)), 0, Math.PI * 2);
                        ctx.fillStyle = '#1e0505';
                        ctx.fill();

                        ctx.beginPath();
                        ctx.arc(sx, sy, Math.max(1, 3.8 * (1 - progress)), 0, Math.PI * 2);
                        ctx.fillStyle = '#ff1744';
                        ctx.fill();
                    });
                });

                // Center impact diamond
                const cSz = Math.max(1, (1 - progress) * 16);
                ctx.beginPath();
                ctx.moveTo(0, -cSz); ctx.lineTo(cSz, 0); ctx.lineTo(0, cSz); ctx.lineTo(-cSz, 0);
                ctx.closePath();
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }
            else if (hit.effectType === 'blink_strike') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.2);
                ctx.globalAlpha = alpha;
                const sz = progress * 95;

                // Thunder Flash Step Z-Slash (Tốc biến trảm lôi điện - Đậm nét, sắc bén)
                // Layer 1: Dark Amber Shadow Under-stroke (Viền tương phản bóng tối)
                ctx.beginPath();
                ctx.moveTo(-sz, -sz * 0.6);
                ctx.lineTo(sz * 0.3, 0);
                ctx.lineTo(-sz * 0.3, 0);
                ctx.lineTo(sz, sz * 0.6);
                ctx.strokeStyle = `rgba(25, 15, 0, ${alpha * 0.9})`;
                ctx.lineWidth = Math.max(1, 15 * (1 - progress));
                ctx.lineCap = 'round';
                ctx.stroke();

                // Layer 2: High-voltage golden lightning slash
                ctx.beginPath();
                ctx.moveTo(-sz, -sz * 0.6);
                ctx.lineTo(sz * 0.3, 0);
                ctx.lineTo(-sz * 0.3, 0);
                ctx.lineTo(sz, sz * 0.6);
                ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
                ctx.lineWidth = Math.max(1, 9.5 * (1 - progress));
                ctx.stroke();

                // Layer 3: Inner white lightning core
                ctx.beginPath();
                ctx.moveTo(-sz * 0.85, -sz * 0.5);
                ctx.lineTo(sz * 0.25, 0);
                ctx.lineTo(-sz * 0.25, 0);
                ctx.lineTo(sz * 0.85, sz * 0.5);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.lineWidth = Math.max(1, 4 * (1 - progress));
                ctx.stroke();

                // Center diamond spark (To và đậm)
                const dSz = (1 - progress) * 20;
                ctx.beginPath();
                ctx.moveTo(0, -dSz - 2); ctx.lineTo(dSz + 2, 0); ctx.lineTo(0, dSz + 2); ctx.lineTo(-dSz - 2, 0);
                ctx.closePath();
                ctx.fillStyle = '#1e1400';
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(0, -dSz); ctx.lineTo(dSz, 0); ctx.lineTo(0, dSz); ctx.lineTo(-dSz, 0);
                ctx.closePath();
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }
            else if (hit.effectType === 'pull') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.2);
                ctx.globalAlpha = alpha;
                const suctionR = (1 - progress) * 95 + 10;

                // The Hand - Za Hando Spatial Void Rupture (Hố đen không gian & cào xé chân không cực đậm)
                // 1. Dark Purple-Black Void Center
                ctx.beginPath();
                ctx.arc(0, 0, suctionR * 0.65, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(12, 4, 25, ${alpha * 0.9})`;
                ctx.fill();

                // 2. 4 Spatial Inward-Curving Void Slices (Lưỡi trảm chân không xoáy gập có viền đậm)
                ctx.save();
                ctx.rotate(progress * Math.PI * 2.5);
                for (let blade = 0; blade < 4; blade++) {
                    ctx.rotate(Math.PI / 2);
                    
                    // Dark contour
                    ctx.beginPath();
                    ctx.moveTo(suctionR, 0);
                    ctx.quadraticCurveTo(suctionR * 0.4, suctionR * 0.6, 0, 0);
                    ctx.strokeStyle = `rgba(15, 5, 30, ${alpha * 0.95})`;
                    ctx.lineWidth = Math.max(1, 8 * (1 - progress * 0.5));
                    ctx.lineCap = 'round';
                    ctx.stroke();

                    // Neon royal purple slice
                    ctx.strokeStyle = `rgba(162, 155, 254, ${alpha})`;
                    ctx.lineWidth = Math.max(1, 5 * (1 - progress * 0.5));
                    ctx.stroke();

                    // White razor inner streak
                    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                    ctx.lineWidth = Math.max(1, 2.2 * (1 - progress * 0.5));
                    ctx.stroke();
                }
                ctx.restore();

                // 3. Inward snapping compression ring (Viền nén không gian kép)
                ctx.beginPath();
                ctx.arc(0, 0, suctionR, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(224, 86, 253, ${alpha})`;
                ctx.lineWidth = 4.5;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, suctionR * 0.85, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            else if (hit.effectType === 'swap') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                ctx.globalAlpha = alpha;
                const r = (1 - progress) * 85 + 10;

                // Yin-Yang Dimensional Portal (Hai cổng không gian đảo chiều đậm đặc)
                // Dark cosmic disc inside portal
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(15, 12, 35, ${alpha * 0.82})`;
                ctx.fill();

                ctx.save();
                ctx.rotate(timeNow * 4.5);

                // Dark outline
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(10, 10, 20, ${alpha * 0.95})`;
                ctx.lineWidth = 9;
                ctx.stroke();

                // Cyan Vortex Arc
                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI);
                ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
                ctx.lineWidth = 6;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, r, 0, Math.PI);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // Magenta Vortex Arc
                ctx.beginPath();
                ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 0, 128, ${alpha})`;
                ctx.lineWidth = 6;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, r, Math.PI, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
                ctx.lineWidth = 2.5;
                ctx.stroke();

                // 2 Spinning dimensional pearls at ends
                [-r, r].forEach((px, idx) => {
                    ctx.beginPath();
                    ctx.arc(px, 0, 6, 0, Math.PI * 2);
                    ctx.fillStyle = idx === 0 ? '#ff0080' : '#00ffff';
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(px, 0, 3, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                });

                ctx.restore();
            }
            else if (hit.effectType === 'heal' || hit.effectType === 'regen') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                ctx.globalAlpha = alpha;
                const riseY = -progress * 60;
                const starSz = 24 * (1 - progress * 0.35);

                // Bold Emerald Diamond Starburst (Ngôi sao ngọc lục bảo viền đậm vút lên)
                ctx.save();
                ctx.translate(0, riseY);

                const drawHealStar = (sz) => {
                    ctx.beginPath();
                    ctx.moveTo(0, -sz);
                    ctx.lineTo(sz * 0.25, -sz * 0.25);
                    ctx.lineTo(sz, 0);
                    ctx.lineTo(sz * 0.25, sz * 0.25);
                    ctx.lineTo(0, sz);
                    ctx.lineTo(-sz * 0.25, sz * 0.25);
                    ctx.lineTo(-sz, 0);
                    ctx.lineTo(-sz * 0.25, -sz * 0.25);
                    ctx.closePath();
                };

                // Dark outline for contrast on any background
                drawHealStar(starSz + 3);
                ctx.fillStyle = `rgba(6, 40, 20, ${alpha * 0.95})`;
                ctx.fill();

                // Outer Emerald Star
                drawHealStar(starSz);
                ctx.fillStyle = `rgba(0, 230, 118, ${alpha})`;
                ctx.fill();

                // Inner Radiant White Core
                drawHealStar(starSz * 0.55);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();

                // Floating mini sparkles
                ctx.fillStyle = '#00e676';
                ctx.beginPath(); ctx.arc(-16, 10, 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(16, -10, 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(-16, 10, 1.8, 0, Math.PI * 2); ctx.fill();
                ctx.beginPath(); ctx.arc(16, -10, 1.8, 0, Math.PI * 2); ctx.fill();
                ctx.restore();

                // Expanding ground halo ring
                const haloR = progress * 40;
                ctx.beginPath();
                ctx.arc(0, 0, haloR, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 230, 118, ${(1 - progress) * 0.9})`;
                ctx.lineWidth = 3.5;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, haloR * 0.75, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - progress) * 0.7})`;
                ctx.lineWidth = 1.8;
                ctx.stroke();
            }
            else if (hit.effectType === 'stat_steal') {
                const caster = STATE.champions.find(c => c.id === hit.casterId);
                const target = STATE.champions.find(c => c.id === hit.targetId);

                if (caster && target) {
                    const cSize = getCanvasCoords(caster.targetX, caster.targetY);
                    const tSize = getCanvasCoords(target.targetX, target.targetY);
                    const cX = caster.pixelX + cSize.w / 2;
                    const cY = caster.pixelY + cSize.h / 2;
                    const tX = target.pixelX + tSize.w / 2;
                    const tY = target.pixelY + tSize.h / 2;

                    const beamAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.5);

                    ctx.save();
                    // 1. Siphon Energy Laser Beam (Tia laze rút năng lượng siêu đậm & sắc)
                    // Layer 1: Dark cosmic shadow backing beam
                    ctx.beginPath();
                    ctx.moveTo(tX, tY); ctx.lineTo(cX, cY);
                    ctx.strokeStyle = `rgba(25, 5, 40, ${beamAlpha * 0.95})`;
                    ctx.lineWidth = 16;
                    ctx.lineCap = 'round';
                    ctx.stroke();

                    // Layer 2: Vivid violet plasma
                    ctx.beginPath();
                    ctx.moveTo(tX, tY); ctx.lineTo(cX, cY);
                    ctx.strokeStyle = `rgba(155, 89, 182, ${beamAlpha})`;
                    ctx.lineWidth = 10;
                    ctx.stroke();

                    // Layer 3: Pure white laser core
                    ctx.beginPath();
                    ctx.moveTo(tX, tY); ctx.lineTo(cX, cY);
                    ctx.strokeStyle = `rgba(255, 255, 255, ${beamAlpha})`;
                    ctx.lineWidth = 4;
                    ctx.stroke();

                    // 2. Draining orbs moving along beam from target to caster
                    const orbCount = 5;
                    for (let i = 0; i < orbCount; i++) {
                        const orbT = ((progress * 3.5) + (i / orbCount)) % 1.0;
                        const orbX = tX + (cX - tX) * orbT;
                        const orbY = tY + (cY - tY) * orbT;

                        // Dark outline
                        ctx.beginPath();
                        ctx.arc(orbX, orbY, 8.5, 0, Math.PI * 2);
                        ctx.fillStyle = '#1e0c00';
                        ctx.fill();

                        // Golden orb body
                        ctx.beginPath();
                        ctx.arc(orbX, orbY, 6.5, 0, Math.PI * 2);
                        ctx.fillStyle = '#f1c40f';
                        ctx.fill();

                        // White core
                        ctx.beginPath();
                        ctx.arc(orbX, orbY, 3, 0, Math.PI * 2);
                        ctx.fillStyle = '#ffffff';
                        ctx.fill();
                    }

                    // 3. Target collapsing drain spiral (Vòng xoáy rút cạn năng lượng)
                    ctx.beginPath();
                    ctx.arc(tX, tY, (1 - progress) * 48 + 15, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(231, 76, 60, ${beamAlpha})`;
                    ctx.lineWidth = 4.5;
                    ctx.setLineDash([8, 8]);
                    ctx.stroke();

                    // 4. Caster aura burst (Vòng nạp năng lượng bùng nổ)
                    ctx.beginPath();
                    ctx.arc(cX, cY, progress * 52 + 10, 0, Math.PI * 2);
                    ctx.strokeStyle = `rgba(241, 196, 15, ${(1 - progress) * 0.95})`;
                    ctx.lineWidth = 5.5;
                    ctx.setLineDash([]);
                    ctx.stroke();

                    ctx.restore();
                } else {
                    ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                    ctx.beginPath();
                    ctx.arc(0, -progress * 50, 20, 0, Math.PI * 2);
                    ctx.fillStyle = '#9b59b6';
                    ctx.fill();
                }
            }
            else if (hit.effectType === 'mana_battery') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                ctx.globalAlpha = alpha;
                const waveR = progress * 95;

                // Neon Arc Reactor Shockwave (Sóng xung kích nạp quang năng siêu đậm)
                // Layer 1: Dark outer shadow ring
                ctx.beginPath();
                ctx.arc(0, 0, waveR, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 30, 45, ${(1 - progress) * 0.9})`;
                ctx.lineWidth = Math.max(1, 9 * (1 - progress));
                ctx.stroke();

                // Layer 2: Neon electric cyan
                ctx.beginPath();
                ctx.arc(0, 0, waveR, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 255, 255, ${(1 - progress) * 0.98})`;
                ctx.lineWidth = Math.max(1, 6 * (1 - progress));
                ctx.stroke();

                // Layer 3: Inner white lightning rim
                ctx.beginPath();
                ctx.arc(0, 0, waveR * 0.85, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - progress) * 0.9})`;
                ctx.lineWidth = Math.max(1, 2.8 * (1 - progress));
                ctx.stroke();

                // 4 Electric discharge needles (Tia phóng điện góc xoay)
                const needleLen = waveR * 1.18;
                ctx.save();
                ctx.rotate(progress * Math.PI);
                ctx.beginPath();
                ctx.moveTo(-needleLen, 0); ctx.lineTo(needleLen, 0);
                ctx.moveTo(0, -needleLen); ctx.lineTo(0, needleLen);
                ctx.strokeStyle = `rgba(0, 210, 211, ${(1 - progress) * 0.95})`;
                ctx.lineWidth = Math.max(1, 3.5 * (1 - progress));
                ctx.lineCap = 'round';
                ctx.stroke();
                ctx.restore();
            }
            else if (hit.effectType === 'revive') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.2);
                ctx.globalAlpha = alpha;

                // Celestial Phoenix Wings & Holy Ascension Pillar (Cột sáng thiên thần / phượng hoàng hồi sinh)
                // 1. Tapered holy golden beam (Cột sáng bề thế đậm đà)
                const beamW = 65 * (1 - progress * 0.35);
                const beamGrad = ctx.createLinearGradient(0, 0, 0, -230);
                beamGrad.addColorStop(0, `rgba(255, 215, 0, ${alpha * 0.95})`);
                beamGrad.addColorStop(0.5, `rgba(255, 242, 0, ${alpha * 0.75})`);
                beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = beamGrad;
                ctx.beginPath();
                ctx.moveTo(-beamW / 2, 0);
                ctx.lineTo(-beamW * 0.35, -230);
                ctx.lineTo(beamW * 0.35, -230);
                ctx.lineTo(beamW / 2, 0);
                ctx.closePath();
                ctx.fill();

                // 2. Inner brilliant white pillar core (Lõi trắng chói sáng)
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
                ctx.fillRect(-beamW * 0.16, -230, beamW * 0.32, 230);

                // 3. Phoenix Wing Sweeps (Đôi cánh ánh sáng xòe rộng có viền đậm)
                const wingSpan = 78 * Math.sin(progress * Math.PI);
                const wingY = -50 - progress * 70;
                
                // Dark wing contour
                ctx.beginPath();
                ctx.moveTo(0, wingY + 16);
                ctx.quadraticCurveTo(-wingSpan * 0.7, wingY - 32, -wingSpan, wingY);
                ctx.quadraticCurveTo(-wingSpan * 0.5, wingY + 12, 0, wingY + 16);
                ctx.quadraticCurveTo(wingSpan * 0.5, wingY + 12, wingSpan, wingY);
                ctx.quadraticCurveTo(wingSpan * 0.7, wingY - 32, 0, wingY + 16);
                ctx.strokeStyle = `rgba(180, 120, 0, ${alpha})`;
                ctx.lineWidth = 4;
                ctx.stroke();

                ctx.fillStyle = `rgba(255, 215, 0, ${alpha * 0.9})`;
                ctx.fill();

                // White spine on wings
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.lineWidth = 2.8;
                ctx.stroke();

                // 4. Ground golden halo ring
                ctx.beginPath();
                ctx.arc(0, 0, 40 * (1 - progress * 0.5), 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 215, 0, ${alpha})`;
                ctx.lineWidth = 5;
                ctx.stroke();
            }
            else if (hit.effectType === 'evasion') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.2);
                ctx.globalAlpha = alpha;
                const dashLen = progress * 70;

                // Sonic Gale Blades (Phong đao ảo ảnh né đòn siêu tốc - Cực đậm & sắc)
                ctx.save();
                [-15, 0, 15].forEach((offsetY, idx) => {
                    const bladeLen = (50 - Math.abs(offsetY)) * (1 - progress * 0.5);
                    const speedX = dashLen * (idx % 2 === 0 ? 1 : -0.7);

                    // Dark shadow trail
                    ctx.beginPath();
                    ctx.moveTo(speedX - bladeLen, offsetY);
                    ctx.quadraticCurveTo(speedX, offsetY - 9, speedX + bladeLen, offsetY);
                    ctx.strokeStyle = `rgba(0, 35, 45, ${alpha * 0.9})`;
                    ctx.lineWidth = idx === 1 ? 6.5 : 5;
                    ctx.lineCap = 'round';
                    ctx.stroke();

                    // Vibrant turquoise wind blade
                    ctx.beginPath();
                    ctx.moveTo(speedX - bladeLen, offsetY);
                    ctx.quadraticCurveTo(speedX, offsetY - 9, speedX + bladeLen, offsetY);
                    ctx.strokeStyle = idx === 1 ? `rgba(255, 255, 255, ${alpha})` : `rgba(0, 206, 201, ${alpha})`;
                    ctx.lineWidth = idx === 1 ? 4 : 3;
                    ctx.stroke();
                });
                ctx.restore();
            }
            else if (hit.effectType === 'clone') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.2);
                ctx.globalAlpha = alpha;
                const poofR = progress * 52 + 12;

                // Bold Ninja Smoke Poof (Vụ nổ khói phân thân nhẫn giả đậm nét phong cách truyện tranh)
                // 5 billowing smoke cloud circles expanding outward
                const cloudAngles = [0, 1.25, 2.5, 3.75, 5.0];
                cloudAngles.forEach(ang => {
                    const cx = Math.cos(ang) * (poofR * 0.72);
                    const cy = Math.sin(ang) * (poofR * 0.72);
                    const r = poofR * 0.48;

                    // Heavy comic outline
                    ctx.beginPath();
                    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(45, 52, 54, ${alpha * 0.9})`;
                    ctx.fill();

                    // Dense smoke body
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(223, 230, 233, ${alpha * 0.95})`;
                    ctx.fill();
                    ctx.strokeStyle = `rgba(108, 92, 231, ${alpha * 0.85})`;
                    ctx.lineWidth = 3;
                    ctx.stroke();
                });

                // Center smoke burst
                ctx.beginPath();
                ctx.arc(0, 0, poofR * 0.62, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();

                // 4 Sharp ninja wind sparks (Tia phong kiếm phân thân)
                const spk = poofR * 1.25;
                // Dark outline
                ctx.strokeStyle = `rgba(20, 10, 40, ${alpha * 0.85})`;
                ctx.lineWidth = 4.5;
                ctx.beginPath();
                ctx.moveTo(-spk, 0); ctx.lineTo(spk, 0);
                ctx.moveTo(0, -spk); ctx.lineTo(0, spk);
                ctx.stroke();

                // Neon lavender spark
                ctx.strokeStyle = `rgba(162, 155, 254, ${alpha})`;
                ctx.lineWidth = 2.8;
                ctx.beginPath();
                ctx.moveTo(-spk, 0); ctx.lineTo(spk, 0);
                ctx.moveTo(0, -spk); ctx.lineTo(0, spk);
                ctx.stroke();
            }
            else if (hit.effectType === 'ricochet_chain') {
                const caster = STATE.champions.find(c => c.id === hit.casterId);
                if (caster) {
                    const cSize = getCanvasCoords(caster.targetX, caster.targetY);
                    
                    // Zero shadowBlur - High-Voltage Golden Lightning Chain (Siêu đậm, giật sét cực mạnh)
                    // Layer 1: Dark Amber Silhouette (Đường bao tương phản đậm đà)
                    ctx.beginPath();
                    ctx.moveTo(caster.pixelX + cSize.w / 2, caster.pixelY + cSize.h / 2);
                    hit.path.forEach(tid => {
                        const t = STATE.champions.find(c => c.id === tid);
                        if (t) {
                            const ts = getCanvasCoords(t.targetX, t.targetY);
                            ctx.lineTo(t.pixelX + ts.w / 2, t.pixelY + ts.h / 2);
                        }
                    });
                    ctx.strokeStyle = `rgba(35, 20, 0, ${currentAlpha * 0.9})`;
                    ctx.lineWidth = 12 * currentAlpha;
                    ctx.lineJoin = 'round';
                    ctx.stroke();

                    // Layer 2: Blazing golden electricity
                    ctx.beginPath();
                    ctx.moveTo(caster.pixelX + cSize.w / 2, caster.pixelY + cSize.h / 2);
                    hit.path.forEach(tid => {
                        const t = STATE.champions.find(c => c.id === tid);
                        if (t) {
                            const ts = getCanvasCoords(t.targetX, t.targetY);
                            ctx.lineTo(t.pixelX + ts.w / 2, t.pixelY + ts.h / 2);
                        }
                    });
                    ctx.strokeStyle = `rgba(243, 156, 18, ${currentAlpha})`;
                    ctx.lineWidth = 7.5 * currentAlpha;
                    ctx.stroke();

                    // Layer 3: Inner intense white lightning core
                    ctx.beginPath();
                    ctx.moveTo(caster.pixelX + cSize.w / 2, caster.pixelY + cSize.h / 2);
                    hit.path.forEach(tid => {
                        const t = STATE.champions.find(c => c.id === tid);
                        if (t) {
                            const ts = getCanvasCoords(t.targetX, t.targetY);
                            ctx.lineTo(t.pixelX + ts.w / 2, t.pixelY + ts.h / 2);
                        }
                    });
                    ctx.strokeStyle = `rgba(255, 255, 255, ${currentAlpha})`;
                    ctx.lineWidth = 3.2 * currentAlpha;
                    ctx.stroke();

                    // Draw 4-point Diamond Star at each bounce target
                    hit.path.forEach(tid => {
                        const t = STATE.champions.find(c => c.id === tid);
                        if (t) {
                            const ts = getCanvasCoords(t.targetX, t.targetY);
                            const bx = t.pixelX + ts.w / 2;
                            const by = t.pixelY + ts.h / 2;
                            const bSz = (16 + progress * 18) * currentAlpha;
                            
                            // Dark diamond backing
                            ctx.beginPath();
                            ctx.moveTo(bx, by - bSz - 2);
                            ctx.lineTo(bx + (bSz + 2) * 0.25, by - (bSz + 2) * 0.25);
                            ctx.lineTo(bx + bSz + 2, by);
                            ctx.lineTo(bx + (bSz + 2) * 0.25, by + (bSz + 2) * 0.25);
                            ctx.lineTo(bx, by + bSz + 2);
                            ctx.lineTo(bx - (bSz + 2) * 0.25, by + (bSz + 2) * 0.25);
                            ctx.lineTo(bx - bSz - 2, by);
                            ctx.lineTo(bx - (bSz + 2) * 0.25, by - (bSz + 2) * 0.25);
                            ctx.closePath();
                            ctx.fillStyle = `rgba(20, 10, 0, ${currentAlpha * 0.9})`;
                            ctx.fill();

                            // Golden diamond body
                            ctx.beginPath();
                            ctx.moveTo(bx, by - bSz);
                            ctx.lineTo(bx + bSz * 0.25, by - bSz * 0.25);
                            ctx.lineTo(bx + bSz, by);
                            ctx.lineTo(bx + bSz * 0.25, by + bSz * 0.25);
                            ctx.lineTo(bx, by + bSz);
                            ctx.lineTo(bx - bSz * 0.25, by + bSz * 0.25);
                            ctx.lineTo(bx - bSz, by);
                            ctx.lineTo(bx - bSz * 0.25, by - bSz * 0.25);
                            ctx.closePath();
                            ctx.fillStyle = `rgba(255, 215, 0, ${currentAlpha})`;
                            ctx.fill();

                            // White inner diamond
                            const inSz = bSz * 0.55;
                            ctx.beginPath();
                            ctx.moveTo(bx, by - inSz);
                            ctx.lineTo(bx + inSz * 0.25, by - inSz * 0.25);
                            ctx.lineTo(bx + inSz, by);
                            ctx.lineTo(bx + inSz * 0.25, by + inSz * 0.25);
                            ctx.lineTo(bx, by + inSz);
                            ctx.lineTo(bx - inSz * 0.25, by + inSz * 0.25);
                            ctx.lineTo(bx - inSz, by);
                            ctx.lineTo(bx - inSz * 0.25, by - inSz * 0.25);
                            ctx.closePath();
                            ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`;
                            ctx.fill();
                        }
                    });
                }
            }
            else if (hit.effectType === 'reflect') {
                const alpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 1.8);
                ctx.globalAlpha = alpha;
                const d = progress * 32;

                // 4 Sharp Crystal Spikes erupting outward (Gai pha lê phản đòn đậm nét)
                // Dark outline
                ctx.beginPath();
                ctx.moveTo(-d, -d); ctx.lineTo(d, d);
                ctx.moveTo(d, -d); ctx.lineTo(-d, d);
                ctx.strokeStyle = `rgba(20, 5, 30, ${alpha * 0.85})`;
                ctx.lineWidth = Math.max(1, 6 * (1 - progress));
                ctx.lineCap = 'round';
                ctx.stroke();

                // Violet crystal spikes
                ctx.beginPath();
                ctx.moveTo(-d, -d); ctx.lineTo(d, d);
                ctx.moveTo(d, -d); ctx.lineTo(-d, d);
                ctx.strokeStyle = `rgba(224, 86, 253, ${alpha})`;
                ctx.lineWidth = Math.max(1, 3.8 * (1 - progress));
                ctx.stroke();

                // Center diamond ricochet spark
                const sparkSz = (1 - progress) * 10;
                ctx.beginPath();
                ctx.moveTo(0, -sparkSz - 2); ctx.lineTo(sparkSz + 2, 0); ctx.lineTo(0, sparkSz + 2); ctx.lineTo(-sparkSz - 2, 0);
                ctx.closePath();
                ctx.fillStyle = `rgba(20, 5, 30, ${alpha * 0.85})`;
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(0, -sparkSz); ctx.lineTo(sparkSz, 0); ctx.lineTo(0, sparkSz); ctx.lineTo(-sparkSz, 0);
                ctx.closePath();
                ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.fill();
            }
            ctx.restore();
        });
    }   

    // 5. VẼ CÁC HẠT (PARTICLES) NHỎ LITI (Tia lửa xé gió, mảnh vụn tốc độ cao)
    if (STATE.particles) {
        STATE.particles.forEach(p => {
            const alpha = Math.min(1.0, Math.max(0, p.life / 18));
            ctx.globalAlpha = alpha;
            const speed = Math.hypot(p.vx || 0, p.vy || 0);

            if (speed > 0.8) {
                // Velocity-stretched needle spark (Tia lửa kéo vệt định hướng xé gió)
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.vx * 1.6, p.y - p.vy * 1.6);
                ctx.strokeStyle = p.color;
                ctx.lineWidth = Math.max(1, p.size * 0.7);
                ctx.lineCap = 'round';
                ctx.stroke();

                // Bright core head
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.8, p.size * 0.38), 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Floating ember / wisp (Đốm năng lượng trôi chậm)
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        });
    }

    // 6. VẼ CHỮ NỔI SÁT THƯƠNG & TRẠNG THÁI (FLOATING COMBAT TEXTS)
    if (STATE.floatingTexts) {
        STATE.floatingTexts.forEach(t => {
            ctx.save();
            const alpha = Math.max(0, Math.min(1.0, t.life / (t.maxLife * 0.35)));
            ctx.globalAlpha = alpha;
            ctx.translate(t.x, t.y);
            const scale = t.scale || 1.0;
            ctx.scale(scale, scale);

            ctx.font = t.font || '900 21px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Viền đen dày tương phản cao (Không dùng shadowBlur để duy trì 60 FPS)
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4.5;
            ctx.lineJoin = 'round';
            ctx.strokeText(t.text, 0, 0);

            // Chữ bên trong
            ctx.fillStyle = t.color;
            ctx.fillText(t.text, 0, 0);

            ctx.restore();
        });
    }

    // 7. LỚP TRÊN CÙNG (TOP LAYER): VẼ SỐ SAO VỚI ÁNH KIM HÀO QUANG
    STATE.champions.forEach(champ => {
        if (!champ.is_alive && champ.hp <= 0) return;

        const starCount = champ.star || 1;
        const currentSize = getCanvasCoords(champ.targetX, champ.targetY);

        ctx.save();
        ctx.globalAlpha = 1.0;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const starX = champ.pixelX + currentSize.w / 2;
        const starY = champ.pixelY - 7;

        const starText = starCount >= 3 ? '⭐⭐⭐' : (starCount === 2 ? '⭐⭐' : '⭐');
        const fontSize = starCount >= 3 ? 18 : (starCount === 2 ? 16 : 15);
        ctx.font = `bold ${fontSize}px Arial`;
        
        // Dark outline for crisp visibility
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeText(starText, starX, starY);

        // Vibrant gold fill
        ctx.fillStyle = starCount >= 3 ? '#ffd700' : '#f1c40f';
        ctx.fillText(starText, starX, starY);
        ctx.restore();
    });

    // KHÔI PHỤC TỌA ĐỘ SAU RUNG MÀN HÌNH (SCREEN SHAKE RESTORE)
    ctx.restore();

    // CHỚP SÁNG MÀN HÌNH (SCREEN FLASH OVERLAY CHO SKILL LỚN)
    if (STATE.screenFlash) {
        ctx.save();
        ctx.fillStyle = STATE.screenFlash.color;
        ctx.globalAlpha = Math.max(0, Math.min(1.0, STATE.screenFlash.alpha));
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        STATE.screenFlash.alpha -= (STATE.screenFlash.decay || 0.05);
        if (STATE.screenFlash.alpha <= 0) STATE.screenFlash = null;
    }
}