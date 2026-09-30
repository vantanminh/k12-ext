document.addEventListener('DOMContentLoaded', init);

const QUICK_BUTTON_KEY = 'k12QuickButtonEnabled';
const AUTO_COMMENT_ENABLED_KEY = 'k12AutoCommentEnabled';
const AUTO_COMMENT_PROFILE_KEY = 'k12AutoCommentProfile';
const SUBJECT_RULES_KEY = 'k12SubjectRules';
const AUTH_SESSION_KEY = 'k12AuthSession';
const state = {
    tabId: null,
    pageUrl: '',
    candidates: [],
    selected: new Set(),
    results: new Map(),
    processing: false,
    quickButtonEnabled: true,
    autoCommentEnabled: false,
    commentProfile: { name: '', className: '', studentId: '' },
    subjectRules: {},
    aiBusy: false,
    authSession: null,
    resendTimer: null
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
    subjectFilter: document.getElementById('subject-filter'),
    lessonStats: document.getElementById('lesson-stats'),
    subjectRules: document.getElementById('subject-rules'),
    workflowSelected: document.getElementById('workflow-selected'),
    selectAll: document.getElementById('select-all'),
    selectedCount: document.getElementById('selected-count'),
    lessonList: document.getElementById('lesson-list'),
    emptyState: document.getElementById('empty-state'),
    completeSelected: document.getElementById('complete-selected'),
    previewSelected: document.getElementById('preview-selected'),
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
Object.assign(elements, Object.fromEntries([
    'ai-tab', 'ai-view', 'ai-server-url', 'ai-server-token', 'ai-health', 'ai-current',
    'ai-status', 'ai-answers', 'api-record-toggle', 'api-export', 'discover-all', 'ai-selected', 'ai-submit-toggle', 'ai-read', 'ai-export-exercise', 'ai-export-result',
    'ai-login', 'ai-email', 'ai-send-code', 'ai-code-step', 'ai-code', 'ai-verify-code',
    'ai-account', 'ai-account-email', 'ai-quota', 'ai-logout', 'ai-auth-status'
].map(id => [id.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), document.getElementById(id)])));

async function init() {
    elements.extensionVersion.textContent = `v${chrome.runtime.getManifest().version}`;
    elements.refreshButton.addEventListener('click', () => refreshLessons());
    elements.search.addEventListener('input', renderLessons);
    elements.subjectFilter.addEventListener('change', renderLessons);
    elements.selectAll.addEventListener('change', toggleVisibleLessons);
    elements.completeSelected.addEventListener('click', completeSelectedLessons);
    elements.lessonsTab.addEventListener('click', () => showView('lessons'));
    elements.manageTab.addEventListener('click', () => showView('manage'));
    elements.aiTab.addEventListener('click', () => showView('ai'));
    elements.discoverAll.addEventListener('click', discoverAllLessons);
    elements.aiSelected.addEventListener('click', solveSelectedExercises);
    elements.previewSelected.addEventListener('click', previewSelectedWorkflow);
    elements.workflowSelected.addEventListener('click', runSelectedWorkflow);
    elements.aiCurrent.addEventListener('click', solveCurrentExercise);
    elements.aiRead.addEventListener('click', inspectCurrentExercise);
    elements.aiExportExercise.addEventListener('click', exportReadExercise);
    elements.aiExportResult.addEventListener('click', exportAiResult);
    elements.aiHealth.addEventListener('click', checkAiServer);
    elements.aiSendCode.addEventListener('click', sendLoginCode);
    elements.aiVerifyCode.addEventListener('click', verifyLoginCode);
    elements.aiLogout.addEventListener('click', logout);
    elements.aiEmail.addEventListener('keydown', event => { if (event.key === 'Enter') sendLoginCode(); });
    elements.aiCode.addEventListener('keydown', event => { if (event.key === 'Enter') verifyLoginCode(); });
    elements.apiRecordToggle.addEventListener('change', () => chrome.storage.local.set({ k12ApiRecording: elements.apiRecordToggle.checked }));
    elements.apiExport.addEventListener('click', exportApiCapture);
    [elements.aiServerUrl, elements.aiServerToken].forEach(input => input.addEventListener('change', saveAiSettings));
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
        [AUTO_COMMENT_PROFILE_KEY]: { name: '', className: '', studentId: '' },
        [SUBJECT_RULES_KEY]: {},
        k12AiServerUrl: 'http://127.0.0.1:3210', k12AiServerToken: '', k12ApiRecording: false,
        [AUTH_SESSION_KEY]: null, k12AuthEmail: ''
    });
    elements.aiServerUrl.value = settings.k12AiServerUrl;
    elements.aiServerToken.value = settings.k12AiServerToken;
    elements.aiEmail.value = settings.k12AuthEmail;
    state.authSession = settings[AUTH_SESSION_KEY];
    renderAccount();
    refreshAccount({ quiet: true });
    elements.apiRecordToggle.checked = settings.k12ApiRecording;
    const { k12LastAiResult } = await chrome.storage.local.get('k12LastAiResult');
    if (k12LastAiResult) {
        try {
            const input = K12AI.validateExercise(k12LastAiResult.exercise);
            const result = K12AI.validateAnswers(input, k12LastAiResult.result);
            renderAiAnswers(input, result);
            elements.aiStatus.textContent = 'Đang hiển thị đáp án AI gần nhất. Xem tên đề trước khi sử dụng.';
        } catch (_) {}
    }
    state.quickButtonEnabled = settings[QUICK_BUTTON_KEY] !== false;
    elements.quickButtonToggle.checked = state.quickButtonEnabled;
    state.autoCommentEnabled = settings[AUTO_COMMENT_ENABLED_KEY] === true;
    state.commentProfile = normalizeCommentProfile(settings[AUTO_COMMENT_PROFILE_KEY]);
    state.subjectRules = settings[SUBJECT_RULES_KEY] || {};
    populateCommentProfile();
    renderSubjectControls();
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
        if (changes[SUBJECT_RULES_KEY]) {
            state.subjectRules = changes[SUBJECT_RULES_KEY].newValue || {};
            renderSubjectControls();
        }
    });

    await refreshLessons();
}

