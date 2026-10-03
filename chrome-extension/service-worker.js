chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
importScripts('ai-common.js');

let recordingWrite = Promise.resolve();
let scanning = false;
const k12Origin = 'https://hcm.k12online.vn';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function readyTab(tabId, action, extra = {}, expectedHref = '') {
    let previous = '';
    let stable = 0;
    for (let attempt = 0; attempt < 60; attempt += 1) {
        try {
            const tab = await chrome.tabs.get(tabId);
            const url = new URL(tab.url);
            if (tab.status === 'complete' && url.origin === k12Origin && (!expectedHref || url.pathname === new URL(expectedHref).pathname)) {
                const data = await chrome.tabs.sendMessage(tabId, { action, ...extra });
                if (action !== 'getLessonCandidates') return data;
                const signature = JSON.stringify([data?.lessons, data?.pagination]);
                stable = signature === previous ? stable + 1 : 0;
                previous = signature;
                if (data?.ready !== false && stable >= 2) return data;
            }
        } catch (_) {}
        await delay(250);
    }
    throw new Error('Trang K12 chưa sẵn sàng hoặc phiên đăng nhập đã hết hạn.');
}

async function discoverLessons(tabId) {
    if (scanning) throw new Error('Đang quét bài học.');
    scanning = true;
    let scanTab;
    try {
        const links = await chrome.tabs.sendMessage(tabId, { action: 'getLessonListUrls' });
        if (!links?.urls?.length) throw new Error('Không tìm thấy liên kết Bài giảng trên trang K12 hiện tại.');
        const lessons = new Map();
        const errors = [];
        for (const href of links.urls) {
            const url = new URL(href);
            if (url.origin !== k12Origin || !/\/LMS\/Lesson\/Student\/(list|teacherList)$/i.test(url.pathname)) continue;
            if (!scanTab) scanTab = await chrome.tabs.create({ url: url.href, active: false });
            else await chrome.tabs.update(scanTab.id, { url: url.href });
            try {
                let data = await readyTab(scanTab.id, 'getLessonCandidates', {}, url.href);
                if (!data?.ok) throw new Error(data?.message || 'Không đọc được danh sách.');
                (data.lessons || []).forEach(c => lessons.set(c.key, c));
                const expectedPages = data.pagination?.pages || 0;
                for (let page = 2; page <= (expectedPages || 200); page += 1) {
                    const next = await chrome.tabs.sendMessage(scanTab.id, { action: 'advanceLessonPage', page });
                    if (!next?.ok) throw new Error(next?.message || 'Không đọc được trang tiếp theo.');
                    if (!next.advanced) {
                        if (expectedPages >= page) throw new Error(`K12 báo ${expectedPages} trang nhưng chưa mở được trang ${page}.`);
                        break;
                    }
                    (next.lessons || []).forEach(c => lessons.set(c.key, c));
                    if (page === 200) throw new Error('Danh sách vượt quá giới hạn 200 trang.');
                }
                if (data.pagination?.total && lessons.size < data.pagination.total) throw new Error(`K12 có ${data.pagination.total} bài nhưng mới đọc được ${lessons.size} bài.`);
            } catch (error) { errors.push(error.message); }
        }
        return { ok: errors.length === 0, lessons: Array.from(lessons.values()),
            message: `${lessons.size} bài học tìm thấy từ các danh sách K12.${errors.length ? ' Quét chưa đầy đủ: ' + errors.join(' ') : ''}` };
    } finally {
        scanning = false;
        if (scanTab) await chrome.tabs.remove(scanTab.id).catch(() => {});
    }
}

async function readCandidateExercise(candidate) {
    const url = new URL(candidate.exerciseListHref);
    if (url.origin !== k12Origin || !/\/LMS\/Lesson\/Student\/listExercise\//i.test(url.pathname)) {
        throw new Error('Bài này chưa có liên kết bài tập được xác minh.');
    }
    const tab = await chrome.tabs.create({ url: url.href, active: false });
    try { return await readyTab(tab.id, 'readExercise'); }
    finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
}

function coursewareUrl(href) {
    const url = new URL(href);
    if (url.origin !== k12Origin || !/^\/\d+\/page\/LMS\/Lesson\/(?:Courseware\/)?learn\/[a-f0-9]{24}$/i.test(url.pathname)) {
        throw new Error('Liên kết bài học không hợp lệ.');
    }
    return url;
}

