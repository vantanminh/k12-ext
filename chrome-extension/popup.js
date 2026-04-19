document.addEventListener('DOMContentLoaded', async () => {
    const statusEl = document.getElementById('status');
    const runBtn = document.getElementById('run-btn');
    const resultEl = document.getElementById('result');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes('hcm.k12online.vn')) {
        statusEl.textContent = 'Trang hiện tại không phải hcm.k12online.vn.';
        statusEl.className = 'status error';
        return;
    }

    try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });

        if (response && response.isVideoPage) {
            statusEl.textContent = 'Đã phát hiện trang video K12.';
            statusEl.className = 'status success';
            runBtn.disabled = false;
        } else {
            statusEl.textContent = 'Trang K12 nhưng chưa phát hiện video. Vẫn có thể thử chạy.';
            statusEl.className = 'status warning';
            runBtn.disabled = false;
            runBtn.textContent = 'Thử chạy tiến trình';
        }
    } catch (_) {
        statusEl.textContent = 'Không kết nối được content script. Thử tải lại trang (F5).';
        statusEl.className = 'status error';
        return;
    }

    runBtn.addEventListener('click', async () => {
        runBtn.disabled = true;
        runBtn.textContent = 'Đang chạy...';
        resultEl.textContent = '';
        resultEl.className = 'result';

        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'runProcess' });

            if (response && response.ok) {
                resultEl.textContent = response.message;
                resultEl.className = 'result success';
                runBtn.textContent = 'Chạy lại';
            } else {
                resultEl.textContent = (response && response.message) || 'Lỗi không xác định.';
                resultEl.className = 'result error';
                runBtn.textContent = 'Thử lại';
            }
        } catch (error) {
            resultEl.textContent = 'Lỗi kết nối: ' + (error.message || 'Không rõ');
            resultEl.className = 'result error';
            runBtn.textContent = 'Thử lại';
        }

        runBtn.disabled = false;
    });
});