function showView(name) {
    for (const [key, tab, view] of [
        ['lessons', elements.lessonsTab, elements.lessonsView],
        ['manage', elements.manageTab, elements.manageView],
        ['ai', elements.aiTab, elements.aiView]
    ]) {
        tab.classList.toggle('active', key === name);
        tab.setAttribute('aria-selected', String(key === name));
        view.classList.toggle('active', key === name);
        view.hidden = key !== name;
    }
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
    if (state.processing) return;
    state.processing = true;
    renderLessons();
    elements.refreshButton.disabled = true;
    elements.scanStatus.textContent = 'Đang quét danh sách bài học...';
    elements.bulkStatus.textContent = '';
    elements.bulkStatus.className = 'bulk-status';

    try {
        const tab = await getActiveTab();
        state.tabId = tab ? tab.id : null;
        state.pageUrl = tab && tab.url ? tab.url : '';

        if (!tab || !tab.url || !isK12Url(tab.url)) {
            elements.pageContext.textContent = 'Mở trang hcm.k12online.vn để bắt đầu.';
            elements.scanStatus.textContent = 'Sidebar chỉ đọc danh sách trên trang K12 hiện tại.';
            state.candidates = [];
            state.selected.clear();
            state.results.clear();
            return;
        }

        elements.pageContext.textContent = tab.title || 'hcm.k12online.vn';
        const scanAll = K12AI.isFreeLessonListUrl(tab.url);
        if (scanAll) elements.scanStatus.textContent = 'Đang quét tất cả trang của danh sách bài học...';
        const response = scanAll
            ? await chrome.runtime.sendMessage({ action: 'discoverAllLessons', tabId: tab.id })
            : await sendToTab(tab.id, { action: 'getLessonCandidates' });

        if (!response || response.ok === false && !Array.isArray(response.lessons)) {
            elements.scanStatus.textContent = response && response.message
                ? response.message
                : 'Không đọc được trang. Hãy tải lại tab K12 rồi thử lại.';
            state.candidates = [];
            state.selected.clear();
            state.results.clear();
            return;
        }

        const previousSelection = new Set(state.selected);
        state.candidates = Array.isArray(response.lessons) ? response.lessons : [];
        renderSubjectControls();
        state.selected = new Set(state.candidates
            .filter((candidate) => previousSelection.has(candidate.key))
            .map((candidate) => candidate.key));
        state.results.clear();
        elements.scanStatus.textContent = response.message
            || `${state.candidates.length} bài học tìm thấy trên trang.`;
    } catch (error) {
        elements.scanStatus.textContent = error.message || 'Không đọc được danh sách bài học.';
    } finally {
        state.processing = false;
        renderLessons();
        elements.refreshButton.disabled = false;
    }
}

function getVisibleCandidates() {
    const query = elements.search.value.trim().toLocaleLowerCase('vi');
    const subject = elements.subjectFilter.value;
    return state.candidates.filter((candidate) =>
        (!subject || candidate.subject === subject)
        && (!query || `${candidate.title} ${candidate.subject || ''} ${candidate.lessonId} ${candidate.coursewareId || ''}`
            .toLocaleLowerCase('vi').includes(query))
    );
}

function subjectRule(subject) {
    return K12AI.subjectRule(state.subjectRules[subject], state.autoCommentEnabled);
}

