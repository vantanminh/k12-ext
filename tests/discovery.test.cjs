const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const common = readFileSync(join(__dirname, '../chrome-extension/ai-common.js'), 'utf8');
const worker = readFileSync(join(__dirname, '../chrome-extension/service-worker.js'), 'utf8');

function harness({ failPage = 0, listUrl = 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?site=2003644' } = {}) {
    const removed = [];
    const created = [];
    const pageCalls = [];
    const scope = { URL, setTimeout, chrome: {
        sidePanel: { setPanelBehavior: async () => {} },
        runtime: { onMessage: { addListener: () => {} } },
        tabs: {
            create: async options => { created.push(options); return { id: 2 }; },
            get: async () => ({ status: 'complete', url: listUrl }),
            remove: async id => { removed.push(id); },
            sendMessage: async (id, message) => {
                if (message.action === 'getLessonListUrls') return { urls: [listUrl] };
                if (message.action === 'getLessonCandidates') return { ok: true, lessons: [{ key: 'a' }] };
                pageCalls.push(message.page);
                if (message.page === failPage) return { ok: false, message: 'timeout' };
                return { ok: true, advanced: message.page < 4, lessons: [{ key: message.page === 2 ? 'b' : 'c' }, { key: 'a' }] };
            }
        }
    } };
    scope.importScripts = () => vm.runInContext(common, scope);
    vm.createContext(scope);
    vm.runInContext(worker + '\nglobalThis.scan = discoverLessons;', scope);
    return { scope, removed, created, pageCalls };
}

test('homepage discovery traverses pages, deduplicates lessons and closes only its own tab', async () => {
    const h = harness();
    const result = await h.scope.scan(1);
    assert.equal(result.ok, true);
    assert.deepEqual(Array.from(result.lessons, c => c.key), ['a', 'b', 'c']);
    assert.deepEqual(h.pageCalls, [2, 3, 4]);
    assert.equal(h.created[0].active, false);
    assert.deepEqual(h.removed, [2]);
});
test('pagination error reports an incomplete scan and retains detected lessons', async () => {
    const h = harness({ failPage: 3 });
    const result = await h.scope.scan(1);
    assert.equal(result.ok, false);
    assert.equal(result.lessons.length, 2);
    assert.match(result.message, /chưa đầy đủ/);
    assert.deepEqual(h.removed, [2]);
});
test('reported total of 48 requires all three pages and preserves incomplete scan errors', async () => {
    const h = harness();
    h.scope.chrome.tabs.sendMessage = async (_id, message) => {
        if (message.action === 'getLessonListUrls') return { urls: [h.created[0]?.url || 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?site=2003644'] };
        const page = message.action === 'getLessonCandidates' ? 1 : message.page;
        const length = page === 3 ? 8 : 20;
        return { ok: true, advanced: true, pagination: { total: 48, pages: 3 },
            lessons: Array.from({ length }, (_, i) => ({ key: `${page}:${i}`, title: `Lesson ${page}:${i}`, progress: '0%' })) };
    };
    const result = await h.scope.scan(1);
    assert.equal(result.ok, true);
    assert.equal(result.lessons.length, 48);
    h.scope.chrome.tabs.sendMessage = async (_id, message) => {
        if (message.action === 'getLessonListUrls') return { urls: [h.created[0].url] };
        if (message.action === 'advanceLessonPage') return { ok: true, advanced: false };
        return { ok: true, lessons: [{ key: 'only' }], pagination: { total: 48, pages: 3 } };
    };
    const failed = await h.scope.scan(1);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /3 trang/);
});

test('unhydrated listing reads native table cells before column indexes are assigned', () => {
    const { parseHTML } = require('linkedom');
    const href = 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?site=2003644';
    const { document } = parseHTML(`<html><body><table><tr data-type="Lesson" data-id="6ab7e04a1d5332cbc90330b7"><td>6</td><td><button>Vào học</button></td><td><img></td><td><button>HÓA 12.4</button><p>Môn học: Hóa học</p><p>Giáo viên: Example</p></td><td><a href="/79000729/page/LMS/Lesson/Student/listExercise/6ab7e04a1d5332cbc90330b7">Bài tập</a></td><td>100%</td></tr></table></body></html>`);
    const script = readFileSync(join(__dirname, '../chrome-extension/content.js'), 'utf8')
        .replace(/    if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\)\(\);\s*$/, '    globalThis.candidates = getLessonCandidates;\n})();');
    const scope = { document, URL, URLSearchParams, location: new URL(href) };
    vm.runInNewContext(script, scope);
    const [result] = scope.candidates();
    assert.equal(result.title, 'HÓA 12.4');
    assert.equal(result.progress, '100%');
    assert.equal(result.subject, 'Hóa học');
    assert.equal(scope.candidates().length, 1);
});
test('the study list is scanned as Học tập and is not rewritten to free learning', async () => {
    const listUrl = 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/list?site=2003644';
    const h = harness({ listUrl });
    const result = await h.scope.scan(1);
    assert.equal(result.ok, true, result.message);
    assert.equal(h.created[0].url, listUrl);
    assert.deepEqual(Array.from(result.lessons, c => c.key), ['a', 'b', 'c']);
});

test('home keeps lesson cards and opens both Học tập and Bài giảng tự do', async () => {
    const home = 'https://hcm.k12online.vn/79000729/';
    const study = 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/list?site=2003644';
    const free = 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?site=2003644';
    const h = harness({ listUrl: home });
    const opened = [];
    h.scope.chrome.tabs.create = async options => { opened.push(options.url); return { id: 2 }; };
    h.scope.chrome.tabs.update = async (_id, options) => { opened.push(options.url); };
    h.scope.chrome.tabs.get = async () => ({ status: 'complete', url: opened.at(-1) || home });
    h.scope.chrome.tabs.sendMessage = async (id, message) => {
        if (message.action === 'getLessonListUrls') return { urls: [study, free] };
        if (message.action === 'getLessonCandidates' && id === 1) return { ok: true, lessons: [{ key: 'card' }] };
        if (message.action === 'getLessonCandidates') {
            const key = opened.at(-1) === study ? 'study' : 'free';
            return { ok: true, lessons: [{ key }], pagination: { pages: 1, total: 1 } };
        }
        return { ok: true, advanced: false };
    };
    const result = await h.scope.scan(1);
    assert.equal(result.ok, true, result.message);
    assert.deepEqual(opened, [study, free]);
    assert.deepEqual(Array.from(result.lessons, c => c.key).sort(), ['card', 'free', 'study']);
});

test('home links to Học tập and Bài giảng tự do are kept as separate lists', () => {
    const { parseHTML } = require('linkedom');
    const home = 'https://hcm.k12online.vn/79000729/';
    const { document } = parseHTML(`<html><body>
        <a href="/79000729/">Trang chủ</a>
        <a href="/79000729/page/LMS/Lesson/Student/list?site=2003644">Học tập</a>
        <a href="/79000729/page/LMS/Lesson/Student/teacherList?site=2003644">Bài giảng tự do</a>
        <a href="/79000729/page/LMS/Lesson/Student/listExercise/6ab7e04a1d5332cbc90330b7">Bài tập</a>
        <a href="https://evil.test/79000729/page/LMS/Lesson/Student/list">Ngoài</a>
    </body></html>`);
    const script = readFileSync(join(__dirname, '../chrome-extension/content.js'), 'utf8')
        .replace(/    if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\)\(\);\s*$/, '    globalThis.collectLessonListUrls = collectLessonListUrls;\n})();');
    const scope = { document, URL, URLSearchParams, location: new URL(home) };
    vm.createContext(scope);
    vm.runInContext(common, scope);
    vm.runInContext(script, scope);
    const paths = Array.from(scope.collectLessonListUrls(), href => new URL(href).pathname).sort();
    assert.deepEqual(paths, [
        '/79000729/page/LMS/Lesson/Student/list',
        '/79000729/page/LMS/Lesson/Student/teacherList'
    ]);
});

