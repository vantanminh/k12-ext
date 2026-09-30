(() => {
    const materialTypes = new Set(['Courseware.PDF', 'Courseware.Video', 'Courseware.Content']);
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const locked = opened => opened?.prerequisiteRequired || /chưa mở biểu mẫu/i.test(opened?.message || '');
    const complete = item => /^100\s*%?$/.test(String(item.progress || '').trim());
    async function run(items, rule, api) {
        const records = [];
        const materials = [];
        // K12 sometimes updates progress late, so a locked exercise gets its
        // preceding materials re-marked once before retrying.
        async function unlock(item) {
            if (!rule.view) return false;
            const before = materials.filter(material => items.indexOf(material) < items.indexOf(item));
            if (!before.length) return false;
            for (const material of before) await api.complete(material).catch(() => null);
            await pause(3000);
            return true;
        }
        for (const item of items) {
            let opened;
            let submitted = false;
            try {
                let type = item.coursewareType;
                if (type === 'Courseware.Exercise' && rule.exerciseMode === 'skip') {
                    records.push({ item, skipped: true, message: 'Bỏ qua bài tập theo cấu hình môn.' });
                    continue;
                }
                if (type === 'Courseware.Exercise' && complete(item) && rule.exerciseMode === 'submit') {
                    records.push({ item, skipped: true, completed: true, message: 'K12 đã ghi nhận 100%.' });
                    continue;
                }
                if (!type || type === 'Courseware.Exercise') {
                    opened = await api.prepare(item);
                    if (locked(opened) && await unlock(item)) {
                        if (opened?.tabId) await api.release(opened.tabId);
                        opened = await api.prepare(item);
                    }
                    if (opened?.notExercise) type = opened.coursewareType;
                    else if (!opened?.ok) throw Error(opened?.message || 'Không đọc được bài tập.');
                    else type = 'Courseware.Exercise';
                }
                if (materialTypes.has(type)) {
                    materials.push(item);
                    if (!rule.view) {
                        records.push({ item, skipped: true, completed: complete(item), message: 'Bỏ qua tài liệu/video theo cấu hình môn.' });
                        continue;
                    }
                    if (complete(item) && !rule.materialComment) {
                        records.push({ item, skipped: true, completed: true, message: 'K12 đã ghi nhận 100%.' });
                        continue;
                    }
                    const done = await api.complete(item);
                    if (!done?.ok || !done.completed) throw Error(done?.message || 'Chưa xác minh được tiến độ tài liệu/video.');
                    records.push({ item, completed: true, message: done.message });
                    continue;
                }
                if (type !== 'Courseware.Exercise') throw Error(`Chưa hỗ trợ loại nội dung ${type || 'chưa xác định'}.`);
                if (rule.exerciseMode === 'skip') {
                    records.push({ item, skipped: true, message: 'Bỏ qua bài tập theo cấu hình môn.' });
                    continue;
                }
                const result = await api.solve(opened.exercise);
                let completed = complete(item);
                if (['submit', 'both'].includes(rule.exerciseMode) && !completed) {
                    const sent = await api.submit(opened, result);
                    submitted = sent?.submitted === true;
                    if (!sent?.ok || !sent.completed) throw Error(sent?.message || 'K12 chưa xác nhận bài hoàn thành.');
                    completed = true;
                }
                let commented = false;
                if (['comment', 'both'].includes(rule.exerciseMode)) {
                    const comment = await api.comment(opened, result);
                    if (!comment?.ok || !comment.commented) throw Error(comment?.message || 'Bình luận đáp án chưa được gửi.');
                    commented = true;
                }
                records.push({ item, completed, submitted, commented,
                    message: [completed ? 'K12 ghi nhận 100%.' : 'Đã giải bài.', commented ? 'Đã gửi bình luận đáp án.' : ''].filter(Boolean).join(' ') });
            } catch (error) {
                records.push({ item, ok: false, submitted, message: error.message });
            } finally {
                if (opened?.tabId) await api.release(opened.tabId);
            }
        }
        return { ok: records.every(record => record.ok !== false),
            completed: records.length > 0 && records.every(record => record.completed), records };
    }
    globalThis.K12Workflow = { run };
})();