function renderSubjectControls() {
    const subjects = [...new Set([...state.candidates.map(c => c.subject).filter(Boolean), ...Object.keys(state.subjectRules)])].sort((a, b) => a.localeCompare(b, 'vi'));
    const chosen = elements.subjectFilter.value;
    elements.subjectFilter.replaceChildren(new Option('Tất cả môn học', ''));
    for (const subject of subjects) elements.subjectFilter.add(new Option(subject, subject));
    elements.subjectFilter.value = subjects.includes(chosen) ? chosen : '';
    elements.subjectRules.replaceChildren();
    if (!subjects.length) {
        const empty = document.createElement('p');
        empty.className = 'comment-preview-line';
        empty.textContent = 'Quét trang Bài giảng học tự do để hiện các môn học.';
        elements.subjectRules.append(empty);
        return;
    }
    for (const subject of subjects) {
        const rule = subjectRule(subject);
        const card = document.createElement('div');
        card.className = 'subject-rule';
        const name = document.createElement('strong');
        name.textContent = subject;
        const options = document.createElement('div');
        options.className = 'subject-rule-options';
        const modeLabel = document.createElement('label');
        modeLabel.textContent = 'Bài tập';
        const mode = document.createElement('select');
        mode.setAttribute('aria-label', `Cách xử lý bài tập môn ${subject}`);
        for (const [value, label] of [['skip', 'Bỏ qua'], ['submit', 'Nộp đáp án'], ['comment', 'Chỉ bình luận đáp án'], ['both', 'Nộp và bình luận đáp án']]) mode.add(new Option(label, value));
        mode.value = rule.exerciseMode;
        mode.addEventListener('change', async () => {
            state.subjectRules = { ...state.subjectRules, [subject]: { ...subjectRule(subject), exerciseMode: mode.value } };
            await chrome.storage.local.set({ [SUBJECT_RULES_KEY]: state.subjectRules });
            elements.settingsStatus.textContent = `Đã lưu quy tắc môn ${subject}.`;
        });
        modeLabel.append(mode);
        options.append(modeLabel);
        for (const [key, label] of [['view', 'Đánh dấu tài liệu/video đã xem'], ['materialComment', 'Bình luận đã xem cho tài liệu/video']]) {
            const wrapper = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = rule[key];
            input.addEventListener('change', async () => {
                state.subjectRules = { ...state.subjectRules, [subject]: { ...subjectRule(subject), [key]: input.checked } };
                await chrome.storage.local.set({ [SUBJECT_RULES_KEY]: state.subjectRules });
                elements.settingsStatus.textContent = `Đã lưu quy tắc môn ${subject}.`;
            });
            wrapper.append(input, document.createTextNode(label));
            options.append(wrapper);
        }
        card.append(name, options);
        elements.subjectRules.append(card);
    }
}

function candidateKey(candidate) {
    return candidate.key
        || `${candidate.lessonId}:${candidate.coursewareId || ''}:${candidate.courseSiteId || ''}:${candidate.site || ''}`;
}