test('the Học tập page scans itself instead of switching to free learning', () => {
    const { parseHTML } = require('linkedom');
    const study = 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/list?site=2003644';
    const { document } = parseHTML('<html><body><a href="/79000729/page/LMS/Lesson/Student/teacherList?site=2003644">Bài giảng tự do</a></body></html>');
    const script = readFileSync(join(__dirname, '../chrome-extension/content.js'), 'utf8')
        .replace(/    if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\)\(\);\s*$/, '    globalThis.collectLessonListUrls = collectLessonListUrls;\n})();');
    const scope = { document, URL, URLSearchParams, location: new URL(study) };
    vm.createContext(scope);
    vm.runInContext(common, scope);
    vm.runInContext(script, scope);
    const paths = Array.from(scope.collectLessonListUrls(), href => new URL(href).pathname).sort();
    assert.deepEqual(paths, [
        '/79000729/page/LMS/Lesson/Student/list',
        '/79000729/page/LMS/Lesson/Student/teacherList'
    ]);
});

test('unrelated URLs do not cause background navigation', async () => {
    const h = harness({ listUrl: 'https://example.com/79000729/page/LMS/Lesson/Student/teacherList' });
    const result = await h.scope.scan(1);
    assert.equal(result.lessons.length, 0);
    assert.equal(h.created.length, 0);
});

