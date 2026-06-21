// static/js/entities.js
import { IMAGES } from './assets.js';

// Khai báo rỗng, dữ liệu sẽ được bơm từ Excel vào đây
export let CHAMPION_POOL = [];

try {
    // Gọi cửa sổ Server xin dữ liệu Excel
    const response = await fetch('/api/champions');
    const data = await response.json();

    // Gắn link ảnh (từ file assets) vào dữ liệu tải về
    CHAMPION_POOL = data.map(champ => {
        champ.img = IMAGES[champ.name] || '';
        return champ;
    });

    console.log(`✅ Đã nạp thành công ${CHAMPION_POOL.length} tướng từ Excel!`);
} catch (error) {
    console.error("❌ Lỗi nạp dữ liệu Excel:", error);
}