function renderLessons() {
    const candidates = getVisibleCandidates();
    const completed = candidates.filter(c => /^100\s*%$/.test(c.progress || '')).length;
    elements.lessonStats.textContent = `${completed}/${candidates.length} đạt 100%`;
    elements.lessonList.replaceChildren();
    elements.emptyState.hidden = candidates.length > 0;
    elements.emptyState.querySelector('h3').textContent = state.candidates.length ? 'Không có bài khớp bộ lọc' : 'Chưa tìm thấy bài học';
    elements.emptyState.querySelector('p').textContent = state.candidates.length
        ? 'Xóa tên tìm kiếm hoặc chọn Tất cả môn học để hiện các nội dung trên trang.'
        : 'Mở trang danh sách bài học K12 có các dòng bài, rồi bấm quét lại.';

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
            ? result.message
            : [
                candidate.subject || '',
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
    elements.completeSelected.disabled = state.processing || state.aiBusy || selectedCount === 0;
    elements.previewSelected.disabled = state.processing || state.aiBusy || selectedCount === 0;
    elements.aiSelected.disabled = state.processing || state.aiBusy || selectedCount === 0;
    elements.workflowSelected.disabled = state.processing || state.aiBusy || selectedCount === 0;
    elements.discoverAll.disabled = state.processing || state.aiBusy;
    elements.refreshButton.disabled = state.processing;

    const visibleKeys = candidates.map(candidateKey);
    const visibleSelected = visibleKeys.filter((key) => state.selected.has(key)).length;
    elements.selectAll.checked = visibleKeys.length > 0 && visibleSelected === visibleKeys.length;
    elements.selectAll.indeterminate = visibleSelected > 0 && visibleSelected < visibleKeys.length;
    elements.selectAll.disabled = state.processing || visibleKeys.length === 0;
}

function previewItemMessage(entry) {
    const name = entry.item.title || entry.item.coursewareId || 'Nội dung bài học';
    const stateLabel = entry.completed ? 'đã 100%' : 'chưa hoàn thành';
    const profileWarning = entry.requiresCommentProfile ? ' Cần nhập Tên, Lớp, Mã số trước khi chạy.' : '';
    return `${name}: ${entry.coursewareType} — ${entry.action} (${stateLabel}).${profileWarning}`;
}

async function previewSelectedWorkflow() {
    if (state.processing || state.aiBusy || !state.tabId) return;
    const selected = state.candidates.filter((candidate) => state.selected.has(candidateKey(candidate)));
    if (!selected.length) return;

    state.processing = true;
    elements.bulkStatus.className = 'bulk-status';
    renderLessons();
    let inspected = 0;
    let needsAttention = 0;
    try {
        for (const [index, candidate] of selected.entries()) {
            elements.bulkStatus.textContent = `Xem trước ${index + 1}/${selected.length}: ${candidate.title}`;
            try {
                const list = await chrome.runtime.sendMessage({ action: 'getCandidateExercises', candidate, tabId: state.tabId });
                if (!list?.ok || !Array.isArray(list.candidates)) {
                    throw new Error(list?.message || 'Không tìm thấy nội dung bài học.');
                }
                const plan = K12AI.workflowPreview(list.candidates, state.subjectRules[candidate.subject || ''], hasCompleteCommentProfile(state.commentProfile));
                const uncertain = plan.filter(entry => entry.unsupported || entry.requiresCommentProfile).length;
                needsAttention += uncertain;
                state.results.set(candidateKey(candidate), {
                    ok: uncertain === 0,
                    kind: 'preview',
                    message: `Xem trước ${plan.length} nội dung. ${plan.map(previewItemMessage).join(' ')}`
                });
                inspected += 1;
            } catch (error) {
                needsAttention += 1;
                state.results.set(candidateKey(candidate), { ok: false, kind: 'preview', message: `Không xem trước được: ${error.message}` });
            }
            renderLessons();
        }
        elements.bulkStatus.textContent = `Đã xem trước ${inspected}/${selected.length} bài học. Không gửi yêu cầu đánh dấu, nộp đáp án hoặc bình luận lên K12.${needsAttention ? ` Có ${needsAttention} mục cần xem lại.` : ''}`;
        elements.bulkStatus.className = needsAttention ? 'bulk-status error' : 'bulk-status success';
    } finally {
        state.processing = false;
        renderLessons();
    }
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

async function discoverAllLessons() {
    if (state.processing || state.aiBusy || !state.tabId) return;
    state.processing = true;
    renderLessons();
    elements.scanStatus.textContent = 'Đang mở danh sách K12 và quét từng trang...';
    try {
        const result = await chrome.runtime.sendMessage({ action: 'discoverAllLessons', tabId: state.tabId });
        if (Array.isArray(result?.lessons)) {
            state.candidates = result.lessons;
            renderSubjectControls();
            state.selected.clear();
            state.results.clear();
        }
        elements.scanStatus.textContent = result?.message || 'Không quét được bài học.';
    } catch (error) { elements.scanStatus.textContent = error.message; }
    finally { state.processing = false; renderLessons(); }
}

async function saveAiSettings() {
    try {
        const url = K12AI.serverUrl(elements.aiServerUrl.value);
        await chrome.storage.local.set({ k12AiServerUrl: url, k12AiServerToken: elements.aiServerToken.value.trim() });
        // A session belongs to the server that issued it.
        if (state.authSession && state.authSession.server !== url) await setAuthSession(null);
        elements.aiStatus.textContent = 'Đã lưu cấu hình server.';
    } catch (error) { elements.aiStatus.textContent = error.message; }
}

async function setAuthSession(session) {
    state.authSession = session;
    if (session) await chrome.storage.local.set({ [AUTH_SESSION_KEY]: session });
    else await chrome.storage.local.remove(AUTH_SESSION_KEY);
    renderAccount();
}

function currentSession() {
    try {
        const server = K12AI.serverUrl(elements.aiServerUrl.value);
        return state.authSession?.server === server ? state.authSession : null;
    } catch (_) { return null; }
}

function renderAccount(account) {
    const session = currentSession();
    elements.aiLogin.hidden = Boolean(session);
    elements.aiAccount.hidden = !session;
    elements.aiAccountEmail.textContent = session?.email || '';
    if (!session) elements.aiQuota.textContent = '';
    else if (account) {
        elements.aiQuota.textContent = `Hôm nay còn ${account.remaining_today}/${account.daily_limit} lượt giải AI.`;
    }
}

async function refreshAccount({ quiet = false } = {}) {
    if (!currentSession()) return;
    try {
        const base = K12AI.serverUrl(elements.aiServerUrl.value);
        // Opening the panel is not a user gesture, so only check an existing grant here.
        if (base.startsWith('https://') && !await chrome.permissions.contains({ origins: [base + '/*'] })) return;
        renderAccount(await aiRequest('/v1/auth/me'));
    } catch (error) {
        if (!quiet) elements.aiAuthStatus.textContent = error.message;
    }
}

async function sendLoginCode() {
    if (elements.aiSendCode.disabled) return;
    elements.aiSendCode.disabled = true;
    let cooldown = 0;
    try {
        const email = K12AI.normalizeEmail(elements.aiEmail.value);
        elements.aiEmail.value = email;
        await chrome.storage.local.set({ k12AuthEmail: email });
        await ensureServerPermission();
        elements.aiAuthStatus.textContent = 'Đang gửi mã...';
        const result = await aiRequest('/v1/auth/otp', { email });
        cooldown = result.resend_after || 60;
        elements.aiCodeStep.hidden = false;
        elements.aiCode.value = '';
        elements.aiCode.focus();
        elements.aiAuthStatus.textContent = `Đã gửi mã tới ${email}. Kiểm tra cả thư mục Spam.`;
    } catch (error) {
        elements.aiAuthStatus.textContent = error.message;
    } finally {
        startResendCooldown(cooldown);
    }
}

function startResendCooldown(seconds) {
    clearInterval(state.resendTimer);
    const tick = () => {
        const label = elements.aiCodeStep.hidden ? 'Gửi mã đăng nhập' : 'Gửi lại mã';
        if (seconds <= 0) {
            clearInterval(state.resendTimer);
            elements.aiSendCode.disabled = false;
            elements.aiSendCode.textContent = label;
            return;
        }
        elements.aiSendCode.disabled = true;
        elements.aiSendCode.textContent = `${label} (${seconds--}s)`;
    };
    tick();
    if (seconds > 0) state.resendTimer = setInterval(tick, 1000);
}

async function verifyLoginCode() {
    const code = elements.aiCode.value.trim();
    if (!/^\d{6}$/.test(code)) {
        elements.aiAuthStatus.textContent = 'Nhập đủ 6 chữ số trong email.';
        return;
    }
    elements.aiVerifyCode.disabled = true;
    try {
        const server = K12AI.serverUrl(elements.aiServerUrl.value);
        const email = K12AI.normalizeEmail(elements.aiEmail.value);
        const result = await aiRequest('/v1/auth/verify', { email, code });
        await setAuthSession({ server, email: result.email, token: result.token, expiresAt: result.expires_at });
        elements.aiCode.value = '';
        elements.aiCodeStep.hidden = true;
        startResendCooldown(0);
        elements.aiAuthStatus.textContent = 'Đăng nhập thành công.';
        await refreshAccount();
    } catch (error) {
        elements.aiAuthStatus.textContent = error.message;
    } finally {
        elements.aiVerifyCode.disabled = false;
    }
}

async function logout() {
    elements.aiLogout.disabled = true;
    try { await aiRequest('/v1/auth/logout', {}); } catch (_) {}
    await setAuthSession(null);
    elements.aiLogout.disabled = false;
    elements.aiAuthStatus.textContent = 'Đã đăng xuất.';
}

async function aiRequest(path, body) {
    const base = K12AI.serverUrl(elements.aiServerUrl.value);
    const response = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: {
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...K12AI.authHeaders(base, state.authSession, elements.aiServerToken.value.trim())
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(110000)
    });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); }
    catch (_) {
        throw new Error(response.status === 413
            ? 'Đề vượt quá giới hạn dữ liệu của server. Hãy cập nhật và khởi động lại server.'
            : `Server trả HTTP ${response.status} nhưng không phải JSON. Hãy khởi động lại server bằng start.ps1.`);
    }
    if (response.status === 401 && ['SESSION_EXPIRED', 'UNAUTHORIZED'].includes(result.code) && currentSession()) {
        await setAuthSession(null);
        elements.aiAuthStatus.textContent = 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại bằng email.';
    }
    if (!response.ok) throw new Error(result.message || `Server trả HTTP ${response.status}.`);
    return result;
}

