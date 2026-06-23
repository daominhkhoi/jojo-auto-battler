// static/js/renderer.js
import { CONFIG, STATE, IMAGE_CACHE, getCanvasCoords } from './globals.js';

export function renderBoard(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const timeNow = Date.now() / 1000;

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

        // Xác định team của người chơi hiện tại dựa trên các tướng có originalX
        const localTeam = STATE.champions.find(c => c.originalX !== undefined)?.team || 'Team1';
        const isAlly = (champ.team === localTeam);

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

        // Thanh Máu
        const hpP = Math.max(0, Math.min(1, champ.hp / champ.max_hp));
        ctx.fillStyle = 'red'; ctx.fillRect(pX + 4, barY, barW, barHeight);
        ctx.fillStyle = '#00ff00'; ctx.fillRect(pX + 4, barY, barW * hpP, barHeight);

        // Giáp ảo (Shield) - Vẽ đè lên thanh máu
        if (champ.shield && champ.shield > 0) {
            const shP = Math.min(1, champ.shield / champ.max_hp);
            ctx.fillStyle = 'rgba(236, 240, 241, 0.9)'; // Màu trắng đục
            ctx.fillRect(pX + 4, barY, barW * shP, barHeight);
        }

        // Thanh Mana
        const mnP = Math.max(0, Math.min(1, (champ.mana || 0) / champ.max_mana));
        const isManaLocked = (champ.buffs && champ.buffs.includes('mana_lock'));
        ctx.fillStyle = '#444'; ctx.fillRect(pX + 4, barY + barHeight + barSpacing, barW, barHeight);
        ctx.fillStyle = isManaLocked ? '#7f8c8d' : '#00aaff';
        ctx.fillRect(pX + 4, barY + barHeight + barSpacing, barW * mnP, barHeight);
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
            const radius = currentSize.w / 2 + 5;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(155, 89, 182, ${0.5 + Math.sin(timeNow*5)*0.3})`; // Màu Tím
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.fillStyle = `rgba(155, 89, 182, 0.2)`;
            ctx.fill();
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
        
        ctx.restore();
    });

    // 3. VẼ ĐẠN BAY VÀ HIỆU ỨNG ĐÁNH GẦN (PROJECTILES & MELEE)
    STATE.activeProjectiles.forEach((proj) => {
        const dx = proj.targetX - proj.x;
        const dy = proj.targetY - proj.y;
        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(proj.x, proj.y);
        ctx.rotate(angle);

        if (proj.type === 'melee') {
            const progress = 1 - (proj.lifeTime / 15);
            // Vẽ vệt chém (Slash) hoặc cú đấm mờ ảo
            ctx.beginPath();
            ctx.arc(15 + progress * 20, 0, 25, -Math.PI/2, Math.PI/2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
            ctx.lineWidth = 8;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(10 + progress * 30, 0, 15, -Math.PI/2, Math.PI/2);
            ctx.strokeStyle = `rgba(231, 76, 60, ${1 - progress})`;
            ctx.lineWidth = 4;
            ctx.stroke();
        } else {
            // Đạn bay xa - sao chổi năng lượng
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#00ffff';

            // Đuôi sao chổi
            const gradient = ctx.createLinearGradient(0, 0, -40, 0);
            gradient.addColorStop(0, 'rgba(0, 255, 255, 1)');
            gradient.addColorStop(1, 'rgba(0, 255, 255, 0)');
            
            ctx.beginPath();
            ctx.moveTo(0, 0); ctx.lineTo(-40, 0);
            ctx.strokeStyle = gradient; ctx.lineWidth = 6; ctx.lineCap = 'round';
            ctx.stroke();

            // Đầu đạn
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
            const currentAlpha = hit.lifeTime < 30 ? (hit.lifeTime / 30) : 1.0;
            const pixelRadius = (hit.radius || 1.5) * CONFIG.BOARD_CELL_WIDTH;

            if (!hit.effectType || hit.effectType === 'damage') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                const sz = 15 + progress * 25;
                ctx.beginPath();
                ctx.moveTo(-sz, -sz); ctx.lineTo(sz, sz);
                ctx.moveTo(sz, -sz); ctx.lineTo(-sz, sz);
                ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
                ctx.lineWidth = 8 * (1 - progress);
                ctx.lineCap = 'round';
                ctx.stroke();
            }
            else if (hit.effectType === 'aoe_dot') {
                ctx.globalAlpha = 1.0;
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(142, 68, 173, ${currentAlpha * 0.3})`;
                ctx.fill();
                
                // Vòng xoáy ma thuật
                ctx.rotate(timeNow);
                ctx.strokeStyle = `rgba(155, 89, 182, ${currentAlpha * 0.6})`;
                ctx.lineWidth = 4;
                ctx.setLineDash([20, 15]);
                ctx.stroke();
            }
            else if (hit.effectType === 'aoe_heal') {
                ctx.globalAlpha = 1.0;
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(46, 204, 113, ${currentAlpha * 0.2})`; ctx.fill();
                
                ctx.rotate(-timeNow * 1.5);
                ctx.strokeStyle = `rgba(46, 204, 113, ${currentAlpha * 0.7})`;
                ctx.lineWidth = 3;
                ctx.setLineDash([15, 25]);
                ctx.stroke();
            }
            else if (hit.effectType === 'mana_lock') {
                ctx.globalAlpha = 1.0;
                ctx.beginPath();
                ctx.arc(0, 0, pixelRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(44, 62, 80, ${currentAlpha * 0.8})`;
                ctx.lineWidth = 6;
                ctx.stroke();
                ctx.fillStyle = `rgba(0, 0, 0, ${currentAlpha * 0.4})`;
                ctx.fill();
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
                
                ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
                ctx.lineWidth = 10;
                ctx.stroke();
            }
            else if (hit.effectType === 'time_stop' || hit.effectType === 'global_slow') {
                // Sóng âm đồng hồ ngưng đọng thời gian hoặc làm chậm
                ctx.globalAlpha = 1.0;
                ctx.beginPath();
                ctx.arc(0, 0, progress * canvas.width, 0, Math.PI * 2);
                ctx.strokeStyle = hit.effectType === 'time_stop' ? `rgba(189, 195, 199, ${1 - progress})` : `rgba(135, 54, 0, ${1 - progress})`;
                ctx.lineWidth = 20;
                ctx.stroke();
            }
            else if (hit.effectType === 'blink_strike' || hit.effectType === 'execute') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                const sz = progress * 80;
                ctx.beginPath();
                ctx.moveTo(-sz, 0); ctx.lineTo(sz, 0);
                if(hit.effectType === 'execute') {
                    ctx.moveTo(0, -sz); ctx.lineTo(0, sz);
                    ctx.moveTo(-sz, -sz); ctx.lineTo(sz, sz);
                    ctx.moveTo(sz, -sz); ctx.lineTo(-sz, sz);
                } else {
                    ctx.moveTo(0, -sz); ctx.lineTo(0, sz);
                }
                ctx.strokeStyle = hit.effectType === 'execute' ? `rgba(192, 57, 43, ${1 - progress})` : `rgba(241, 196, 15, ${1 - progress})`;
                ctx.lineWidth = 10 * (1 - progress);
                ctx.stroke();
                ctx.beginPath(); ctx.arc(0, 0, sz / 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress})`; ctx.fill();
            }
            else if (hit.effectType === 'pull' || hit.effectType === 'swap') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                ctx.beginPath();
                ctx.arc(0, 0, (1 - progress) * 100, 0, Math.PI * 2); // Shrinking circle
                ctx.strokeStyle = hit.effectType === 'swap' ? `rgba(155, 89, 182, ${hit.lifeTime/hit.maxLife})` : `rgba(236, 240, 241, ${hit.lifeTime/hit.maxLife})`;
                ctx.lineWidth = 8;
                ctx.stroke();
            }
            else if (hit.effectType === 'heal' || hit.effectType === 'regen') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                const sz = 20;
                ctx.translate(0, -progress * 40);
                ctx.beginPath();
                ctx.moveTo(0, -sz); ctx.lineTo(0, sz);
                ctx.moveTo(-sz, 0); ctx.lineTo(sz, 0);
                ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 8; ctx.stroke();
            }
            else if (hit.effectType === 'stat_steal') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                ctx.beginPath();
                ctx.arc(0, -progress * 50, 15, 0, Math.PI * 2);
                ctx.fillStyle = '#3498db'; ctx.fill();
            }
            else if (hit.effectType === 'mana_battery') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                ctx.beginPath();
                ctx.arc(0, 0, progress * 80, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(52, 152, 219, ${1 - progress})`;
                ctx.lineWidth = 15;
                ctx.stroke();
            }
            else if (hit.effectType === 'revive') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                // Cột sáng hồi sinh
                const gradient = ctx.createLinearGradient(0, 0, 0, -200);
                gradient.addColorStop(0, 'rgba(241, 196, 15, 0.8)');
                gradient.addColorStop(1, 'rgba(241, 196, 15, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(-30, -200, 60, 200);
            }
            else if (hit.effectType === 'evasion') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                ctx.beginPath();
                // Gió né đòn (đường cong)
                ctx.moveTo(-30, progress * 20); ctx.quadraticCurveTo(0, -20 + progress*20, 30, progress * 20);
                ctx.strokeStyle = `rgba(189, 195, 199, ${1 - progress})`;
                ctx.lineWidth = 4;
                ctx.stroke();
            }
            else if (hit.effectType === 'clone') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                ctx.fillStyle = `rgba(52, 73, 94, ${1 - progress})`;
                ctx.fillRect(-30 - progress*30, -40, 60, 80);
                ctx.fillRect(-30 + progress*30, -40, 60, 80);
            }
            else if (hit.effectType === 'ricochet_chain') {
                const caster = STATE.champions.find(c => c.id === hit.casterId);
                if (caster) {
                    const cSize = getCanvasCoords(caster.targetX, caster.targetY);
                    ctx.beginPath();
                    ctx.moveTo(caster.pixelX + cSize.w/2, caster.pixelY + cSize.h/2);
                    
                    hit.path.forEach(tid => {
                        const t = STATE.champions.find(c => c.id === tid);
                        if (t) {
                            const ts = getCanvasCoords(t.targetX, t.targetY);
                            ctx.lineTo(t.pixelX + ts.w/2, t.pixelY + ts.h/2);
                        }
                    });
                    
                    ctx.strokeStyle = `rgba(241, 196, 15, ${currentAlpha})`;
                    ctx.lineWidth = 8 * currentAlpha;
                    ctx.lineJoin = 'round';
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = '#f39c12';
                    ctx.stroke();
                    ctx.shadowBlur = 0; // reset
                    
                    // Draw sparks at each bounce point
                    hit.path.forEach(tid => {
                        const t = STATE.champions.find(c => c.id === tid);
                        if (t) {
                            const ts = getCanvasCoords(t.targetX, t.targetY);
                            ctx.beginPath();
                            ctx.arc(t.pixelX + ts.w/2, t.pixelY + ts.h/2, 10 + progress*20, 0, Math.PI*2);
                            ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`;
                            ctx.fill();
                        }
                    });
                }
            }
            else if (hit.effectType === 'reflect') {
                ctx.globalAlpha = Math.min(1.0, (hit.lifeTime / hit.maxLife) * 2.0);
                ctx.beginPath();
                ctx.arc(0, 0, progress * 40, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(231, 76, 60, ${1 - progress})`;
                ctx.lineWidth = 8;
                ctx.stroke();
            }
            ctx.restore();
        });
    }   

    // 5. VẼ CÁC HẠT (PARTICLES) NHỎ LITI (Tia lửa, máu)
    if (STATE.particles) {
        STATE.particles.forEach(p => {
            ctx.globalAlpha = Math.min(1.0, Math.max(0, p.life / 25)); // Giả sử max life quanh 50
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        });
    }

    // 6. VẼ CHỮ NỔI SÁT THƯƠNG (FLOATING TEXTS)
    if (STATE.floatingTexts) {
        STATE.floatingTexts.forEach(t => {
            ctx.save();
            ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
            ctx.translate(t.x, t.y);
            ctx.scale(t.scale || 1.0, t.scale || 1.0);
            
            ctx.font = 'bold 22px Arial';
            ctx.fillStyle = t.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.textAlign = 'center';
            
            ctx.strokeText(t.text, 0, 0);
            ctx.fillText(t.text, 0, 0);
            ctx.restore();
        });
    }

    // 7. LỚP TRÊN CÙNG (TOP LAYER): VẼ SỐ SAO
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