export function showNotification(message) {
    // 1. Tìm và xóa thông báo cũ (nếu có) ngay lập tức
    const existing = document.querySelector('.game-notification');
    if (existing) {
        existing.remove();
    }

    // 2. Tạo box thông báo mới
    const box = document.createElement('div');
    box.className = 'game-notification';
    box.innerText = message;

    // 3. Thêm vào body
    document.body.appendChild(box);

    // 4. Xóa sau 3 giây với hiệu ứng mờ dần (fadeOut)
    setTimeout(() => {
        box.style.animation = "fadeOut 0.5s forwards";
        // Đợi animation fadeOut xong mới remove khỏi DOM
        setTimeout(() => box.remove(), 500);
    }, 3000);
}