async function ensureServerPermission() {
    const base = K12AI.serverUrl(elements.aiServerUrl.value);
    if (base.startsWith('http://')) return;
    const granted = await chrome.permissions.request({ origins: [base + '/*'] });
    if (!granted) throw new Error('Chrome chưa cho phép tiện ích kết nối tới server HTTPS này.');
}

async function checkAiServer() {
    elements.aiHealth.disabled = true;
    try {
        await ensureServerPermission();
        const health = await aiRequest('/health');
        elements.aiStatus.textContent = health.protocol_version !== 2
            ? 'Server đang chạy bản cũ. Hãy khởi động lại bằng start.ps1.'
            : health.ready ? `Server sẵn sàng, model ${health.model}.${health.email_login ? '' : ' Server chưa bật đăng nhập email.'}`
            : `Server đang chạy. Cần cấu hình ${[!health.api_key_configured ? 'OPENAI_API_KEY' : '', !health.email_login && !health.connection_token_configured ? 'đăng nhập email (Cloudflare Email Service) hoặc K12_SERVER_TOKEN' : ''].filter(Boolean).join(' và ')} trên server.`;
    } catch (error) { elements.aiStatus.textContent = `Không kết nối được server: ${error.message}`; }
    finally { elements.aiHealth.disabled = false; }
}

