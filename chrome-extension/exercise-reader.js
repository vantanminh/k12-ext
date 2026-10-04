(() => {
    // Semantic form reader. K12's submission adapter must be verified separately.
    function trueFalseForm() {
        return document.querySelector('.question-purify-item[data-type="OnlyTrueFalseNew"]')?.closest('form') || null;
    }
    // Plain multiple-choice exercise: every question is a "Choice" item with one radio group.
    function choiceForm() {
        const form = document.querySelector('.question-purify-item[data-type="Choice"]')?.closest('form');
        if (!form) return null;
        const groups = Array.from(form.querySelectorAll('li[id^="question"]'));
        if (!groups.length) return null;
        // Ignore a form that also contains another question type. Missing
        // element types mean K12 has not finished rendering the choice items.
        if (groups.some(group => group.dataset.elementType && group.dataset.elementType !== 'Choice')) return null;
        return form;
    }

    function choiceLabel(radio) {
        const label = radio.closest('label') || radio.parentElement?.querySelector('label') || radio.parentElement;
        return elementText(label?.querySelector('.choices-text, .choice-text') || label);
    }

    function collectImages(group, id, images) {
        for (const image of group.querySelectorAll('img')) {
            const source = new URL(image.getAttribute('src') || '', location.href);
            if (!['https://hcm.k12online.vn', 'https://static.k12online.vn'].includes(source.origin)) {
                throw new Error('Hình minh họa không thuộc K12.');
            }
            images.push({ id, url: K12AI.imageUrl('https://static.k12online.vn' + source.pathname) });
        }
    }

    function readChoice(form) {
        const images = [];
        const groups = Array.from(form.querySelectorAll('li[id^="question"]'));
        const questions = groups.map((group, index) => {
            const id = group.id.replace(/^question/, '');
            if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('ID câu trắc nghiệm không hợp lệ.');
            if (group.querySelector('math, canvas, iframe, input[type=checkbox]:not(.examing)')) {
                throw new Error(`Câu ${index + 1} có công thức hoặc kiểu đáp án chưa hỗ trợ.`);
            }
            const radios = Array.from(group.querySelectorAll('input[type="radio"]'));
            if (radios.length < 2 || radios.some(r => r.name !== `fields[question${id}]`)) {
                const names = [...new Set(radios.map(r => r.name))].join(', ') || 'không có';
                throw new Error(`Câu ${index + 1} có trường đáp án không đúng mẫu K12 (${radios.length} lựa chọn, tên trường: ${names}).`);
            }
            const prompt = elementText(group.querySelector(`#title${id}`) || group.querySelector('.choice-top'));
            collectImages(group, id, images);
            return { id, kind: 'single_choice', prompt: `Câu ${index + 1}. ${prompt}`,
                choices: radios.map(r => ({ id: r.value, text: choiceLabel(r) })) };
        });
        return K12AI.validateExercise({ title: document.querySelector('#module2 .panel-heading .panel-title')?.textContent || document.title,
            questions, images });
    }

    function elementText(element) {
        if (!element) return '';
        const copy = element.cloneNode(true);
        for (const hidden of copy.querySelectorAll('script, style')) hidden.remove();
        for (const table of copy.querySelectorAll('table')) {
            const text = Array.from(table.querySelectorAll('tr'), row =>
                Array.from(row.querySelectorAll('th, td'), cell => K12AI.plainText(cell.textContent)).join(' | ')).join('; ');
            table.replaceWith(document.createTextNode(` Bảng: ${text} `));
        }
        for (const block of copy.querySelectorAll('p, div, li, br')) block.after(document.createTextNode(' '));
        return K12AI.plainText(copy.textContent);
    }

    function readTrueFalse(form) {
        const questions = [];
        const images = [];
        const groups = Array.from(form.querySelectorAll('li[id^="question"][data-element-type="OnlyTrueFalseNew"]'));
        for (const [groupIndex, group] of groups.entries()) {
            const id = group.id.replace(/^question/, '');
            if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('ID câu Đúng/Sai không hợp lệ.');
            const stem = group.querySelector('.onlyTrueFalse-top');
            const rows = Array.from(group.querySelectorAll('tr.choice-tr'));
            if (!stem || rows.length !== 4) throw new Error(`Câu ${groupIndex + 1} thiếu đề hoặc bốn mệnh đề Đúng/Sai.`);
            collectImages(group, id, images);
            for (const [rowIndex, row] of rows.entries()) {
                const name = `fields[question${id}][${rowIndex + 1}]`;
                const radios = Array.from(row.querySelectorAll('input[type="radio"]'));
                if (radios.length !== 2 || radios.some(r => r.name !== name)
                    || new Set(radios.map(r => r.value)).size !== 2
                    || !radios.some(r => r.value === 'true') || !radios.some(r => r.value === 'false')) {
                    throw new Error(`Câu ${groupIndex + 1}, ý ${rowIndex + 1} có trường đáp án không đúng mẫu K12.`);
                }
                const statement = elementText(row.querySelector('td.text'));
                if (!statement) throw new Error(`Câu ${groupIndex + 1}, ý ${rowIndex + 1} thiếu nội dung.`);
                questions.push({ id: `${id}:${rowIndex + 1}`, kind: 'single_choice',
                    prompt: `Câu ${groupIndex + 1}, ý ${rowIndex + 1}. ${elementText(stem)} Phát biểu: ${statement}`,
                    choices: [{ id: 'true', text: 'Đúng' }, { id: 'false', text: 'Sai' }] });
            }
        }
        return K12AI.validateExercise({ title: document.querySelector('#module2 .panel-heading .panel-title')?.textContent || document.title,
            questions, images });
    }

    function readExercise() {
        const pdfForm = document.querySelector('.doExercise-pdf form');
        if (pdfForm) {
            const path = pdfForm.querySelector('[name="fields[filePDF]"]')?.value;
            const pdf_url = K12AI.pdfUrl(new URL(path, 'https://static.k12online.vn/').href);
            const questions = Array.from(pdfForm.querySelectorAll('li[id^="question"]')).map((group, index) => {
                const inputs = Array.from(group.querySelectorAll('input[type=radio]'));
                if (!inputs.length || group.querySelector('input[type=checkbox]')) throw new Error('Đề PDF này có kiểu câu hỏi chưa hỗ trợ.');
                const id = group.id.replace(/^question/, '');
                if (!/^[a-f0-9]{24}$/i.test(id) || inputs.some(i => i.name !== `fields[question${id}]`)) throw new Error('ID câu hỏi không khớp biểu mẫu K12.');
                return { id, kind: 'single_choice', prompt: `Câu ${index + 1} trong đề PDF đính kèm`,
                    choices: inputs.map(i => ({ id: i.value, text: K12AI.plainText(i.parentElement.querySelector('.choices-text')?.textContent) })) };
            });
            return K12AI.validateExercise({ title: document.querySelector('#module2 .panel-heading .panel-title')?.textContent || document.title, questions, pdf_url });
        }
        const tfForm = trueFalseForm();
        if (tfForm) return readTrueFalse(tfForm);
        const mcForm = choiceForm();
        if (mcForm) return readChoice(mcForm);
        const questions = [];
        for (const group of document.querySelectorAll('fieldset, [data-question-id]')) {
            // Ignore nested wrappers to avoid recording a question twice.
            if (group.querySelector('fieldset, [data-question-id]')) continue;
            const inputs = Array.from(group.querySelectorAll('input[type=radio], input[type=checkbox]'));
            const prompt = group.querySelector('legend, [data-question-title], .question-title, .question-content');
            const id = group.getAttribute('data-question-id') || group.id || inputs[0]?.name;
            if (!id || !prompt?.textContent.trim()) continue;
            if (group.querySelector('img, canvas, math, iframe')) {
                throw new Error('Câu hỏi có hình ảnh hoặc công thức chưa được đọc đầy đủ; chưa gửi đề thiếu dữ liệu tới AI.');
            }
            const textInput = group.querySelector('textarea, input[type=text]');
            if (inputs.length) {
                const types = new Set(inputs.map(input => input.type));
                if (types.size !== 1) throw new Error('Câu hỏi chứa kiểu đáp án hỗn hợp chưa hỗ trợ.');
                const choices = inputs.map(input => ({
                    id: input.value,
                    text: K12AI.plainText(Array.from(input.labels || []).map(label => label.textContent).join(' '))
                }));
                questions.push({ id, kind: inputs[0].type === 'radio' ? 'single_choice' : 'multiple_choice', prompt: K12AI.plainText(prompt.textContent), choices });
            } else if (textInput) {
                questions.push({ id, kind: 'short_text', prompt: K12AI.plainText(prompt.textContent), choices: [] });
            }
        }
        return K12AI.validateExercise({ title: document.title, questions });
    }

    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    function trueFalseReady() {
        const groups = Array.from(trueFalseForm()?.querySelectorAll('li[data-element-type="OnlyTrueFalseNew"]') || []);
        return groups.length > 0 && groups.every(group => group.querySelector('.onlyTrueFalse-top')
            && group.querySelectorAll('tr.choice-tr').length === 4);
    }
    function pdfReady() {
        const form = document.querySelector('.doExercise-pdf form');
        const groups = Array.from(form?.querySelectorAll('li[id^="question"]') || []);
        return groups.length > 0 && groups.every(group => group.querySelectorAll('input[type=radio]').length >= 2);
    }
    // K12 renders each Choice item's answers after the form itself appears.
    function choiceReady() {
        const groups = Array.from(choiceForm()?.querySelectorAll('li[id^="question"]') || []);
        return groups.length > 0 && groups.every(group => {
            const radios = Array.from(group.querySelectorAll('input[type="radio"]'));
            return radios.length >= 2 && radios.every(r => r.name === `fields[${group.id}]`);
        });
    }
    const startControl = () => Array.from(document.querySelectorAll('a[href], [onclick]')).find(el =>
        /VHV\.App\.modules\[\d+\]\.doExercise\(\)/.test((el.getAttribute('href') || '') + (el.getAttribute('onclick') || '')));
    const formOpen = () => Boolean(document.querySelector('.doExercise-pdf form') || trueFalseForm() || choiceForm());
    // K12 renders the exercise module via AJAX after page load, so wait until
    // the form, the "Làm bài" control or a known status screen appears.
    async function waitForModule() {
        const deadline = Date.now() + 15000;
        while (Date.now() < deadline) {
            if (formOpen() || document.querySelector('fieldset, [data-question-id]') || startControl()) return;
            const text = elementText(document.querySelector('#module2'));
            if (/Bạn cần hoàn thành các nội dung theo thứ tự/i.test(text)) return;
            if (Array.from(document.querySelectorAll('a, button, [onclick]')).some(element => element.textContent.trim() === 'Làm lại')) return;
            await pause(250);
        }
    }
    async function prepareExercise() {
        await waitForModule();
        const discussion = document.querySelector('a[href*="objectType="]')?.getAttribute('href');
        const hasExerciseForm = Boolean(document.querySelector('.doExercise-pdf form, fieldset, [data-question-id]') || trueFalseForm() || choiceForm());
        if (!hasExerciseForm && /Bạn cần hoàn thành các nội dung theo thứ tự/i.test(elementText(document.querySelector('#module2')))) {
            return { ok: false, prerequisiteRequired: true, message: 'K12 yêu cầu hoàn thành tài liệu/video trước khi mở bài tập. Bật đánh dấu đã xem cho môn này và dùng Chạy quy trình theo môn.' };
        }
        if (!hasExerciseForm && Array.from(document.querySelectorAll('a, button, [onclick]')).some(element => element.textContent.trim() === 'Làm lại')) {
            return { ok: false, alreadyCompleted: true, message: 'K12 đang hiển thị kết quả bài đã nộp. Không tự tạo lượt làm lại; mở bài chưa làm để thử AI.' };
        }
        const start = startControl();
        if (!hasExerciseForm && !start && discussion && new URL(discussion, location.href).searchParams.get('objectType') !== 'Courseware.Exercise') {
            return { ok: false, notExercise: true, coursewareType: new URL(discussion, location.href).searchParams.get('objectType'), message: 'Nội dung này là tài liệu hoặc video.' };
        }
        if (!hasExerciseForm) {
            if (start) {
                const moduleIndex = Number(((start.getAttribute('href') || '') + (start.getAttribute('onclick') || '')).match(/VHV\.App\.modules\[(\d+)\]\.doExercise\(\)/)[1]);
                window.postMessage({ type: 'k12-open-exercise', moduleIndex }, location.origin);
                let deadline = Date.now() + 6000;
                while (Date.now() < deadline && !formOpen()) await pause(250);
                // Retry the page-world call once. Clicking the javascript: link from this
                // content script would be blocked by the extension's CSP.
                if (!formOpen() && startControl()) window.postMessage({ type: 'k12-open-exercise', moduleIndex }, location.origin);
                deadline = Date.now() + 20000;
                while (Date.now() < deadline && !formOpen()) await pause(250);
                if (!formOpen()) throw new Error('K12 chưa mở biểu mẫu làm bài. Hãy mở bài và thử lại.');
            }
        }
        if (trueFalseForm()) {
            const deadline = Date.now() + 20000;
            while (Date.now() < deadline && !trueFalseReady()) await pause(250);
            if (!trueFalseReady()) throw new Error('K12 chưa tải đủ nội dung các câu Đúng/Sai. Hãy tải lại bài rồi thử tiếp.');
        }
        if (choiceForm()) {
            const deadline = Date.now() + 20000;
            while (Date.now() < deadline && !choiceReady()) await pause(250);
            if (!choiceReady()) throw new Error('K12 chưa tải đủ câu trắc nghiệm. Hãy tải lại bài rồi thử tiếp.');
        }
        if (document.querySelector('.doExercise-pdf form')) {
            const deadline = Date.now() + 20000;
            while (Date.now() < deadline && !pdfReady()) await pause(250);
            if (!pdfReady()) throw new Error('K12 chưa tải đủ câu hỏi của đề PDF. Hãy tải lại bài rồi thử tiếp.');
        }
        return { ok: true, exercise: readExercise(), submissionVerified: false };
    }

    let submitting = false;
    async function submitExercise(message) {
        if (submitting) throw new Error('Đang nộp bài, không gửi lại.');
        const exercise = readExercise();
        const input = K12AI.validateExercise(message.exercise);
        if (JSON.stringify(input) !== JSON.stringify(exercise)) throw new Error('Đề đã thay đổi, cần đọc và giải lại.');
        const result = K12AI.validateAnswers(exercise, message.result);
        // Submit every answer even when AI is unsure; only report which ones to review.
        const uncertain = K12AI.uncertainSummary(exercise, result);
        const note = uncertain ? ` Câu AI chưa chắc chắn: ${uncertain}` : '';
        const pdfForm = document.querySelector('.doExercise-pdf form');
        const tfForm = trueFalseForm();
        const form = pdfForm || tfForm || choiceForm();
        if (!form) throw new Error('Chỉ hỗ trợ nộp bài tập PDF, Đúng/Sai hoặc trắc nghiệm đã xác minh.');
        const type = form.querySelector('[name="options[coursewareType]"]')?.value;
        const attempt = form.querySelector('[name="id"]')?.value;
        const coursewareId = form.querySelector('[name="options[coursewareId]"]')?.value;
        if (type !== 'Courseware.Exercise' || !/^[a-f0-9]{24}$/i.test(attempt || '')) throw new Error('Không tìm thấy lượt làm bài tập hợp lệ.');
        const data = new URLSearchParams();
        for (const element of form.querySelectorAll('input[type=hidden]')) {
            if (element.name && !element.disabled) data.append(element.name, element.value);
        }
        if (!data.get('securityToken')) throw new Error('Biểu mẫu thiếu token phiên, hãy tải lại bài.');
        for (const answer of result.answers) {
            // An undecided answer has no choice; leave that question blank.
            if (!answer.choice_ids.length) continue;
            if (tfForm) {
                const match = answer.question_id.match(/^([a-f0-9]{24}):([1-4])$/i);
                if (!match) throw new Error('Mã ý Đúng/Sai không hợp lệ.');
                const field = `fields[question${match[1]}][${match[2]}]`;
                const radios = Array.from(form.querySelectorAll('input[type="radio"]')).filter(r => r.name === field);
                if (radios.length !== 2 || !radios.some(r => r.value === answer.choice_ids[0])) {
                    throw new Error('Trường nộp ý Đúng/Sai không còn khớp đề.');
                }
                data.set(field, answer.choice_ids[0]);
            } else data.set(`fields[question${answer.question_id}]`, answer.choice_ids[0]);
        }
        const site = new URL(location.href).searchParams.get('site');
        if (site && !data.has('site')) data.set('site', site);
        submitting = true;
        try {
            const response = await fetch('/api/LMS/Learning/CourseResult/Exercise/edit', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: data.toString()
            });
            const submitted = await response.json();
            if (!response.ok || submitted.status !== 'SUCCESS') throw new Error(submitted.message || `K12 từ chối nộp bài (HTTP ${response.status}).`);
            // A successful write is not by itself proof that the lesson reached 100%.
            let page, doc;
            try {
                page = await fetch(location.href, { credentials: 'include', cache: 'no-store' });
                doc = new DOMParser().parseFromString(await page.text(), 'text/html');
            } catch (_) { return { ok: true, submitted: true, completed: false, attemptId: attempt, message: 'K12 đã nhận bài; tải lại tiến độ thất bại. Không tự động nộp lại.' }; }
            if (!page.ok || new URL(page.url).origin !== location.origin) return { ok: true, submitted: true, completed: false, attemptId: attempt, message: 'Đã nộp; chưa xác minh được tiến độ.' };
            const percent = doc.querySelector(`.coursewarePercent${coursewareId}`)?.textContent.trim();
            return { ok: true, submitted: true, completed: percent === '100', attemptId: attempt,
                message: (percent === '100' ? 'K12 xác nhận đã nộp và hoàn thành 100%.' : 'K12 nhận bài; chưa xác minh được tiến độ 100%.') + note };
        } finally { submitting = false; }
    }

    window.addEventListener('message', event => {
        if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'k12-api-record') return;
        const entry = event.data.entry;
        if (!K12AI.recordableApiEntry(entry) || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(entry.method).toUpperCase())) return;
        // Redact a second time in the isolated world before persisting any capture.
        chrome.runtime.sendMessage({ action: 'recordK12Api', entry: K12AI.redact(entry) }).catch(() => {});
    });
    function recording(enabled) { window.postMessage({ type: 'k12-recorder-control', enabled }, location.origin); }
    chrome.storage.local.get({ k12ApiRecording: false }).then(s => recording(s.k12ApiRecording));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.k12ApiRecording) recording(changes.k12ApiRecording.newValue);
    });
    chrome.runtime.onMessage.addListener((message, _sender, reply) => {
        if (message.action === 'prepareExercise' || message.action === 'submitExercise') {
            (message.action === 'prepareExercise' ? prepareExercise() : submitExercise(message)).then(reply, error => reply({ ok: false, message: error.message }));
            return true;
        }
        if (message.action !== 'readExercise') return false;
        try { reply({ ok: true, exercise: readExercise(), submissionVerified: false }); }
        catch (error) { reply({ ok: false, message: error.message }); }
        return false;
    });
    globalThis.K12Exercise = { readExercise };
})();
