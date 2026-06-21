let queue = [];
let isShowing = false;

export function showNotification(message) {
    queue.push(message);
    if (!isShowing) {
        processQueue();
    }
}

function processQueue() {
    if (queue.length === 0) {
        isShowing = false;
        return;
    }
    
    isShowing = true;
    const message = queue.shift();
    
    const existing = document.querySelector('.game-notification');
    if (existing) {
        existing.remove();
    }

    const box = document.createElement('div');
    box.className = 'game-notification';
    box.innerText = message;
    document.body.appendChild(box);

    setTimeout(() => {
        box.style.animation = "fadeOut 0.5s forwards";
        setTimeout(() => {
            box.remove();
            processQueue();
        }, 500);
    }, 2500);
}