async function solveExercise(exercise) {
    const input = K12AI.validateExercise(exercise);
    const { k12AiResults = [] } = await chrome.storage.local.get('k12AiResults');
    const cached = k12AiResults.find(entry => JSON.stringify(entry.exercise) === JSON.stringify(input));
    if (cached && cached.result.answers.every(answer => answer.confidence >= 0.7)) {
        const result = K12AI.validateAnswers(input, cached.result);
        renderAiAnswers(input, result);
        await chrome.storage.local.set({ k12LastAiResult: { ...cached, exercise: input, result, submitted: false, completed: false } });
        return result;
    }
    if (!currentSession() && !elements.aiServerToken.value.trim()) {
        throw new Error('Hãy đăng nhập bằng email trong tab AI bài tập trước khi giải.');
    }
    const health = await aiRequest('/health');
    if (health.protocol_version !== 2) {
        throw new Error('Server đang chạy bản cũ. Hãy khởi động lại server bằng start.ps1 rồi thử lại.');
    }
    const result = K12AI.validateAnswers(input, await aiRequest('/v1/solve', input));
    refreshAccount({ quiet: true });
    renderAiAnswers(input, result);
    // AI output is never treated as proof of submission or completion.
    const entry = { exercise: input, result, time: new Date().toISOString(), submitted: false };
    await chrome.storage.local.set({ k12LastAiResult: entry,
        k12AiResults: [entry, ...k12AiResults.filter(old => JSON.stringify(old.exercise) !== JSON.stringify(input))].slice(0, 10) });
    return result;
}

function renderAiAnswers(exercise, result) {
    elements.aiStatus.textContent = `Đã có ${result.answers.length} đáp án AI. Chưa nộp đáp án lên K12.`;
    elements.aiAnswers.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = exercise.title;
    elements.aiAnswers.append(heading);
    const summary = document.createElement('p');
    summary.className = 'answer-summary';
    summary.textContent = K12AI.formatAnswerSummary(exercise, result);
    elements.aiAnswers.append(summary);
    for (const answer of result.answers) {
        const question = exercise.questions.find(q => q.id === answer.question_id);
        const card = document.createElement('details');
        card.className = 'settings-card';
        const title = document.createElement('summary');
        title.textContent = question.prompt.match(/^Câu \d+[^.]*\./)?.[0] || question.prompt.slice(0, 100);
        const prompt = document.createElement('p');
        prompt.textContent = question.prompt;
        const value = document.createElement('p');
        value.textContent = answer.choice_ids.length
            ? answer.choice_ids.map(id => question.choices.find(c => c.id === id).text).join('; ') : answer.text;
        const explanation = document.createElement('p');
        explanation.className = 'comment-preview-line';
        explanation.textContent = `${answer.explanation} (Độ tin cậy ${Math.round(answer.confidence * 100)}%)`;
        card.append(title, value, prompt, explanation);
        elements.aiAnswers.append(card);
    }
}

async function exportAiResult() {
    const { k12LastAiResult } = await chrome.storage.local.get('k12LastAiResult');
    if (!k12LastAiResult) { elements.aiStatus.textContent = 'Chưa có kết quả AI để xuất.'; return; }
    const exercise = K12AI.validateExercise(k12LastAiResult.exercise);
    const result = K12AI.validateAnswers(exercise, k12LastAiResult.result);
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exercise, result, time: k12LastAiResult.time,
        submitted: k12LastAiResult.submitted === true, completed: k12LastAiResult.completed === true }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'k12-ai-result.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    elements.aiStatus.textContent = 'Đã xuất đề và đáp án AI gần nhất.';
}