test('hidden native courseware anchors retain their ID and Exercise type', () => {
    const { parseHTML } = require('linkedom');
    const href = 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Courseware/learn/6ab7e04a1d5332cbc90330b7?coursewareId=6ab7e04a1d5332cbc90330ba&site=2003644';
    const { document } = parseHTML(`<ul class="ui-fancytree-source" hidden><li><a data-id="6ab7e04a1d5332cbc90330ba" data-type="Courseware.Exercise" href="${href}">BT12.4</a></li></ul>`);
    const script = readFileSync(join(__dirname, '../chrome-extension/content.js'), 'utf8')
        .replace(/    if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\)\(\);\s*$/, '    globalThis.candidate = getLessonCandidate;\n})();');
    const scope = { document, URL, URLSearchParams, location: { href, origin: 'https://hcm.k12online.vn' } };
    vm.runInNewContext(script, scope);
    const result = scope.candidate(document.querySelector('a'));
    assert.equal(result.coursewareId, '6ab7e04a1d5332cbc90330ba');
    assert.equal(result.coursewareType, 'Courseware.Exercise');
    assert.equal(result.title, 'BT12.4');
});

test('a lesson opening on a PDF still discovers sibling exercises and excludes other lessons', async () => {
    const h = harness();
    const lessonId = '6ab7e04a1d5332cbc90330b7';
    const href = `https://hcm.k12online.vn/79000729/page/LMS/Lesson/Courseware/learn/${lessonId}?coursewareId=6ab7e04a1d5332cbc90330b9&site=2003644`;
    const document = { lessonId, coursewareId: '6ab7e04a1d5332cbc90330b9', coursewareType: 'Courseware.PDF', href };
    const exercise = { lessonId, coursewareId: '6ab7e04a1d5332cbc90330ba', coursewareType: 'Courseware.Exercise', href: href.replace('30b9', '30ba') };
    h.scope.chrome.tabs.get = async () => ({ status: 'complete', url: href });
    h.scope.chrome.tabs.sendMessage = async () => ({ ok: true, lessons: [document, exercise, exercise, { lessonId: 'other', coursewareId: 'other' }] });
    vm.runInContext('globalThis.expand = candidateExercises;', h.scope);
    const result = await h.scope.expand(document, 1);
    assert.equal(result.ok, true);
    assert.deepEqual(Array.from(result.candidates, c => c.coursewareId), [document.coursewareId, exercise.coursewareId]);
    assert.equal(h.created.length, 1);
    assert.deepEqual(h.removed, [2]);
});

test('an explicitly selected Exercise stays limited to that exercise', async () => {
    const h = harness();
    const candidate = { coursewareId: '6ab7e04a1d5332cbc90330ba', coursewareType: 'Courseware.Exercise', href: 'https://hcm.k12online.vn/79000729/page/LMS/Lesson/Courseware/learn/6ab7e04a1d5332cbc90330b7?coursewareId=6ab7e04a1d5332cbc90330ba' };
    vm.runInContext('globalThis.expand = candidateExercises;', h.scope);
    const result = await h.scope.expand(candidate, 1);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0], candidate);
    assert.equal(h.created.length, 0);
});

test('current courseware keeps its sidebar position so prerequisites run in K12 order', () => {
    const { parseHTML } = require('linkedom');
    const lesson = '6ab7e04a1d5332cbc90330b7';
    const base = `https://hcm.k12online.vn/79000729/page/LMS/Lesson/Courseware/learn/${lesson}`;
    const link = (id, type) => `<li><a data-id="${id}" data-type="${type}" href="${base}?coursewareId=${id}&site=2003644">${id}</a></li>`;
    const href = `${base}?coursewareId=vid1&site=2003644`;
    const { document } = parseHTML(`<html><body><ul>${link('pdf1', 'Courseware.PDF')}${link('vid1', 'Courseware.Video')}${link('ex1', 'Courseware.Exercise')}</ul></body></html>`);
    const script = readFileSync(join(__dirname, '../chrome-extension/content.js'), 'utf8')
        .replace(/    if \(document\.readyState === 'loading'\) \{[\s\S]*?\n\}\)\(\);\s*$/, '    globalThis.candidates = getLessonCandidates;\n})();');
    const scope = { document, URL, URLSearchParams, location: new URL(href) };
    document.scripts = [];
    vm.runInNewContext(script, scope);
    assert.deepEqual(Array.from(scope.candidates(), c => c.coursewareId), ['pdf1', 'vid1', 'ex1']);
});
