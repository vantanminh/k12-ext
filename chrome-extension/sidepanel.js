document.addEventListener('DOMContentLoaded', init);

const QUICK_BUTTON_KEY = 'k12QuickButtonEnabled';
const AUTO_COMMENT_ENABLED_KEY = 'k12AutoCommentEnabled';
const AUTO_COMMENT_PROFILE_KEY = 'k12AutoCommentProfile';
const state = {
    tabId: null,
    pageUrl: '',
    candidates: [],
    selected: new Set(),
    results: new Map(),
    processing: false,
    quickButtonEnabled: true,
    autoCommentEnabled: false,
    commentProfile: { name: '', className: '', studentId: '' }
};

const elements = {
    pageContext: document.getElementById('page-context'),
    refreshButton: document.getElementById('refresh-btn'),
    lessonsTab: document.getElementById('lessons-tab'),
    manageTab: document.getElementById('manage-tab'),
    lessonsView: document.getElementById('lessons-view'),
    manageView: document.getElementById('manage-view'),
    scanStatus: document.getElementById('scan-status'),
    search: document.getElementById('lesson-search'),
    selectAll: document.getElementById('select-all'),
    selectedCount: document.getElementById('selected-count'),
    lessonList: document.getElementById('lesson-list'),
    emptyState: document.getElementById('empty-state'),
    completeSelected: document.getElementById('complete-selected'),
    bulkStatus: document.getElementById('bulk-status'),
    quickButtonToggle: document.getElementById('quick-button-toggle'),
    autoCommentToggle: document.getElementById('auto-comment-toggle'),
    commentName: document.getElementById('comment-name'),
    commentClass: document.getElementById('comment-class'),
    commentStudentId: document.getElementById('comment-student-id'),
    commentPreview: document.getElementById('comment-preview'),
    extensionVersion: document.getElementById('extension-version'),
    openExtensionManager: document.getElementById('open-extension-manager'),
    settingsStatus: document.getElementById('settings-status')
};

async function init() {
    elements.extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
    elements.refreshButton.addEventListener('click', () => refreshLessons());
    elements.search.addEventListener('input', renderLessons);
    elements.selectAll.addEventListener('change', toggleVisibleLessons);
    elements.completeSelected.addEventListener('click', completeSelectedLessons);
    elements.lessonsTab.addEventListener('click', () => showView('lessons'));
    elements.manageTab.addEventListener('click', () => showView('manage'));
    elements.quickButtonToggle.addEventListener('change', updateQuickButtonSetting);
    elements.autoCommentToggle.addEventListener('change', updateAutoCommentSetting);
    [elements.commentName, elements.commentClass, elements.commentStudentId].forEach((input) => {
        input.addEventListener('input', updateCommentPreview);
        input.addEventListener('change', saveCommentProfile);
    });
    elements.openExtensionManager.addEventListener('click', openExtensionManager);

    const settings = await chrome.storage.local.get({
        [QUICK_BUTTON_KEY]: true,
        [AUTO_COMMENT_ENABLED_KEY]: false,
        [AUTO_COMMENT_PROFILE_KEY]: { name: '', className: '', studentId: '' }
    });
    state.quickButtonEnabled = settings[QUICK_BUTTON_KEY] !== false;
    elements.quickButtonToggle.checked = state.quickButtonEnabled;
    state.autoCommentEnabled = settings[AUTO_COMMENT_ENABLED_KEY] === true;
    state.commentProfile = normalizeCommentProfile(settings[AUTO_COMMENT_PROFILE_KEY]);
    populateCommentProfile();
    elements.autoCommentToggle.checked = state.autoCommentEnabled;

    if (state.autoCommentEnabled && !hasCompleteCommentProfile(state.commentProfile)) {
        state.autoCommentEnabled = false;
        elements.autoCommentToggle.checked = false;
        await chrome.storage.local.set({ [AUTO_COMMENT_ENABLED_KEY]: false });
        elements.settingsStatus.textContent = 'Đã tắt tự động bình luận vì cần nhập đủ Tên, Lớp và Mã số.';
    }

    chrome.tabs.onActivated.addListener(() => refreshLessons());
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (tabId === state.tabId && (changeInfo.url || changeInfo.status === 'complete')) {
            refreshLessons();
        }
    });
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') {
            return;
        }

        if (changes[QUICK_BUTTON_KEY]) {
            state.quickButtonEnabled = changes[QUICK_BUTTON_KEY].newValue !== false;
            elements.quickButtonToggle.checked = state.quickButtonEnabled;
        }

        if (changes[AUTO_COMMENT_ENABLED_KEY]) {
            state.autoCommentEnabled = changes[AUTO_COMMENT_ENABLED_KEY].newValue === true;
            elements.autoCommentToggle.checked = state.autoCommentEnabled;
        }

        if (changes[AUTO_COMMENT_PROFILE_KEY]) {
            state.commentProfile = normalizeCommentProfile(changes[AUTO_COMMENT_PROFILE_KEY].newValue);
            populateCommentProfile();
        }
    });

    await refreshLessons();
}

