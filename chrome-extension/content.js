(() => {
    const UI_ID = 'k12ext-video-complete';
    const BUTTON_ID = 'k12ext-run-button';
    const STATUS_ID = 'k12ext-status';
    const SUPPORTED_PATHNAME = /^\/\d+\/page\/LMS\/Lesson\/Courseware\/learn\/[^/?#]+$/i;
    const COMPLETE_ENDPOINT = 'https://hcm.k12online.vn/api/LMS/Learning/CourseResult/Video/complete';
    const GUARD_INTERVAL_MS = 2000;

    const state = {
        isRunning: false,
        observer: null,
        historyPatched: false,
        confirmedVideoPage: false,
        confirmedUrl: '',
        guardTimer: null
    };

    function isVideoPageUrl() {
        return location.hostname === 'hcm.k12online.vn'
            && SUPPORTED_PATHNAME.test(location.pathname);
    }

    function hasVideoElement() {
        return Boolean(
            document.querySelector(
                '#video-upload, .video-loadDetail video, video source[type^="video/"], .video-loadDetail'
            )
        );
    }

    function hasVideoScriptMarker() {
        try {
            return getInlineScriptSource().includes('LMS.Learning.Lesson.Courseware.Video');
        } catch (_) {
            return false;
        }
    }

    function detectVideoPage() {
        if (!isVideoPageUrl()) {
            return false;
        }

        if (state.confirmedVideoPage && state.confirmedUrl === location.href) {
            return true;
        }

        if (state.confirmedUrl !== location.href) {
            state.confirmedVideoPage = false;
        }

        if (hasVideoElement() || hasVideoScriptMarker()) {
            state.confirmedVideoPage = true;
            state.confirmedUrl = location.href;
            return true;
        }

        return false;
    }

    function getQueryValue(name) {
        return new URLSearchParams(location.search).get(name) || '';
    }

    function getInlineScriptSource() {
        return Array.from(document.scripts, (script) => script.textContent || '').join('\n');
    }

    function findObjectEnd(source, startIndex) {
        let depth = 0;
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inTemplateLiteral = false;
        let isEscaped = false;

        for (let index = startIndex; index < source.length; index += 1) {
            const char = source[index];

            if (isEscaped) {
                isEscaped = false;
                continue;
            }

            if ((inSingleQuote || inDoubleQuote || inTemplateLiteral) && char === '\\') {
                isEscaped = true;
                continue;
            }

            if (inSingleQuote) {
                if (char === '\'') {
                    inSingleQuote = false;
                }
                continue;
            }

            if (inDoubleQuote) {
                if (char === '"') {
                    inDoubleQuote = false;
                }
                continue;
            }

            if (inTemplateLiteral) {
                if (char === '`') {
                    inTemplateLiteral = false;
                }
                continue;
            }

            if (char === '\'') {
                inSingleQuote = true;
                continue;
            }

            if (char === '"') {
                inDoubleQuote = true;
                continue;
            }

            if (char === '`') {
                inTemplateLiteral = true;
                continue;
            }

            if (char === '{') {
                depth += 1;
                continue;
            }

            if (char === '}') {
                depth -= 1;

                if (depth === 0) {
                    return index;
                }
            }
        }

        return -1;
    }

    function extractVideoConfigBlock(source) {
        const markers = [
            "'LMS.Learning.Lesson.Courseware.Video'",
            '"LMS.Learning.Lesson.Courseware.Video"',
            'LMS.Learning.Lesson.Courseware.Video'
        ];

        for (const marker of markers) {
            const markerIndex = source.indexOf(marker);

            if (markerIndex === -1) {
                continue;
            }

            const objectStart = source.indexOf('{', markerIndex);

            if (objectStart === -1) {
                continue;
            }

            const objectEnd = findObjectEnd(source, objectStart);

            if (objectEnd !== -1) {
                return source.slice(objectStart, objectEnd + 1);
            }
        }

        return '';
    }

    function findValue(patterns, source) {
        for (const pattern of patterns) {
            const match = source.match(pattern);

            if (match && typeof match[1] === 'string') {
                return match[1].trim();
            }
        }

        return '';
    }

    function extractPayload() {
        const scriptSource = getInlineScriptSource();
        const videoConfigBlock = extractVideoConfigBlock(scriptSource);
        const primarySource = videoConfigBlock || scriptSource;

        const payload = {
            courseSiteId: getQueryValue('courseSiteId') || findValue([/courseSiteId:\s*["']?([^"',\s}]+)/], primarySource),
            courseResultId: findValue([/courseResultId:\s*["']([^"']+)["']/], primarySource),
            'options[scheduleId]': findValue([/scheduleId:\s*["']([^"']*)["']/], primarySource),
            'options[courseId]': findValue([/courseId:\s*["']([^"']*)["']/], primarySource),
            'options[classroomId]': findValue([/classroomId:\s*["']([^"']*)["']/], primarySource),
            'options[contentSharingId]': findValue([/contentSharingId:\s*["']([^"']*)["']/], primarySource),
            'options[trainingModuleId]': findValue([/trainingModuleId:\s*["']([^"']*)["']/], primarySource),
            site: getQueryValue('site') || findValue([/\bsite:\s*["']?([^"',\s}]+)/], scriptSource),
            securityToken: findValue([/securityToken:\s*["']([^"']+)["']/], scriptSource)
        };

        const missingFields = [];

        if (!payload.courseSiteId) {
            missingFields.push('courseSiteId');
        }

        if (!payload.courseResultId) {
            missingFields.push('courseResultId');
        }

        if (!payload.site) {
            missingFields.push('site');
        }

        if (!payload.securityToken) {
            missingFields.push('securityToken');
        }

        return { payload, missingFields };
    }

    function createRequestBody(payload) {
        const params = new URLSearchParams();

        Object.entries(payload).forEach(([key, value]) => {
            params.set(key, value == null ? '' : String(value));
        });

        return params;
    }

    async function parseResponse(response) {
        const rawText = await response.text();
        let data = null;

        try {
            data = rawText ? JSON.parse(rawText) : null;
        } catch (error) {
            data = null;
        }

        return { rawText, data };
    }

    function getErrorMessage(response, data, rawText) {
        if (data && typeof data === 'object') {
            const parts = [];

            if (data.status) {
                parts.push(`status=${data.status}`);
            }

            if (typeof data.percent !== 'undefined') {
                parts.push(`percent=${data.percent}`);
            }

            if (data.message) {
                parts.push(data.message);
            }

            if (data.error) {
                parts.push(data.error);
            }

            if (parts.length > 0) {
                return parts.join(' | ');
            }
        }

        const trimmedText = (rawText || '').trim();
        return trimmedText
            ? `HTTP ${response.status}: ${trimmedText.slice(0, 220)}`
            : `HTTP ${response.status}: ${response.statusText || 'Yêu cầu thất bại.'}`;
    }

    async function submitCompletion(payload) {
        const response = await fetch(COMPLETE_ENDPOINT, {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: '*/*',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: createRequestBody(payload).toString()
        });

        const { rawText, data } = await parseResponse(response);

        if (!response.ok) {
            return {
                ok: false,
                message: getErrorMessage(response, data, rawText),
                data
            };
        }

        if (data && data.status === 'SUCCESS' && Number(data.percent) === 100) {
            return {
                ok: true,
                data
            };
        }

        return {
            ok: false,
            message: getErrorMessage(response, data, rawText || 'Phản hồi không đúng định dạng mong đợi.'),
            data
        };
    }

    function getUiElements() {
        return {
            root: document.getElementById(UI_ID),
            button: document.getElementById(BUTTON_ID),
            status: document.getElementById(STATUS_ID)
        };
    }

    function setStatus(message, statusType) {
        const { root, status } = getUiElements();

        if (!status) {
            return;
        }

        status.textContent = message;
        status.dataset.state = statusType;

        if (root) {
            root.dataset.state = statusType;
        }
    }

    function setButtonState(label, disabled) {
        const { button } = getUiElements();

        if (!button) {
            return;
        }

        button.textContent = label;
        button.disabled = disabled;
    }

    async function runProcess() {
        if (state.isRunning) {
            return;
        }

        const { payload, missingFields } = extractPayload();

        if (missingFields.length > 0) {
            setStatus(`Không đủ dữ liệu để gửi request: ${missingFields.join(', ')}`, 'error');
            return;
        }

        state.isRunning = true;
        setButtonState('Đang chạy...', true);
        setStatus('Đang gửi yêu cầu hoàn tất video...', 'running');

        try {
            const result = await submitCompletion(payload);

            if (result.ok) {
                setStatus('Đã xong. Server trả về status=SUCCESS và percent=100.', 'success');
                setButtonState('Chạy lại', false);
                return;
            }

            setStatus(`Lỗi: ${result.message}`, 'error');
            setButtonState('Thử lại', false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Không gửi được request.';
            setStatus(`Lỗi: ${message}`, 'error');
            setButtonState('Thử lại', false);
        } finally {
            state.isRunning = false;
        }
    }

    function attachHandlers(root) {
        const button = root.querySelector(`#${BUTTON_ID}`);

        if (!button) {
            return;
        }

        button.addEventListener('click', runProcess);
    }

    function createUi() {
        const existing = document.getElementById(UI_ID);

        if (existing) {
            existing.style.setProperty('display', 'grid', 'important');
            existing.style.setProperty('visibility', 'visible', 'important');
            existing.style.setProperty('opacity', '1', 'important');
            existing.style.setProperty('pointer-events', 'auto', 'important');
            return;
        }

        const container = document.createElement('div');

        container.id = UI_ID;
        container.className = 'k12ext-floating-panel';
        container.dataset.state = 'idle';
        container.innerHTML = [
            '<div class="k12ext-heading">K12 Video Runner</div>',
            '<div class="k12ext-subheading">Nút luôn hiển thị để gửi tiến trình video.</div>',
            `<button type="button" id="${BUTTON_ID}" class="k12ext-button">Chạy tiến trình</button>`,
            `<div id="${STATUS_ID}" class="k12ext-status" data-state="idle">Sẵn sàng gửi yêu cầu hoàn tất video.</div>`
        ].join('');

        document.body.appendChild(container);

        attachHandlers(container);
    }

    function removeUi() {
        const root = document.getElementById(UI_ID);

        if (root) {
            root.remove();
        }
    }

    function ensureUi() {
        if (!isVideoPageUrl()) {
            state.confirmedVideoPage = false;
            state.confirmedUrl = '';
            removeUi();
            stopGuard();
            return;
        }

        if (detectVideoPage()) {
            createUi();
            startGuard();
        }
    }

    function startGuard() {
        if (state.guardTimer) {
            return;
        }

        state.guardTimer = setInterval(() => {
            if (!isVideoPageUrl()) {
                stopGuard();
                return;
            }

            if (!state.confirmedVideoPage) {
                return;
            }

            const el = document.getElementById(UI_ID);

            if (!el) {
                createUi();
                return;
            }

            el.style.setProperty('display', 'grid', 'important');
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.setProperty('opacity', '1', 'important');
            el.style.setProperty('pointer-events', 'auto', 'important');
        }, GUARD_INTERVAL_MS);
    }

    function stopGuard() {
        if (state.guardTimer) {
            clearInterval(state.guardTimer);
            state.guardTimer = null;
        }
    }

    function scheduleEnsureUi() {
        window.requestAnimationFrame(() => {
            ensureUi();
        });
    }

    function patchHistory() {
        if (state.historyPatched) {
            return;
        }

        const methods = ['pushState', 'replaceState'];

        methods.forEach((methodName) => {
            const original = history[methodName];

            if (typeof original !== 'function') {
                return;
            }

            history[methodName] = function patchedHistory(...args) {
                const result = original.apply(this, args);
                scheduleEnsureUi();
                return result;
            };
        });

        window.addEventListener('popstate', scheduleEnsureUi);
        window.addEventListener('hashchange', scheduleEnsureUi);

        state.historyPatched = true;
    }

    function observeDomChanges() {
        if (state.observer) {
            return;
        }

        let queued = false;
        state.observer = new MutationObserver(() => {
            if (queued) {
                return;
            }

            queued = true;
            window.requestAnimationFrame(() => {
                queued = false;
                ensureUi();
            });
        });

        state.observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message.action === 'getStatus') {
                sendResponse({
                    isVideoPage: state.confirmedVideoPage || detectVideoPage(),
                    isRunning: state.isRunning,
                    uiPresent: Boolean(document.getElementById(UI_ID))
                });
                return true;
            }

            if (message.action === 'runProcess') {
                if (isVideoPageUrl()) {
                    state.confirmedVideoPage = true;
                    state.confirmedUrl = location.href;
                }

                createUi();
                startGuard();
                runProcessFromPopup(sendResponse);
                return true;
            }

            return false;
        });
    }

    async function runProcessFromPopup(sendResponse) {
        if (state.isRunning) {
            sendResponse({ ok: false, message: 'Đang chạy, vui lòng đợi...' });
            return;
        }

        const { payload, missingFields } = extractPayload();

        if (missingFields.length > 0) {
            sendResponse({
                ok: false,
                message: `Không đủ dữ liệu: ${missingFields.join(', ')}`
            });
            return;
        }

        state.isRunning = true;
        setButtonState('Đang chạy...', true);
        setStatus('Đang gửi yêu cầu hoàn tất video...', 'running');

        try {
            const result = await submitCompletion(payload);

            if (result.ok) {
                setStatus('Đã xong. Server trả về status=SUCCESS và percent=100.', 'success');
                setButtonState('Chạy lại', false);
                sendResponse({ ok: true, message: 'Thành công! status=SUCCESS, percent=100' });
            } else {
                setStatus(`Lỗi: ${result.message}`, 'error');
                setButtonState('Thử lại', false);
                sendResponse({ ok: false, message: result.message });
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Không gửi được request.';
            setStatus(`Lỗi: ${msg}`, 'error');
            setButtonState('Thử lại', false);
            sendResponse({ ok: false, message: msg });
        } finally {
            state.isRunning = false;
        }
    }

    function init() {
        patchHistory();
        observeDomChanges();
        setupMessageListener();
        ensureUi();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();