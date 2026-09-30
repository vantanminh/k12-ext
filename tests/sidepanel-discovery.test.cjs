const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

class Element {
    constructor(id = '') {
        this.id = id;
        this.children = [];
        this.listeners = {};
        this.value = '';
        this.textContent = '';
        this.checked = false;
        this.disabled = false;
        this.hidden = false;
        this.className = '';
        this.dataset = {};
        this.style = {};
        this.classList = { toggle: () => {} };
        this.parts = {};
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute() {}
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    add(child) { this.children.push(child); }
    querySelector(selector) {
        if (!this.parts[selector]) this.parts[selector] = new Element(selector);
        return this.parts[selector];
    }
}

const SESSION = { server: 'https://k12-ai-server-production.up.railway.app', email: 'a@b.vn', token: 't' };

function createPanel(activeUrl, session = SESSION) {
    const html = readFileSync(join(__dirname, '../chrome-extension/sidepanel.html'), 'utf8');
    const elements = new Map(Array.from(html.matchAll(/\bid="([^"]+)"/g), match => [match[1], new Element(match[1])]));
    let onReady;
    const document = {
        addEventListener(name, callback) { if (name === 'DOMContentLoaded') onReady = callback; },
        getElementById(id) { return elements.get(id) || null; },
        createElement() { return new Element(); },
        createTextNode(text) { const node = new Element(); node.textContent = text; return node; }
    };
    const messages = [];
    const tabMessages = [];
    const candidate = { key: 'lesson-1', title: 'HÓA 12.7', subject: 'Hóa học', progress: '0%',
        lessonId: 'lesson-1', href: 'https://hcm.k12online.vn/courseware', coursewareId: 'exercise-1' };
    const chrome = {
        runtime: {
            id: 'test-extension',
            getManifest: () => ({ version: '1.6.2' }),
            onMessage: { addListener() {} },
            async sendMessage(message) {
                messages.push(message);
                if (message.action === 'discoverAllLessons') return { ok: true, lessons: [candidate], message: '48 bài học tìm thấy từ các danh sách K12.' };
                if (message.action === 'getCandidateExercises') {
                    return { ok: true, candidates: [{ title: 'Tài liệu mở đầu', coursewareType: 'Courseware.PDF', progress: '0%' }] };
                }
                return { ok: true };
            }
        },
        tabs: {
            async query() { return [{ id: 7, url: activeUrl, title: 'Bài giảng học tự do' }]; },
            async sendMessage(_tabId, message) { tabMessages.push(message); return { ok: true, lessons: [candidate], message: '1 bài học tìm thấy trên trang.' }; },
            onActivated: { addListener() {} },
            onUpdated: { addListener() {} }
        },
        storage: {
            local: { async get(defaults) { return { ...defaults, k12AuthSession: session }; }, async set() {} },
            onChanged: { addListener() {} }
        }
    };
    const scope = { document, chrome, URL, URLSearchParams,
        Option: class extends Element { constructor(text, value) { super(); this.textContent = text; this.value = value; } } };
    vm.createContext(scope);
    vm.runInContext(readFileSync(join(__dirname, '../chrome-extension/ai-common.js'), 'utf8'), scope);
    vm.runInContext(readFileSync(join(__dirname, '../chrome-extension/lesson-workflow.js'), 'utf8'), scope);
    vm.runInContext(`${readFileSync(join(__dirname, '../chrome-extension/sidepanel.js'), 'utf8')}\nglobalThis.previewSelected = previewSelectedWorkflow; globalThis.selectCandidateForPreview = () => state.selected.add('lesson-1');`, scope);
    return { elements, messages, tabMessages, scope, ready: onReady };
}

test('opening the free-learning homepage automatically discovers every lesson page', async () => {
    const panel = createPanel('https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?site=2003644');
    await panel.ready();
    assert.deepEqual(panel.messages.map(message => message.action), ['discoverAllLessons']);
    assert.equal(panel.messages[0].tabId, 7);
    assert.equal(panel.elements.get('lesson-list').children.length, 1);
    assert.match(panel.elements.get('scan-status').textContent, /48 bài học/);
});

test('opening a courseware page reads only its current lesson', async () => {
    const panel = createPanel('https://hcm.k12online.vn/79000729/page/LMS/Lesson/Courseware/learn/lesson-1');
    await panel.ready();
    assert.deepEqual(panel.messages, []);
    assert.deepEqual(panel.tabMessages.map(message => message.action), ['getLessonCandidates']);
});

test('workflow preview reads content metadata without sending a K12 write', async () => {
    const panel = createPanel('https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?site=2003644');
    await panel.ready();
    panel.scope.selectCandidateForPreview();
    await panel.scope.previewSelected();
    assert.deepEqual(panel.messages.map(message => message.action), ['discoverAllLessons', 'getCandidateExercises']);
    assert.deepEqual(panel.tabMessages.map(message => message.action), []);
    assert.match(panel.elements.get('bulk-status').textContent, /Không gửi yêu cầu/);
});

test('signed-out users only see the login gate and nothing is scanned', async () => {
    const panel = createPanel('https://hcm.k12online.vn/79000729/page/LMS/Lesson/Student/teacherList?site=2003644', null);
    await panel.ready();
    assert.equal(panel.elements.get('auth-gate').hidden, false);
    assert.equal(panel.elements.get('app-main').hidden, true);
    assert.equal(panel.elements.get('app-tabs').hidden, true);
    assert.deepEqual(panel.messages, []);
    assert.deepEqual(panel.tabMessages, []);
});