function showView(name) {
    const lessonsActive = name === 'lessons';
    elements.lessonsTab.classList.toggle('active', lessonsActive);
    elements.manageTab.classList.toggle('active', !lessonsActive);
    elements.lessonsTab.setAttribute('aria-selected', String(lessonsActive));
    elements.manageTab.setAttribute('aria-selected', String(!lessonsActive));
    elements.lessonsView.classList.toggle('active', lessonsActive);
    elements.manageView.classList.toggle('active', !lessonsActive);
    elements.lessonsView.hidden = !lessonsActive;
    elements.manageView.hidden = lessonsActive;
}

async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
}

function isK12Url(url) {
    try {
        return new URL(url).origin === 'https://hcm.k12online.vn';
    } catch (_) {
        return false;
    }
}

async function sendToTab(tabId, message) {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        return { ok: false, message: error.message || 'Không kết nối được với trang K12.' };
    }
}

async function refreshLessons() {
    if (state.processing) {
        return;
    }

    elements.refreshButton.disabled = true;
    elements.scanStatus.textContent = 'Đang quét danh sách bài học...';
    elements.bulkStatus.textContent = '';
    elements.bulkStatus.className = 'bulk-status';

    const tab = await getActiveTab();
    state.tabId = tab ? tab.id : null;
    state.pageUrl = tab && tab.url ? tab.url : '';

    if (!tab || !tab.url || !isK12Url(tab.url)) {
        elements.pageContext.textContent = 'Mở trang hcm.k12online.vn để bắt đầu.';
        elements.scanStatus.textContent = 'Sidebar chỉ đọc danh sách trên trang K12 hiện tại.';
        state.candidates = [];
        state.selected.clear();
        state.results.clear();
        renderLessons();
        elements.refreshButton.disabled = false;
        return;
    }

    elements.pageContext.textContent = tab.title || 'hcm.k12online.vn';
    const response = await sendToTab(tab.id, { action: 'getLessonCandidates' });

    if (!response || response.ok === false) {
        elements.scanStatus.textContent = response && response.message
            ? response.message
            : 'Không đọc được trang. Hãy tải lại tab K12 rồi thử lại.';
        state.candidates = [];
        state.selected.clear();
        state.results.clear();
        renderLessons();
        elements.refreshButton.disabled = false;
        return;
    }

    const previousSelection = new Set(state.selected);
    state.candidates = Array.isArray(response.lessons) ? response.lessons : [];
    state.selected = new Set(state.candidates
        .filter((candidate) => previousSelection.has(candidate.key))
        .map((candidate) => candidate.key));
    state.results.clear();
    elements.scanStatus.textContent = response.message
        || `${state.candidates.length} bài học tìm thấy trên trang.`;
    renderLessons();
    elements.refreshButton.disabled = false;
}

function getVisibleCandidates() {
    const query = elements.search.value.trim().toLocaleLowerCase('vi');
    if (!query) {
        return state.candidates;
    }

    return state.candidates.filter((candidate) =>
        `${candidate.title} ${candidate.lessonId} ${candidate.coursewareId || ''}`
            .toLocaleLowerCase('vi')
            .includes(query)
    );
}

