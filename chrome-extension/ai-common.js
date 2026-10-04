(() => {
    function plainText(value) {
        return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function validateExercise(exercise) {
        if (!exercise || !Array.isArray(exercise.questions) || !exercise.questions.length || exercise.questions.length > 50) {
            throw new Error('Chưa đọc được từ 1 đến 50 câu hỏi có cấu trúc. Cần xác minh API nội dung của bài này.');
        }
        const ids = new Set();
        const questions = exercise.questions.map((q) => {
            const id = String(q.id ?? '');
            const prompt = String(q.prompt ?? '').trim();
            if (!id || ids.has(id) || !prompt || !['single_choice', 'multiple_choice', 'short_text'].includes(q.kind)) {
                throw new Error('Câu hỏi thiếu mã, trùng mã, thiếu nội dung hoặc thuộc loại chưa hỗ trợ.');
            }
            ids.add(id);
            const choices = Array.isArray(q.choices) ? q.choices.map(c => ({ id: String(c.id ?? ''), text: String(c.text ?? '').trim() })) : [];
            if (choices.some(c => !c.id || !c.text) || new Set(choices.map(c => c.id)).size !== choices.length
                || (q.kind !== 'short_text' && choices.length < 2) || (q.kind === 'short_text' && choices.length)) {
                throw new Error('Không đọc được đầy đủ mã và nội dung các lựa chọn.');
            }
            return { id, kind: q.kind, prompt, choices };
        });
        // Rust limits UTF-8 bytes, whereas String.slice counts UTF-16 units.
        // A 240-code-point title stays below 1000 bytes even with emoji.
        const result = { title: Array.from(plainText(exercise.title)).slice(0, 240).join(''), questions };
        if (exercise.pdf_url) result.pdf_url = pdfUrl(exercise.pdf_url);
        if (exercise.images) {
            if (!Array.isArray(exercise.images) || exercise.images.length > 30) throw new Error('Quá nhiều hình trong đề.');
            result.images = exercise.images.map(image => {
                const id = String(image.id || '');
                if (!/^[a-f0-9]{24}$/i.test(id)) throw new Error('Mã câu hỏi có hình không hợp lệ.');
                return { id, url: imageUrl(image.url) };
            });
        }
        return result;
    }

    function imageUrl(value) {
        const url = new URL(value, 'https://static.k12online.vn');
        if (url.origin !== 'https://static.k12online.vn' || url.username || url.password || url.search || url.hash
            || !/^\/upload\/\d+\/[\w./()-]+\.(png|jpe?g|webp|gif)$/i.test(url.pathname)) {
            throw new Error('Liên kết hình K12 không hợp lệ.');
        }
        return url.href;
    }

    function pdfUrl(value) {
        const url = new URL(value);
        if (url.origin !== 'https://static.k12online.vn' || url.username || url.password || url.search || url.hash
            || !/^\/upload\/\d+\/[\w./-]+\.pdf$/i.test(url.pathname)) {
            throw new Error('Liên kết đề PDF K12 không hợp lệ.');
        }
        return url.href;
    }

    // Mirrors validate_answers on the server: an undecidable question comes back empty with confidence 0.
    const unanswered = answer => !answer.choice_ids.length && answer.confidence === 0;

    function validateAnswers(exercise, result) {
        if (!result || !Array.isArray(result.answers) || result.answers.length !== exercise.questions.length) {
            throw new Error('AI chưa trả lời đủ câu hỏi.');
        }
        const seen = new Set();
        for (const answer of result.answers) {
            const q = exercise.questions.find(q => q.id === answer.question_id);
            if (!q || seen.has(q.id) || !Array.isArray(answer.choice_ids)
                || new Set(answer.choice_ids).size !== answer.choice_ids.length
                || answer.choice_ids.some(id => !q.choices.some(c => c.id === id))
                || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1
                || (q.kind === 'single_choice' && answer.choice_ids.length !== 1 && !unanswered(answer))
                || (q.kind === 'multiple_choice' && !answer.choice_ids.length && !unanswered(answer))
                || (q.kind === 'short_text' && (answer.choice_ids.length || !String(answer.text || '').trim()))) {
                throw new Error('AI trả về mã câu hỏi hoặc đáp án không hợp lệ.');
            }
            seen.add(q.id);
        }
        return result;
    }

    // Names the low-confidence answers so the user knows which questions to check.
    function uncertainSummary(exercise, result) {
        return exercise.questions.map((q, index) => {
            const answer = result.answers.find(a => a.question_id === q.id);
            if (!answer || answer.confidence >= 0.7) return '';
            const label = q.prompt.match(/^Câu [^.]+/)?.[0] || `Câu ${index + 1}`;
            const reason = String(answer.explanation || '').trim().slice(0, 160);
            return `${label} (tin cậy ${Math.round(answer.confidence * 100)}%${reason ? `: ${reason}` : ''})`;
        }).filter(Boolean).join('; ');
    }

    function formatAnswerSummary(exercise, result) {
        validateAnswers(exercise, result);
        const byId = new Map(result.answers.map(answer => [answer.question_id, answer]));
        const lines = [];
        let lastGroup = '';
        for (const [index, question] of exercise.questions.entries()) {
            const answer = byId.get(question.id);
            const value = answer.choice_ids.length
                ? answer.choice_ids.map(id => question.choices.find(choice => choice.id === id).text).join(', ')
                : String(answer.text || '').trim();
            const statement = question.id.match(/^([a-f0-9]{24}):([1-4])$/i);
            if (statement) {
                if (lastGroup !== statement[1]) {
                    lastGroup = statement[1];
                    lines.push(`Câu ${lines.length + 1}:`);
                }
                lines[lines.length - 1] += ` ${'abcd'[Number(statement[2]) - 1]} ${value},`;
            } else lines.push(`Câu ${index + 1}: ${value}`);
        }
        return lines.map(line => line.replace(/,$/, '')).join('; ');
    }

    const NO_QUESTIONS = 'KHÔNG CÓ CÂU HỎI';
    const CONTENT_QUESTION_ID = 'content';

    function contentHasQuestions(text) {
        return /(^|\n)\s*Câu\s*\d+|(Anh|Em)\s*\/?\s*(chị\s*)?hãy|hãy\s+(viết|trả lời|nêu|phân tích|chỉ ra)|trả lời|điền\s+(từ|vào)|viết\s+(một\s+)?(đoạn|bài)\s+văn/i
            .test(String(text || ''));
    }

    // A text or file lesson becomes one short_text question; the AI answers every
    // question in it as one comment, so the server needs no new request shape.
    function contentExercise({ title, text, pdfUrl: pdf }) {
        const body = String(text || '').trim();
        const prompt = [
            'Đây là một bài học dạng văn bản/file trên K12. Học sinh phải làm toàn bộ câu hỏi và yêu cầu trong bài rồi gửi đáp án trong phần bình luận.',
            'Hãy làm toàn bộ bài và ghi đáp án vào trường text:',
            '- Trả lời theo đúng thứ tự, mỗi câu một dòng bắt đầu bằng "Câu N:" (giữ ý a, b nếu có). Không chép lại đề.',
            '- Câu trắc nghiệm: ghi chữ cái đáp án đúng (nếu có) và nội dung lựa chọn.',
            '- Câu điền khuyết: ghi (1) ..., (2) ... theo thứ tự chỗ trống.',
            '- Câu tự luận, viết đoạn văn hoặc bài văn: viết hoàn chỉnh, đúng độ dài đề yêu cầu.',
            `- Nếu bài không có câu hỏi hay yêu cầu nào cần trả lời, ghi đúng: ${NO_QUESTIONS}`,
            pdf ? 'Nội dung bài nằm trong file PDF đính kèm.' : '',
            body ? `Nội dung bài:\n${body}` : ''
        ].filter(Boolean).join('\n');
        // UTF-8 byte length, matching the server's 20000-byte prompt limit.
        if (encodeURIComponent(prompt).replace(/%[0-9A-F]{2}/g, '_').length > 20000) throw new Error('Nội dung bài quá dài để gửi AI.');
        const exercise = { title, questions: [{ id: CONTENT_QUESTION_ID, kind: 'short_text', prompt, choices: [] }] };
        if (pdf) exercise.pdf_url = pdf;
        return validateExercise(exercise);
    }

    function contentAnswer(exercise, result) {
        validateAnswers(exercise, result);
        const answer = result.answers[0];
        if (answer.confidence < 0.7) throw new Error('AI chưa chắc chắn đáp án; cần xem lại trước khi bình luận.');
        const text = String(answer.text || '').trim();
        return text.toUpperCase().includes(NO_QUESTIONS) && text.length < 40 ? '' : text;
    }

    function serverUrl(value) {
        const url = new URL(value || 'https://k12-ai-server-production.up.railway.app');
        const local = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
        const remote = url.protocol === 'https:';
        if ((!local && !remote)
            || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
            throw new Error('Server phải là localhost HTTP hoặc một địa chỉ HTTPS, không chứa đường dẫn và thông tin đăng nhập.');
        }
        return url.origin;
    }

    // Mirrors normalize_email in server/src/auth.rs so errors show before a request.
    function normalizeEmail(value) {
        const email = String(value || '').trim().toLowerCase();
        const at = email.indexOf('@');
        const local = email.slice(0, at);
        const domain = email.slice(at + 1);
        if (at < 1 || email.length > 254 || local.length > 64 || domain.includes('@')
            || !domain.includes('.') || /^[.-]|[.-]$/.test(domain) || domain.includes('..')
            || !/^[\x21-\x7e]+$/.test(email)) {
            throw new Error('Email không hợp lệ.');
        }
        return email;
    }

    /** Session login first; the optional admin token (K12_SERVER_TOKEN) skips quotas. */
    function authHeaders(server, session, adminToken) {
        const headers = {};
        if (session?.token && session.server === server) headers.Authorization = `Bearer ${session.token}`;
        if (adminToken) headers['x-k12-token'] = adminToken;
        return headers;
    }

    function isFreeLessonListUrl(value) {
        try {
            const url = new URL(value);
            return url.origin === 'https://hcm.k12online.vn'
                && /^\/\d+\/page\/LMS\/Lesson\/Student\/teacherList\/?$/i.test(url.pathname);
        } catch (_) {
            return false;
        }
    }

    function subjectRule(saved, defaultComment = false) {
        const modes = ['skip', 'submit', 'comment', 'both'];
        const exerciseMode = modes.includes(saved?.exerciseMode) ? saved.exerciseMode
            : saved?.exercise === false ? (saved.comment ? 'comment' : 'skip')
            : (saved ? saved.comment === true : defaultComment) ? 'both' : 'submit';
        return { exerciseMode, view: saved?.view !== false,
            comment: ['comment', 'both'].includes(exerciseMode),
            materialComment: saved ? (saved.materialComment ?? saved.comment) === true : defaultComment };
    }

    function workflowPreview(items, savedRule, hasCommentProfile = true) {
        const rule = subjectRule(savedRule);
        if (!Array.isArray(items)) throw new Error('Danh sách nội dung bài học không hợp lệ.');
        return items.map((item) => {
            const coursewareType = String(item?.coursewareType || '').trim();
            const completed = /^100\s*%?$/.test(String(item?.progress || '').trim());
            if (coursewareType === 'Courseware.Exercise') {
                const action = rule.exerciseMode === 'skip' ? 'Bỏ qua bài tập'
                    : completed && rule.exerciseMode === 'submit' ? 'Bỏ qua bài tập: K12 đã ghi nhận 100%'
                    : rule.exerciseMode === 'submit' ? 'Đọc đề, gọi AI, nộp đáp án'
                    : rule.exerciseMode === 'comment' ? 'Đọc đề, gọi AI, gửi bình luận đáp án'
                    : 'Đọc đề, gọi AI, nộp đáp án và gửi bình luận';
                return {
                    item, coursewareType, completed, action,
                    requiresCommentProfile: rule.comment && !hasCommentProfile,
                    writesToK12: ['both', 'comment'].includes(rule.exerciseMode)
                        || (rule.exerciseMode === 'submit' && !completed)
                };
            }
            if (['Courseware.PDF', 'Courseware.Video', 'Courseware.Content'].includes(coursewareType)) {
                const label = coursewareType === 'Courseware.Video' ? 'video' : 'tài liệu';
                const answers = rule.view && coursewareType !== 'Courseware.Video' && (rule.comment || rule.materialComment);
                if (answers) {
                    return {
                        item, coursewareType, completed,
                        action: 'Đọc bài; nếu có câu hỏi thì gọi AI làm bài và bình luận đáp án, nếu không thì đánh dấu đã xem',
                        requiresCommentProfile: !hasCommentProfile,
                        writesToK12: true
                    };
                }
                const shouldSkip = !rule.view || (completed && !rule.materialComment);
                return {
                    item, coursewareType, completed,
                    action: shouldSkip
                        ? completed ? `Bỏ qua ${label}: K12 đã ghi nhận 100%` : `Bỏ qua ${label}`
                        : `Đánh dấu ${label} đã xem${rule.materialComment ? ' và gửi bình luận' : ''}`,
                    requiresCommentProfile: !shouldSkip && rule.materialComment && !hasCommentProfile,
                    writesToK12: !shouldSkip
                };
            }
            return {
                item, coursewareType: coursewareType || 'chưa xác định', completed,
                action: 'Cần đọc loại nội dung trước khi có thể xử lý',
                requiresCommentProfile: false,
                writesToK12: false,
                unsupported: true
            };
        });
    }

    function redact(value, depth = 0) {
        if (depth > 12) return '[depth limit]';
        if (Array.isArray(value)) return value.slice(0, 200).map(v => redact(v, depth + 1));
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.entries(value).slice(0, 200).map(([key, v]) => [key,
                /token|password|cookie|authorization|account|username|phone|email|student|session|secret/i.test(key)
                    ? '[redacted]' : redact(v, depth + 1)]));
        }
        return typeof value === 'string' ? value.slice(0, 40000) : value;
    }

    function recordableApiEntry(entry) {
        return entry && (/^\/api\/LMS\//.test(entry.path)
            || (/^\/\d+\/$/.test(entry.path) && /^LMS\./.test(String(entry.request?.service || ''))));
    }
    globalThis.K12AI = { plainText, validateExercise, validateAnswers, uncertainSummary, formatAnswerSummary, contentHasQuestions, contentExercise, contentAnswer, serverUrl, normalizeEmail, authHeaders, isFreeLessonListUrl, pdfUrl, imageUrl, subjectRule, workflowPreview, redact, recordableApiEntry };
})();
