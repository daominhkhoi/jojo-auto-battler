let queue = [];
let isShowing = false;
let currentMessage = '';
let lastMessageTime = 0;
let dismissTimer = null;
let fadeTimer = null;

export function showNotification(message) {
    if (!message) return;
    const trimmed = String(message).trim();
    const now = Date.now();

    // 1. Chống lặp: Nếu thông báo giống hệt cái đang hiển thị hoặc vừa hiển thị trong vòng 2.5s thì bỏ qua
    if (currentMessage === trimmed && (isShowing || (now - lastMessageTime < 2500))) {
        return;
    }

    // 2. Chống lặp trong hàng đợi: Nếu đã có thông báo này trong queue rồi thì không thêm nữa
    if (queue.includes(trimmed)) {
        return;
    }

    // 3. Giữ hàng đợi luôn mới nhất (tối đa 1 thông báo chờ), tránh dồn ứ thông báo cũ làm mất thời gian
    if (queue.length >= 1) {
        queue.shift();
    }

    queue.push(trimmed);

    if (!isShowing) {
        processQueue();
    } else {
        // Nếu có thông báo mới khác đến, đẩy nhanh thông báo cũ để người chơi nắm bắt ngay
        clearTimeout(dismissTimer);
        dismissCurrent(true);
    }
}

function processQueue() {
    if (queue.length === 0) {
        isShowing = false;
        return;
    }

    isShowing = true;
    currentMessage = queue.shift();
    lastMessageTime = Date.now();

    let box = document.querySelector('.game-notification');
    if (!box) {
        box = document.createElement('div');
        box.className = 'game-notification';
        document.body.appendChild(box);
    }

    box.innerText = currentMessage;

    // Kích hoạt transition mượt mà
    requestAnimationFrame(() => {
        box.classList.remove('hiding');
        box.classList.add('showing');
    });

    clearTimeout(dismissTimer);
    dismissTimer = setTimeout(() => {
        dismissCurrent(true);
    }, 1400); // Hiển thị 1.4s nhanh gọn, không ngâm lâu làm phiền
}

function dismissCurrent(proceedToNext = true) {
    const box = document.querySelector('.game-notification');
    if (box) {
        box.classList.remove('showing');
        box.classList.add('hiding');
    }

    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
        if (box && box.classList.contains('hiding')) {
            box.remove();
        }
        isShowing = false;
        if (proceedToNext && queue.length > 0) {
            processQueue();
        }
    }, 200);
}