function candidateKey(candidate) {
    return candidate.key
        || `${candidate.lessonId}:${candidate.coursewareId || ''}:${candidate.courseSiteId || ''}:${candidate.site || ''}`;
}

function renderLessons() {
    const candidates = getVisibleCandidates();
    elements.lessonList.replaceChildren();
    elements.emptyState.hidden = candidates.length > 0;

    candidates.forEach((candidate) => {
        const card = document.createElement('article');
        const key = candidateKey(candidate);
        const selected = state.selected.has(key);
        const result = state.results.get(key);
        card.className = `lesson-card${selected ? ' selected' : ''}`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selected;
        checkbox.disabled = state.processing;
        checkbox.setAttribute('aria-label', `Chọn ${candidate.title}`);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                state.selected.add(key);
            } else {
                state.selected.delete(key);
            }
            renderLessons();
        });

        const option = document.createElement('label');
        option.className = 'lesson-option';
        option.append(checkbox);

        const copy = document.createElement('div');
        copy.className = 'lesson-copy';
        const title = document.createElement('span');
        title.className = 'lesson-title';
        title.textContent = candidate.title || `Bài học ${candidate.lessonId}`;
        const meta = document.createElement('span');
        meta.className = 'lesson-meta';
        meta.textContent = result
            ? result.ok ? 'Đã hoàn thành' : result.message
            : [
                candidate.progress ? `Tiến độ ${candidate.progress}` : '',
                candidate.coursewareId ? 'Courseware sẵn sàng' : 'Sẽ lấy thông tin khi xử lý'
            ].filter(Boolean).join(' · ');
        if (result) {
            meta.style.color = result.ok ? '#0f766e' : '#b42318';
        }
        copy.append(title, meta);

        card.append(option, copy);

        if (!candidate.requiresLessonLink) {
            const openLink = document.createElement('a');
            openLink.className = 'lesson-open';
            openLink.href = candidate.href;
            openLink.target = '_blank';
            openLink.rel = 'noopener noreferrer';
            openLink.textContent = 'Mở';
            openLink.setAttribute('aria-label', `Mở ${candidate.title}`);
            card.append(openLink);
        }

        elements.lessonList.append(card);
    });

    const selectedCount = state.selected.size;
    elements.selectedCount.textContent = `${selectedCount} đã chọn`;
    elements.completeSelected.disabled = state.processing || selectedCount === 0;
    elements.refreshButton.disabled = state.processing;

    const visibleKeys = candidates.map(candidateKey);
    const visibleSelected = visibleKeys.filter((key) => state.selected.has(key)).length;
    elements.selectAll.checked = visibleKeys.length > 0 && visibleSelected === visibleKeys.length;
    elements.selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visibleKeys.length;
    elements.selectAll.disabled = state.processing || visibleKeys.length === 0;
}

function toggleVisibleLessons() {
    const visible = getVisibleCandidates();
    if (elements.selectAll.checked) {
        visible.forEach((candidate) => state.selected.add(candidateKey(candidate)));
    } else {
        visible.forEach((candidate) => state.selected.delete(candidateKey(candidate)));
    }
    renderLessons();
}

async function completeSelectedLessons() {
    if (state.processing || !state.tabId) {
        return;
    }

    const selected = state.candidates.filter((candidate) =>
        state.selected.has(candidateKey(candidate))
    );
    if (selected.length === 0) {
        return;
    }

    state.processing = true;
    elements.bulkStatus.className = 'bulk-status';
    let succeeded = 0;
    let failed = 0;
    renderLessons();

    for (let index = 0; index < selected.length; index += 1) {
        const candidate = selected[index];
        const key = candidateKey(candidate);
        elements.bulkStatus.textContent = `Đang xử lý ${index + 1}/${selected.length}: ${candidate.title}`;

        const result = await sendToTab(state.tabId, {
            action: 'completeLessonFromSidebar',
            candidate
        });
        const itemResult = result && result.ok
            ? { ok: true, message: result.message || 'Đã hoàn thành.' }
            : { ok: false, message: result && result.message ? result.message : 'Không gửi được yêu cầu.' };

        state.results.set(key, itemResult);
        if (itemResult.ok) {
            succeeded += 1;
            state.selected.delete(key);
        } else {
            failed += 1;
        }
        renderLessons();
    }

    state.processing = false;
    renderLessons();
    elements.bulkStatus.className = failed === 0 ? 'bulk-status success' : 'bulk-status error';
    elements.bulkStatus.textContent = failed === 0
        ? `Hoàn tất ${succeeded}/${selected.length} bài.`
        : `Thành công ${succeeded}, lỗi ${failed}. Mở từng bài để xem thêm hoặc thử lại.`;
}