async function solveCurrentExercise() {
    if (state.aiBusy || state.processing) return;
    state.aiBusy = true;
    renderLessons();
    elements.aiCurrent.disabled = true;
    elements.aiStatus.textContent = 'Đang đọc câu hỏi trên trang K12...';
    let readCount = 0;
    try {
        await ensureServerPermission();
        const tab = await getActiveTab();
        if (!tab || !isK12Url(tab.url)) throw new Error('Hãy mở trang câu hỏi K12.');
        const read = await sendToTab(tab.id, { action: 'prepareExercise' });
        if (!read?.ok) throw new Error(read?.message || 'Không đọc được câu hỏi.');
        readCount = read.exercise.questions.length;
        await chrome.storage.local.set({ k12LastReadExercise: read.exercise });
        elements.aiStatus.textContent = `Đã đọc ${read.exercise.questions.length} câu. Đang gọi AI...`;
        const result = await solveExercise(read.exercise);
        if (elements.aiSubmitToggle.checked) {
            elements.aiStatus.textContent = 'Đang gửi đáp án và kiểm tra tiến độ K12...';
            const sent = await sendToTab(tab.id, { action: 'submitExercise', exercise: read.exercise, result });
            if (!sent?.ok) throw new Error(sent?.message || 'Không nộp được bài.');
            await chrome.storage.local.set({ k12LastAiResult: { exercise: read.exercise, result, time: new Date().toISOString(), ...sent } });
            elements.aiStatus.textContent = sent.message;
        } else elements.aiStatus.textContent = 'Đã nhận đáp án AI. Chưa nộp bài.';
    } catch (error) { elements.aiStatus.textContent = `${readCount ? `Đã đọc ${readCount} câu. ` : ''}${error.message}`; }
    finally { state.aiBusy = false; elements.aiCurrent.disabled = false; renderLessons(); }
}

async function inspectCurrentExercise() {
    if (state.processing || state.aiBusy) return;
    state.aiBusy = true;
    elements.aiRead.disabled = true;
    renderLessons();
    try {
        const tab = await getActiveTab();
        if (!tab || !isK12Url(tab.url)) throw Error('Hãy mở một bài tập K12.');
        const read = await sendToTab(tab.id, { action: 'prepareExercise' });
        if (!read?.ok) throw Error(read?.message || 'Không đọc được đề.');
        const exercise = K12AI.validateExercise(read.exercise);
        await chrome.storage.local.set({ k12LastReadExercise: exercise });
        elements.aiStatus.textContent = `Đã đọc ${exercise.questions.length} câu/ý, ${exercise.images?.length || 0} hình${exercise.pdf_url ? ', kèm đề PDF' : ''}.`;
    } catch (error) { elements.aiStatus.textContent = error.message; }
    finally { state.aiBusy = false; elements.aiRead.disabled = false; renderLessons(); }
}