async function candidateExercises(candidate, sourceTabId) {
    let href = candidate.href;
    if (candidate.requiresLessonLink) {
        const resolved = await chrome.tabs.sendMessage(sourceTabId, { action: 'resolveExerciseLesson', candidate });
        if (!resolved?.ok) throw new Error(resolved?.message || 'Không mở được bài học.');
        href = resolved.href;
    }
    const url = coursewareUrl(href);
    // Lesson launch links often point to the introductory PDF. Inspect its
    // sidebar to find sibling exercises instead of treating that PDF as the task.
    if (candidate.coursewareId && candidate.coursewareType === 'Courseware.Exercise' && !candidate.requiresLessonLink) {
        return { ok: true, candidates: [candidate] };
    }
    const tab = await chrome.tabs.create({ url: url.href, active: false });
    try {
        const read = await readyTab(tab.id, 'getLessonCandidates');
        if (!read?.ok) throw new Error(read?.message || 'Không đọc được các nội dung trong bài học.');
        const seen = new Set();
        const lessonId = url.pathname.split('/').pop();
        const candidates = read.lessons.filter(c => c.lessonId === lessonId && c.coursewareId && !seen.has(c.coursewareId) && seen.add(c.coursewareId));
        if (!candidates.length) throw new Error('Không tìm thấy nội dung bài học.');
        return { ok: true, candidates };
    } finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
}

async function prepareCandidate(candidate) {
    const url = coursewareUrl(candidate.href);
    const tab = await chrome.tabs.create({ url: url.href, active: false });
    try {
        const read = await readyTab(tab.id, 'prepareExercise');
        if (!read?.ok) { await chrome.tabs.remove(tab.id).catch(() => {}); return read; }
        const { k12ExerciseTabs = [] } = await chrome.storage.session.get('k12ExerciseTabs');
        await chrome.storage.session.set({ k12ExerciseTabs: [...k12ExerciseTabs, tab.id] });
        return { ...read, tabId: tab.id };
    } catch (error) { await chrome.tabs.remove(tab.id).catch(() => {}); throw error; }
}

async function releaseExerciseTab(tabId) {
    const { k12ExerciseTabs = [] } = await chrome.storage.session.get('k12ExerciseTabs');
    if (!k12ExerciseTabs.includes(tabId)) return;
    await chrome.storage.session.set({ k12ExerciseTabs: k12ExerciseTabs.filter(id => id !== tabId) });
    await chrome.tabs.remove(tabId).catch(() => {});
}

// Opens one content page in the background and looks for the user's own comment.
async function checkContentComment(item, profile) {
    const tab = await chrome.tabs.create({ url: coursewareUrl(item.href).href, active: false });
    try { return await readyTab(tab.id, 'findProfileComment', { profile }); }
    finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
}

async function verifyLessonComments(candidate, sourceTabId, profile, wanted) {
    const list = await candidateExercises(candidate, sourceTabId);
    const items = [];
    for (const item of list.candidates) {
        if (!wanted[item.coursewareType === 'Courseware.Exercise' || !item.coursewareType ? 'exercise' : 'material']) continue;
        let found = null;
        let message = '';
        try {
            const result = await checkContentComment(item, profile);
            if (result?.ok) found = result.found; else message = result?.message || 'Không đọc được bình luận.';
        } catch (error) { message = error.message; }
        items.push({ title: item.title || item.coursewareId, found, message });
    }
    return { ok: true, items };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
    const extensionPage = sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
    const k12Page = sender.tab?.url?.startsWith(k12Origin + '/');
    if (message.action === 'recordK12Api' && k12Page) {
        recordingWrite = recordingWrite.catch(() => {}).then(async () => {
            const s = await chrome.storage.local.get({ k12ApiRecording: false, k12ApiCaptures: [] });
            if (!s.k12ApiRecording || !K12AI.recordableApiEntry(message.entry)) return;
            const entry = K12AI.redact(message.entry);
            if (JSON.stringify(entry).length > 100000) return;
            const captures = [...s.k12ApiCaptures, entry].slice(-80);
            while (JSON.stringify(captures).length > 1500000) captures.shift();
            await chrome.storage.local.set({ k12ApiCaptures: captures });
        });
        return false;
    }
    if (!extensionPage) return false;
    if (message.action === 'getCandidateExercises' || message.action === 'prepareCandidateExercise' || message.action === 'releaseExerciseTab') {
        const task = message.action === 'getCandidateExercises' ? candidateExercises(message.candidate, message.tabId)
            : message.action === 'prepareCandidateExercise' ? prepareCandidate(message.candidate) : releaseExerciseTab(message.tabId);
        task.then(result => reply(result || { ok: true }), error => reply({ ok: false, message: error.message }));
        return true;
    }
    if (message.action === 'verifyLessonComments') {
        verifyLessonComments(message.candidate, message.tabId, message.profile, message.wanted)
            .then(reply, error => reply({ ok: false, message: error.message }));
        return true;
    }
    if (message.action === 'discoverAllLessons') {
        discoverLessons(message.tabId).then(reply, error => reply({ ok: false, message: error.message }));
        return true;
    }
    if (message.action === 'readCandidateExercise') {
        readCandidateExercise(message.candidate).then(reply, error => reply({ ok: false, message: error.message }));
        return true;
    }
    return false;
});