function normalizeCommentProfile(profile) {
    const values = profile && typeof profile === 'object' ? profile : {};
    return {
        name: String(values.name || ''),
        className: String(values.className || ''),
        studentId: String(values.studentId || '')
    };
}

function hasCompleteCommentProfile(profile) {
    return Boolean(profile.name.trim() && profile.className.trim() && profile.studentId.trim());
}

function readCommentProfileForm() {
    return normalizeCommentProfile({
        name: elements.commentName.value,
        className: elements.commentClass.value,
        studentId: elements.commentStudentId.value
    });
}

function populateCommentProfile() {
    elements.commentName.value = state.commentProfile.name;
    elements.commentClass.value = state.commentProfile.className;
    elements.commentStudentId.value = state.commentProfile.studentId;
    updateCommentPreview();
}

function updateCommentPreview() {
    const profile = readCommentProfileForm();
    elements.commentPreview.textContent = [
        profile.name.trim() || 'Tên',
        profile.className.trim() || 'Lớp',
        profile.studentId.trim() || 'Mã số',
        'đã xem ạ'
    ].join(' - ');
}

async function saveCommentProfile() {
    const profile = readCommentProfileForm();
    const storageUpdate = { [AUTO_COMMENT_PROFILE_KEY]: profile };
    state.commentProfile = profile;

    if (state.autoCommentEnabled && !hasCompleteCommentProfile(profile)) {
        state.autoCommentEnabled = false;
        elements.autoCommentToggle.checked = false;
        storageUpdate[AUTO_COMMENT_ENABLED_KEY] = false;
        elements.settingsStatus.textContent = 'Đã tắt tự động bình luận vì cần nhập đủ Tên, Lớp và Mã số.';
    } else {
        elements.settingsStatus.textContent = 'Đã lưu thông tin bình luận.';
    }

    await chrome.storage.local.set(storageUpdate);
}

async function updateAutoCommentSetting() {
    const enabled = elements.autoCommentToggle.checked;

    if (enabled && !hasCompleteCommentProfile(readCommentProfileForm())) {
        elements.autoCommentToggle.checked = false;
        state.autoCommentEnabled = false;
        elements.settingsStatus.textContent = 'Hãy nhập đủ Tên, Lớp và Mã số trước khi bật tự động bình luận.';
        return;
    }

    state.autoCommentEnabled = enabled;
    await chrome.storage.local.set({ [AUTO_COMMENT_ENABLED_KEY]: enabled });
    elements.settingsStatus.textContent = enabled
        ? 'Đã bật tự động bình luận sau khi hoàn thành bài.'
        : 'Đã tắt tự động bình luận.';
}

async function updateQuickButtonSetting() {
    state.quickButtonEnabled = elements.quickButtonToggle.checked;
    await chrome.storage.local.set({ [QUICK_BUTTON_KEY]: state.quickButtonEnabled });
    elements.settingsStatus.textContent = state.quickButtonEnabled
        ? 'Đã bật nút nhanh trên trang K12.'
        : 'Đã tắt nút nhanh trên trang K12.';

    if (state.tabId && isK12Url(state.pageUrl)) {
        await sendToTab(state.tabId, {
            action: 'setQuickButtonEnabled',
            enabled: state.quickButtonEnabled
        });
    }
}

function openExtensionManager() {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
}