async function exportReadExercise() {
    const { k12LastReadExercise } = await chrome.storage.local.get('k12LastReadExercise');
    if (!k12LastReadExercise) { elements.aiStatus.textContent = 'Hãy đọc đề trước khi xuất dữ liệu.'; return; }
    const exercise = K12AI.validateExercise(k12LastReadExercise);
    const url = URL.createObjectURL(new Blob([JSON.stringify(exercise, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'k12-exercise.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    elements.aiStatus.textContent = `Đã xuất ${exercise.questions.length} câu/ý; dữ liệu không chứa token phiên.`;
}

async function solveSelectedExercises() {
    if (state.processing || state.aiBusy) return;
    const selected = state.candidates.filter(c => state.selected.has(candidateKey(c)));
    if (!selected.length) return;
    state.processing = true;
    renderLessons();
    let solved = 0;
    try {
        await ensureServerPermission();
        for (let index = 0; index < selected.length; index += 1) {
            const candidate = selected[index];
            elements.bulkStatus.textContent = `Đọc đề ${index + 1}/${selected.length}: ${candidate.title}`;
            try {
                const list = await chrome.runtime.sendMessage({ action: 'getCandidateExercises', candidate, tabId: state.tabId });
                if (!list?.ok) throw new Error(list?.message || 'Không tìm thấy nội dung.');
                let count = 0;
                const failures = [];
                for (const item of list.candidates) {
                    let read;
                    try {
                        read = await chrome.runtime.sendMessage({ action: 'prepareCandidateExercise', candidate: item });
                        if (!read?.ok) { if (!read?.notExercise) failures.push(`${item.title}: ${read?.message || 'Không đọc được bài tập'}`); continue; }
                        const result = await solveExercise(read.exercise);
                        if (elements.aiSubmitToggle.checked) {
                            const sent = await sendToTab(read.tabId, { action: 'submitExercise', exercise: read.exercise, result });
                            if (!sent?.ok || !sent.completed) throw new Error(sent?.message || 'Chưa xác minh được bài hoàn thành.');
                            await chrome.storage.local.set({ k12LastAiResult: { exercise: read.exercise, result, time: new Date().toISOString(), ...sent } });
                        }
                        count++;
                    } catch (error) {
                        failures.push(`${item.title}: ${error.message}`);
                    } finally {
                        if (read?.tabId) await chrome.runtime.sendMessage({ action: 'releaseExerciseTab', tabId: read.tabId }).catch(() => {});
                    }
                }
                if (!count && !failures.length) throw new Error('Không tìm thấy bài tập trong nội dung bài học; các mục đã đọc là tài liệu hoặc video.');
                if (failures.length) throw new Error(`${count} bài tập xử lý xong. ${failures.join(' ')}`);
                state.results.set(candidateKey(candidate), { ok: true, kind: elements.aiSubmitToggle.checked ? 'exercise' : 'ai', message: `${count} bài tập ${elements.aiSubmitToggle.checked ? 'được K12 xác nhận hoàn thành.' : 'đã có đáp án; chưa nộp.'}` });
                solved += 1;
            } catch (error) { state.results.set(candidateKey(candidate), { ok: false, message: error.message }); }
            renderLessons();
        }
        elements.bulkStatus.textContent = `Xử lý xong ${solved}/${selected.length} bài học.${elements.aiSubmitToggle.checked ? ' Tiến độ được xác minh từ K12.' : ' Chưa nộp đáp án lên K12.'}`;
    } finally { state.processing = false; renderLessons(); }
}

async function runSelectedWorkflow() {
    if (state.processing || state.aiBusy || !state.tabId) return;
    try { await ensureServerPermission(); }
    catch (error) { elements.bulkStatus.textContent = error.message; return; }
    const selected = state.candidates.filter(c => state.selected.has(candidateKey(c)));
    if (!selected.length) return;
    state.processing = true;
    renderLessons();
    let succeeded = 0;
    const sourceTabId = state.tabId;
    try {
        for (const [index, candidate] of selected.entries()) {
            elements.bulkStatus.textContent = `Quy trình ${index + 1}/${selected.length}: ${candidate.subject || 'Chưa rõ môn'} — ${candidate.title}`;
            try {
                const rule = subjectRule(candidate.subject || '');
                if ((rule.comment || (rule.view && rule.materialComment)) && !hasCompleteCommentProfile(state.commentProfile)) {
                    throw new Error('Cần nhập đủ Tên, Lớp và Mã số trong Quản lý trước khi chạy môn có bình luận.');
                }
                const list = await chrome.runtime.sendMessage({ action: 'getCandidateExercises', candidate, tabId: sourceTabId });
                if (!list?.ok) throw new Error(list?.message || 'Không tìm thấy nội dung bài học.');
                const outcome = await K12Workflow.run(list.candidates, rule, {
                    prepare: item => chrome.runtime.sendMessage({ action: 'prepareCandidateExercise', candidate: item }),
                    complete: item => sendToTab(sourceTabId, { action: 'completeLessonFromSidebar', candidate: { ...item, subject: candidate.subject } }),
                    solve: solveExercise,
                    submit: async (opened, result) => {
                        const sent = await sendToTab(opened.tabId, { action: 'submitExercise', exercise: opened.exercise, result });
                        await chrome.storage.local.set({ k12LastAiResult: { exercise: opened.exercise, result, time: new Date().toISOString(), ...sent } });
                        return sent;
                    },
                    comment: (opened, result) => sendToTab(opened.tabId, { action: 'postExerciseComment', exercise: opened.exercise, result }),
                    release: tabId => chrome.runtime.sendMessage({ action: 'releaseExerciseTab', tabId }).catch(() => {})
                });
                const message = outcome.records.map(record => `${record.item.title || record.item.coursewareId}: ${record.message}`).join(' ');
                state.results.set(candidateKey(candidate), { ok: outcome.ok, kind: 'workflow', message });
                if (outcome.completed) candidate.progress = '100%';
                if (outcome.ok) { state.selected.delete(candidateKey(candidate)); succeeded++; }
            } catch (error) { state.results.set(candidateKey(candidate), { ok: false, message: error.message }); }
            renderLessons();
        }
        elements.bulkStatus.textContent = `Đã xử lý ${succeeded}/${selected.length} bài học; xem từng thẻ để biết kết quả.`;
        elements.bulkStatus.className = succeeded === selected.length ? 'bulk-status success' : 'bulk-status error';
    } finally { state.processing = false; renderLessons(); }
}

async function exportApiCapture() {
    const { k12ApiCaptures = [] } = await chrome.storage.local.get('k12ApiCaptures');
    const url = URL.createObjectURL(new Blob([JSON.stringify(K12AI.redact(k12ApiCaptures), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'k12-api-capture.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    elements.aiStatus.textContent = `Đã xuất ${k12ApiCaptures.length} request/response đã che token.`;
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
