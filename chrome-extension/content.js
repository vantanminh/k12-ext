(() => {
    const UI_ID = 'k12ext-video-complete';
    const BUTTON_ID = 'k12ext-run-button';
    const STATUS_ID = 'k12ext-status';
    const SUPPORTED_PATHNAME = /^\/\d+\/page\/LMS\/Lesson\/Courseware\/learn\/[^/?#]+$/i;
    const LESSON_ENTRY_PATHNAME = /^\/\d+\/page\/LMS\/Lesson\/learn\/[^/?#]+$/i;
    const VIDEO_COMPLETE_ENDPOINT = 'https://hcm.k12online.vn/api/LMS/Learning/CourseResult/Video/complete';
    const LESSON_LAUNCH_ENDPOINT = 'https://hcm.k12online.vn/api/LMS/Learning/Lesson/learn';
    const MARK_COMPLETE_ENDPOINT = 'https://hcm.k12online.vn/api/LMS/Learning/Courseware/markComplete';
    const COMMENT_ENDPOINT = 'https://hcm.k12online.vn/api/LMS/Social/Comment/edit';
    const COMMENT_LIST_ENDPOINT = 'https://hcm.k12online.vn/api/LMS/Social/Comment/selectAll';
    const GUARD_INTERVAL_MS = 2000;

    const state = {
        isRunning: false,
        observer: null,
        historyPatched: false,
        confirmedVideoPage: false,
        confirmedUrl: '',
        guardTimer: null,
        quickButtonEnabled: true,
        // The extension is usable only after email login in the side panel.
        signedIn: false
    };

    function isCoursewarePageUrl() {
        return location.hostname === 'hcm.k12online.vn'
            && SUPPORTED_PATHNAME.test(location.pathname);
    }

    function hasVideoElement(sourceDocument = document) {
        return Boolean(
            sourceDocument.querySelector(
                '#video-upload, .video-loadDetail video, video source[type^="video/"], .video-loadDetail'
            )
        );
    }

    function hasVideoScriptMarker(sourceDocument = document) {
        try {
            return getInlineScriptSource(sourceDocument).includes('LMS.Learning.Lesson.Courseware.Video');
        } catch (_) {
            return false;
        }
    }

    function detectVideoPage() {
        if (!isCoursewarePageUrl()) {
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

    function getQueryValue(name, pageUrl = location.href) {
        try {
            return new URL(pageUrl, location.href).searchParams.get(name) || '';
        } catch (_) {
            return '';
        }
    }

    function getInlineScriptSource(sourceDocument = document) {
        return Array.from(sourceDocument.scripts, (script) => script.textContent || '').join('\n');
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

    function findNamedValue(name, source) {
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        return findValue([
            new RegExp(`(?:^|[^\\w$])["']?${escapedName}["']?\\s*:\\s*["']([^"']*)["']`, 'i'),
            new RegExp(`(?:^|[^\\w$])["']?${escapedName}["']?\\s*:\\s*([^,\\s}]+)`, 'i'),
            new RegExp(`\\b${escapedName}\\b\\s*=\\s*["']([^"']*)["']`, 'i')
        ], source);
    }

    function normalizeCoursewareType(value) {
        if (!value) {
            return '';
        }

        const type = value.trim().replace(/^LMS\.Learning\.Lesson\./i, '');
        return /^Courseware\./i.test(type) ? type : `Courseware.${type}`;
    }

    function getCoursewareType(scriptSource, sourceDocument, pageUrl) {
        const explicitType = getQueryValue('coursewareType', pageUrl)
            || getQueryValue('options[coursewareType]', pageUrl)
            || findNamedValue('coursewareType', scriptSource)
            || findNamedValue('courseware_type', scriptSource);

        if (explicitType) {
            return normalizeCoursewareType(explicitType);
        }

        const typeMarker = scriptSource.match(/\bLMS\.Learning\.Lesson\.Courseware\.([A-Za-z][A-Za-z0-9_]*)\b/);

        if (typeMarker) {
            return `Courseware.${typeMarker[1]}`;
        }

        const domType = sourceDocument.querySelector('[data-courseware-type]')?.getAttribute('data-courseware-type');

        if (domType) {
            return normalizeCoursewareType(domType);
        }

        const hasPdfViewer = Boolean(sourceDocument.querySelector(
            'embed[type="application/pdf"], object[type="application/pdf"], iframe[src*=".pdf" i]'
        ));
        const scriptReferencesPdf = /Courseware\.PDF|(?:^|[\/\s"'`])[^\s"'`]+\.pdf(?:[?#\s"'`]|$)/i.test(scriptSource);

        return hasPdfViewer || scriptReferencesPdf ? 'Courseware.PDF' : '';
    }

    function extractPayloadFromPage(pageUrl, sourceDocument) {
        const parsedUrl = new URL(pageUrl, location.href);
        const scriptSource = getInlineScriptSource(sourceDocument);
        const videoConfigBlock = extractVideoConfigBlock(scriptSource);
        const primarySource = videoConfigBlock || scriptSource;
        const lessonMatch = parsedUrl.pathname.match(SUPPORTED_PATHNAME);
        const lessonId = lessonMatch ? lessonMatch[0].split('/').pop() : findNamedValue('lessonId', scriptSource);
        const coursewareId = getQueryValue('coursewareId', parsedUrl.href) || findNamedValue('coursewareId', scriptSource);
        const courseSiteId = getQueryValue('courseSiteId', parsedUrl.href)
            || getQueryValue('options[courseSiteId]', parsedUrl.href)
            || findNamedValue('courseSiteId', scriptSource);
        const site = getQueryValue('site', parsedUrl.href) || findNamedValue('site', scriptSource);
        const securityToken = findNamedValue('securityToken', scriptSource);
        const coursewareType = getCoursewareType(scriptSource, sourceDocument, parsedUrl.href);
        const getOption = (name) => getQueryValue(name, parsedUrl.href)
            || getQueryValue(`options[${name}]`, parsedUrl.href)
            || findNamedValue(name, scriptSource);

        const isVideoCourseware = hasVideoElement(sourceDocument)
            || hasVideoScriptMarker(sourceDocument)
            || /^Courseware\.Video$/i.test(coursewareType);
        const commentContext = {
            objectType: coursewareType || (isVideoCourseware ? 'Courseware.Video' : ''),
            objectId: coursewareId,
            courseId: getOption('courseId'),
            scheduleId: getOption('scheduleId'),
            lessonId,
            site,
            securityToken
        };

        if (isVideoCourseware) {
            const payload = {
                courseSiteId: courseSiteId || findNamedValue('courseSiteId', primarySource),
                courseResultId: findNamedValue('courseResultId', primarySource),
                'options[scheduleId]': getOption('scheduleId') || findNamedValue('scheduleId', primarySource),
                'options[courseId]': getOption('courseId') || findNamedValue('courseId', primarySource),
                'options[classroomId]': getOption('classroomId') || findNamedValue('classroomId', primarySource),
                'options[contentSharingId]': getOption('contentSharingId') || findNamedValue('contentSharingId', primarySource),
                'options[trainingModuleId]': getOption('trainingModuleId') || findNamedValue('trainingModuleId', primarySource),
                site,
                securityToken
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

            return { kind: 'video', payload, commentContext, missingFields, pageUrl: parsedUrl.href };
        }

        const payload = {
            coursewareId,
            lessonId,
            'options[courseSiteId]': courseSiteId,
            'options[scheduleId]': getOption('scheduleId'),
            'options[courseId]': getOption('courseId'),
            'options[classroomId]': getOption('classroomId'),
            'options[contentSharingId]': getOption('contentSharingId'),
            'options[trainingModuleId]': getOption('trainingModuleId'),
            'options[coursewareId]': coursewareId,
            'options[coursewareType]': coursewareType,
            site,
            securityToken
        };
        const missingFields = [];

        ['coursewareId', 'lessonId', 'options[courseSiteId]', 'options[coursewareType]', 'site', 'securityToken']
            .forEach((field) => {
                if (!payload[field]) {
                    missingFields.push(field);
                }
            });

        return { kind: 'courseware', payload, commentContext, missingFields, pageUrl: parsedUrl.href };
    }

    function extractPayload() {
        return extractPayloadFromPage(location.href, document);
    }

    function getElementLessonUrl(element) {
        const sources = [
            element.getAttribute('href'),
            element.getAttribute('data-href'),
            element.getAttribute('data-url'),
            element.getAttribute('onclick')
        ].filter(Boolean);

        for (const source of sources) {
            try {
                const directUrl = new URL(source, location.href);
                if (directUrl.origin === location.origin && SUPPORTED_PATHNAME.test(directUrl.pathname)) {
                    return directUrl;
                }
            } catch (_) {
                // The value may be a JavaScript handler containing a URL instead of a URL itself.
            }

            const routeMatch = source.match(/(?:https?:\/\/hcm\.k12online\.vn)?\/\d+\/page\/LMS\/Lesson\/Courseware\/learn\/[^"'`\s)]+/i);
            if (routeMatch) {
                try {
                    const parsedUrl = new URL(routeMatch[0], location.href);
                    if (parsedUrl.origin === location.origin && SUPPORTED_PATHNAME.test(parsedUrl.pathname)) {
                        return parsedUrl;
                    }
                } catch (_) {
                    // Ignore malformed link text and continue checking other attributes.
                }
            }
        }

        return null;
    }

    function getLessonCandidate(element) {
        const row = element.closest('tr') || element.closest(
            '[data-type="Lesson"][data-id], [data-type^="Courseware"][data-id], [data-lesson-id], [data-courseware-id], tr, li, [class*="lesson"], [class*="courseware"], [class*="item"]'
        ) || element;
        const nestedLink = row.querySelector('a[href], [data-href], [data-url], [onclick]');
        const pageUrl = getElementLessonUrl(element) || (nestedLink ? getElementLessonUrl(nestedLink) : null);
        const rowType = (row.getAttribute('data-type') || '').toLowerCase();
        const rowLessonId = row.getAttribute('data-lesson-id')
            || (rowType === 'lesson' ? row.getAttribute('data-id') : '')
            || '';
        const rowCoursewareId = row.getAttribute('data-courseware-id')
            || (rowType.startsWith('courseware') ? row.getAttribute('data-id') : '') || '';

        if (!pageUrl && !rowLessonId) {
            return null;
        }

        const candidateUrl = pageUrl || new URL(location.href);
        if (!pageUrl) {
            const portalId = location.pathname.match(/^\/(\d+)\//)?.[1];
            if (!portalId) {
                return null;
            }
            candidateUrl.pathname = `/${portalId}/page/LMS/Lesson/Courseware/learn/${encodeURIComponent(rowLessonId)}`;
        }

        const params = candidateUrl.searchParams;
        const rowValues = {
            coursewareId: rowCoursewareId,
            courseSiteId: row.getAttribute('data-course-site-id') || '',
            site: row.getAttribute('data-site') || '',
            coursewareType: row.getAttribute('data-courseware-type')
                || (rowType.startsWith('courseware') ? row.getAttribute('data-type') : '') || '',
            scheduleId: row.getAttribute('data-schedule-id') || '',
            courseId: row.getAttribute('data-course-id') || '',
            classroomId: row.getAttribute('data-classroom-id') || '',
            contentSharingId: row.getAttribute('data-content-sharing-id') || '',
            trainingModuleId: row.getAttribute('data-training-module-id') || ''
        };

        Object.entries(rowValues).forEach(([name, value]) => {
            if (value && !params.has(name)) {
                params.set(name, value);
            }
        });

        if (!params.has('courseSiteId')) {
            const courseSiteId = getQueryValue('courseSiteId') || getQueryValue('site');
            if (courseSiteId) {
                params.set('courseSiteId', courseSiteId);
            }
        }
        if (!params.has('site')) {
            const site = getQueryValue('site');
            if (site) {
                params.set('site', site);
            }
        }
        if (!params.has('coursewareId') && rowCoursewareId) {
            params.set('coursewareId', rowCoursewareId);
        }

        const lessonId = pageUrl
            ? candidateUrl.pathname.split('/').pop()
            : rowLessonId;
        // JavaScript pseudo-links such as VHV.App.modules[2].doExercise()
        // are actions, not lesson routes.
        if (!/^[a-f0-9]{24}$/i.test(lessonId)) return null;
        const coursewareId = params.get('coursewareId') || rowCoursewareId;
        const courseSiteId = params.get('courseSiteId') || '';
        const site = params.get('site') || '';
        const key = `${lessonId}:${coursewareId || ''}:${courseSiteId}:${site}`;
        const labelContainer = element.closest('tr, li, [class*="lesson"], [class*="courseware"], [class*="item"]') || element;
        const titleCell = row.querySelector('[data-column-index="4"]') || (row.tagName === 'TR' ? row.children[3] : null);
        const rowTitle = titleCell?.querySelector('strong, button, a')?.textContent
            || titleCell?.textContent.split(/Môn học:/i)[0];
        const titleText = rowTitle
            || element.getAttribute('title')
            || element.textContent
            || labelContainer.textContent
            || `Bài học ${lessonId}`;
        const title = titleText.replace(/\s+/g, ' ').trim().slice(0, 140) || `Bài học ${lessonId}`;
        const nativePercent = document.querySelector(`.coursewarePercent${coursewareId}`)?.textContent.trim();
        const progressCell = row.querySelector('[data-column-index="6"]') || (row.tagName === 'TR' ? row.children[5] : null);
        const progress = progressCell?.textContent.trim() || (nativePercent ? `${nativePercent}%` : '');
        const subjectText = titleCell?.textContent || row.textContent || '';
        const subject = (subjectText.match(/Môn học:\s*(.*?)(?=\s*Giáo viên:|$)/i)?.[1] || '').replace(/\s+/g, ' ').trim() || pageSubject();
        const exerciseLink = Array.from(row.querySelectorAll('a[href]')).find(link =>
            /\/LMS\/Lesson\/Student\/listExercise\//i.test(link.getAttribute('href') || ''));

        return {
            key,
            title,
            href: candidateUrl.href,
            lessonId,
            coursewareId,
            courseSiteId,
            site,
            coursewareType: params.get('coursewareType') || '',
            subject,
            progress,
            exerciseListHref: exerciseLink ? new URL(exerciseLink.getAttribute('href'), location.href).href : '',
            requiresLessonLink: !pageUrl && rowType === 'lesson'
        };
    }

    function getLessonCandidates() {
        const lessons = new Map();

        if (isCoursewarePageUrl()) {
            const currentPage = new URL(location.href);
            const lessonId = currentPage.pathname.split('/').pop();
            const coursewareId = currentPage.searchParams.get('coursewareId') || '';
            const site = currentPage.searchParams.get('site') || '';
            // Same fallback as getLessonCandidate so the current item and its sidebar entry share one key.
            const courseSiteId = currentPage.searchParams.get('courseSiteId') || site;
            const currentKey = `${lessonId}:${coursewareId}:${courseSiteId}:${site}`;
            lessons.set(currentKey, {
                key: currentKey,
                title: document.querySelector('#module2 .panel-heading .panel-title')?.textContent.trim() || document.title || `Bài học ${lessonId}`,
                href: currentPage.href,
                lessonId,
                coursewareId,
                courseSiteId,
                site,
                subject: (Array.from(document.querySelectorAll('.lesson-header .gradeSubject span'))
                    .find(span => /^Môn học:/i.test(span.textContent.trim()))?.textContent || '')
                    .replace(/^Môn học:\s*/i, '').trim(),
                coursewareType: getCoursewareType(getInlineScriptSource(), document, currentPage.href),
                progress: document.querySelector(`.coursewarePercent${coursewareId}`)?.textContent.trim() === '100' ? '100%' : ''
            });
        }

        const primaryList = document.querySelector('#listingModule3');
        const listingModules = primaryList
            ? [primaryList]
            : Array.from(document.querySelectorAll('[id^="listingModule"]'));
        const roots = listingModules.length > 0 ? listingModules : [document.body];
        const elements = new Set();

        roots.forEach((root) => {
            root.querySelectorAll(
                'a[href], [data-href], [data-url], [onclick], [data-lesson-id], [data-courseware-id], tr[data-type="Lesson"][data-id]'
            ).forEach((element) => {
                elements.add(element);
            });
        });

        elements.forEach((element) => {
            const candidate = getLessonCandidate(element);
            if (candidate) {
                const previous = lessons.get(candidate.key);
                if (!previous) lessons.set(candidate.key, candidate);
                else if (isCoursewarePageUrl() && candidate.coursewareType) {
                    // Re-insert so the current item takes its sidebar position; prerequisites must run in K12's order.
                    lessons.delete(candidate.key);
                    lessons.set(candidate.key, { ...previous, ...candidate,
                        subject: candidate.subject || previous.subject, progress: candidate.progress || previous.progress });
                }
            }
        });

        return Array.from(lessons.values());
    }

    // Trang chủ and Học thi trực tuyến link to both lesson lists. Học tập stays
    // on Student/list; Bài giảng tự do stays on Student/teacherList.
    function collectLessonListUrls() {
        const urls = new Set();
        const add = (value) => {
            try {
                const url = new URL(value, location.href);
                if (K12AI.lessonListSection(url.href)) urls.add(url.href);
            } catch (_) {}
        };
        add(location.href);
        for (const link of document.querySelectorAll('a[href]')) add(link.getAttribute('href'));
        return Array.from(urls);
    }

    function listPagination() {
        const root = document.querySelector('#module3') || document.querySelector('#listingModule3');
        const text = root?.textContent || '';
        const total = Number(text.match(/Tổng số bản ghi:\s*(\d+)/i)?.[1] || 0);
        const pageSize = Number(text.match(/(\d+)\s*\/\s*trang/i)?.[1] || 20);
        return { total, pageSize, pages: total ? Math.ceil(total / pageSize) : 0 };
    }

    async function resolveLessonPageUrl(candidate) {
        const scriptSource = getInlineScriptSource();
        const securityToken = findNamedValue('securityToken', scriptSource);
        const site = candidate.site || getQueryValue('site');

        if (!candidate.lessonId || !site || !securityToken) {
            return {
                ok: false,
                message: 'Thiếu lessonId, site hoặc securityToken để lấy liên kết bài học.'
            };
        }

        const launchPayload = {
            id: candidate.lessonId,
            'options[showConfirmInfo]': 1,
            site,
            securityToken
        };
        const groupId = findNamedValue('groupId', scriptSource);
        const accountId = findNamedValue('accountId', scriptSource);

        if (groupId) {
            launchPayload.groupId = groupId;
        } else if (accountId) {
            launchPayload.accountId = accountId;
        }

        const response = await fetch(LESSON_LAUNCH_ENDPOINT, {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: '*/*',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: createRequestBody(launchPayload).toString()
        });
        const { rawText, data } = await parseResponse(response);

        if (!response.ok) {
            return { ok: false, message: getErrorMessage(response, data, rawText) };
        }

        if (!data || data.status !== 'SUCCESS' || !data.link) {
            return {
                ok: false,
                message: data && data.message
                    ? data.message
                    : 'Hệ thống không trả về liên kết bài học.'
            };
        }

        const lessonUrl = new URL(data.link, location.href);
        if (lessonUrl.origin !== location.origin
            || (!SUPPORTED_PATHNAME.test(lessonUrl.pathname) && !LESSON_ENTRY_PATHNAME.test(lessonUrl.pathname))) {
            return { ok: false, message: 'Liên kết bài học hệ thống trả về không hợp lệ.' };
        }

        return { ok: true, href: lessonUrl.href };
    }

    function fillCandidatePayload(request, candidate) {
        request.subject = candidate.subject || '';
        const query = new URL(candidate.href, location.href).searchParams;
        const candidateValue = (name) => candidate[name] || query.get(name) || '';
        const commentContext = request.commentContext || {};
        commentContext.objectType ||= candidateValue('coursewareType')
            || (request.kind === 'video' ? 'Courseware.Video' : '');
        commentContext.objectId ||= candidateValue('coursewareId') || request.payload.coursewareId || '';
        commentContext.courseId ||= request.payload['options[courseId]'] || candidateValue('courseId');
        commentContext.scheduleId ||= request.payload['options[scheduleId]'] || candidateValue('scheduleId');
        commentContext.lessonId ||= candidate.lessonId || '';
        commentContext.site ||= request.payload.site || candidateValue('site');
        commentContext.securityToken ||= request.payload.securityToken || '';
        request.commentContext = commentContext;

        if (request.kind === 'video') {
            request.payload.courseSiteId ||= candidateValue('courseSiteId');
            request.payload.site ||= candidateValue('site');
            request.missingFields = ['courseSiteId', 'courseResultId', 'site', 'securityToken']
                .filter((field) => !request.payload[field]);
            return request;
        }

        request.payload.coursewareId ||= candidateValue('coursewareId');
        request.payload['options[coursewareId]'] = request.payload.coursewareId;
        request.payload['options[courseSiteId]'] ||= candidateValue('courseSiteId');
        request.payload['options[coursewareType]'] ||= candidateValue('coursewareType');
        request.payload.site ||= candidateValue('site');
        request.payload.lessonId ||= candidate.lessonId || '';
        request.missingFields = ['coursewareId', 'lessonId', 'options[courseSiteId]', 'options[coursewareType]', 'site', 'securityToken']
            .filter((field) => !request.payload[field]);
        return request;
    }

    async function getCandidatePayload(candidate) {
        let candidateHref = candidate.href;
        if (candidate.requiresLessonLink) {
            const resolved = await resolveLessonPageUrl(candidate);
            if (!resolved.ok) {
                return resolved;
            }
            candidateHref = resolved.href;
        }

        const lessonUrl = new URL(candidateHref, location.href);
        // Lesson/learn is the entry URL returned by K12; fetching it follows the
        // redirect to Courseware/learn, which is validated below before parsing.
        if (lessonUrl.origin !== location.origin
            || (!SUPPORTED_PATHNAME.test(lessonUrl.pathname) && !LESSON_ENTRY_PATHNAME.test(lessonUrl.pathname))) {
            return { ok: false, message: 'Liên kết bài học không hợp lệ.' };
        }

        let pageUrl = lessonUrl.href;
        let sourceDocument = document;

        if (pageUrl !== location.href) {
            const pageResponse = await fetch(pageUrl, {
                method: 'GET',
                credentials: 'include',
                headers: { Accept: 'text/html,application/xhtml+xml,*/*' }
            });

            if (!pageResponse.ok) {
                return { ok: false, message: `Không tải được bài học (HTTP ${pageResponse.status}).` };
            }

            pageUrl = pageResponse.url || pageUrl;
            const responseUrl = new URL(pageUrl, location.href);
            if (responseUrl.origin !== location.origin || !SUPPORTED_PATHNAME.test(responseUrl.pathname)) {
                return { ok: false, message: 'Trang bài học chuyển hướng hoặc phiên đăng nhập đã hết hạn.' };
            }

            const html = await pageResponse.text();
            sourceDocument = new DOMParser().parseFromString(html, 'text/html');
        }

        const request = fillCandidatePayload(extractPayloadFromPage(pageUrl, sourceDocument), candidate);
        if (request.missingFields.length > 0) {
            return { ok: false, message: `Thiếu dữ liệu: ${request.missingFields.join(', ')}` };
        }

        return { ok: true, request, sourceDocument };
    }

    // Keeps line breaks so the AI sees where each question and choice starts.
    function lessonContentText(sourceDocument) {
        const root = sourceDocument.querySelector('.courseware-content-detail')
            || sourceDocument.querySelector('.courseware-detail');
        if (!root) return '';
        const copy = root.cloneNode(true);
        for (const hidden of copy.querySelectorAll('script, style, noscript')) hidden.remove();
        for (const table of copy.querySelectorAll('table')) {
            const rows = Array.from(table.querySelectorAll('tr'), row =>
                Array.from(row.querySelectorAll('th, td'), cell => cell.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
            table.replaceWith(sourceDocument.createTextNode(`\n${rows.join('\n')}\n`));
        }
        for (const br of copy.querySelectorAll('br')) br.replaceWith(sourceDocument.createTextNode('\n'));
        for (const block of copy.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, tr')) {
            block.after(sourceDocument.createTextNode('\n'));
        }
        return copy.textContent.split('\n').map(line => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean).join('\n');
    }

    function lessonPdfUrl(sourceDocument) {
        const sources = Array.from(sourceDocument.querySelectorAll('iframe[src], embed[src], object[data], a[href]'),
            element => element.getAttribute('src') || element.getAttribute('data') || element.getAttribute('href'));
        sources.push(...(getInlineScriptSource(sourceDocument).match(/[^\s"'`()]+\.pdf\b/gi) || []));
        for (const source of sources) {
            try {
                const url = new URL(source, 'https://static.k12online.vn/');
                const candidates = [url.searchParams.get('file'), url.href].filter(Boolean);
                for (const value of candidates) {
                    try { return K12AI.pdfUrl(new URL(value, 'https://static.k12online.vn/').href); } catch (_) { /* next */ }
                }
            } catch (_) { /* next */ }
        }
        return '';
    }

    function answeredBefore(history, commentContext) {
        const key = `${commentContext.lessonId}:${commentContext.objectType}:${commentContext.objectId}`;
        return history.find(entry => entry.key === key && entry.kind === 'answer' && ['sent', 'pending'].includes(entry.state));
    }

    // Reads a text/file lesson so the side panel can ask the AI to do it.
    async function readLessonContent(candidate) {
        const prepared = await getCandidatePayload(candidate);
        if (!prepared.ok) return prepared;
        const { request, sourceDocument } = prepared;
        const type = request.payload['options[coursewareType]'];
        const { k12CommentHistory = [] } = await chrome.storage.local.get('k12CommentHistory');
        const prior = answeredBefore(k12CommentHistory, request.commentContext);
        if (prior?.state === 'sent') return { ok: true, answered: true };
        if (prior) return { ok: false, message: 'Lần gửi bình luận đáp án trước chưa xác định kết quả; hãy kiểm tra phần Thảo luận trước khi gửi lại.' };
        const text = lessonContentText(sourceDocument);
        const pdfUrl = type === 'Courseware.PDF' ? lessonPdfUrl(sourceDocument) : '';
        if (type === 'Courseware.PDF' && !pdfUrl && !K12AI.contentHasQuestions(text)) {
            return { ok: true, noQuestions: true, message: 'Không đọc được file PDF của bài.' };
        }
        if (!pdfUrl && !K12AI.contentHasQuestions(text)) return { ok: true, noQuestions: true };
        const title = sourceDocument.querySelector('.panel-heading .panel-title')?.textContent || candidate.title || '';
        return { ok: true, exercise: K12AI.contentExercise({ title, text, pdfUrl }) };
    }

    async function fetchK12Document(url) {
        const response = await fetch(url, { credentials: 'include', headers: { Accept: 'text/html,*/*' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        if (new URL(response.url || url).origin !== location.origin) throw new Error('Phiên đăng nhập có thể đã hết hạn.');
        return new DOMParser().parseFromString(await response.text(), 'text/html');
    }

    // Lists the lesson's contents from its page, then asks K12 for each content's
    // comments and looks for one carrying the user's class and student ID.
    async function verifyLessonComments(candidate, profile, wanted) {
        const studentId = String(profile?.studentId || '').trim().toLowerCase();
        const className = String(profile?.className || '').trim().toLowerCase();
        if (!studentId || !className) return { ok: false, message: 'Thiếu Lớp hoặc Mã số.' };
        let href = candidate.href;
        if (candidate.requiresLessonLink) {
            const resolved = await resolveLessonPageUrl(candidate);
            if (!resolved.ok) return resolved;
            href = resolved.href;
        }
        const lessonPage = await fetchK12Document(href);
        const lessonUrl = new URL(href, location.href);
        const site = lessonUrl.searchParams.get('site') || candidate.site || lessonUrl.searchParams.get('courseSiteId') || '';
        const courseSiteId = lessonUrl.searchParams.get('courseSiteId') || candidate.courseSiteId || site;
        const contents = new Map();
        for (const node of lessonPage.querySelectorAll('[data-item-id][data-type^="Courseware."]')) {
            const id = (node.getAttribute('data-item-id') || '').replace(/[^a-f0-9]/gi, '');
            if (/^[a-f0-9]{24}$/i.test(id) && !contents.has(id)) {
                contents.set(id, { id, type: node.getAttribute('data-type'), title: (node.getAttribute('data-tooltip') || node.getAttribute('title') || id).trim() });
            }
        }
        if (!contents.size && candidate.coursewareId) {
            contents.set(candidate.coursewareId, { id: candidate.coursewareId, type: candidate.coursewareType, title: candidate.title });
        }
        if (!contents.size) return { ok: false, message: 'Không tìm thấy nội dung trong bài học.' };
        const targets = Array.from(contents.values())
            .filter(item => wanted[item.type === 'Courseware.Exercise' ? 'exercise' : 'material']);
        const securityToken = findNamedValue('securityToken', getInlineScriptSource(lessonPage))
            || findNamedValue('securityToken', getInlineScriptSource()) || '';
        // A comment title is "Tên - Lớp - Mã số - ...".
        const mine = title => {
            const parts = String(title || '').toLowerCase().split(' - ').map(part => part.trim());
            return parts.some((part, index) => part === className && parts[index + 1] === studentId);
        };
        const items = await Promise.all(targets.map(async item => {
            try {
                return { title: item.title, found: (await selectComments(item.id, site || courseSiteId, securityToken)).some(c => mine(c.title)) };
            } catch (error) {
                return { title: item.title, found: null, message: error.message };
            }
        }));
        return { ok: true, items };
    }

    // Social/Comment/selectAll lists the comments of one courseware; page until
    // totalItems is reached or K12 stops returning new comments.
    async function selectComments(objectId, site, securityToken) {
        const comments = new Map();
        for (let pageNo = 1; pageNo <= 50; pageNo += 1) {
            const response = await fetch(COMMENT_LIST_ENDPOINT, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    Accept: 'application/json, */*',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: createRequestBody({ 'filters[objectId]': objectId, itemsPerPage: 200, pageNo, site, securityToken }).toString()
            });
            const { rawText, data } = await parseResponse(response);
            if (!response.ok || !data || !Array.isArray(data.items)) throw new Error(getErrorMessage(response, data, rawText));
            const before = comments.size;
            data.items.forEach(comment => comments.set(comment._id || comment.title, comment));
            if (comments.size === before || comments.size >= Number(data.totalItems || 0)) break;
        }
        return Array.from(comments.values());
    }

    async function commentLessonContent(candidate, exercise, result) {
        const answer = K12AI.contentAnswer(exercise, result);
        if (!answer) return { ok: true, commented: false, noQuestions: true };
        const prepared = await getCandidatePayload(candidate);
        if (!prepared.ok) return prepared;
        return submitAutomaticComment(prepared.request.commentContext, answer, candidate.subject || '', { contentAnswer: true });
    }

    async function completeLessonFromSidebar(candidate, options = {}) {
        if (state.isRunning) {
            return { ok: false, message: 'Một yêu cầu khác đang chạy.' };
        }

        state.isRunning = true;
        try {
            const prepared = await getCandidatePayload(candidate);
            if (!prepared.ok) {
                return prepared;
            }

            prepared.request.skipComment = options.skipComment === true;
            return await runCompletionWorkflow(prepared.request);
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : 'Không gửi được yêu cầu.' };
        } finally {
            state.isRunning = false;
        }
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

    async function submitVideoCompletion(payload) {
        const response = await fetch(VIDEO_COMPLETE_ENDPOINT, {
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

    async function submitCoursewareCompletion(payload) {
        const response = await fetch(MARK_COMPLETE_ENDPOINT, {
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

        if (response.redirected && !response.url.includes('/api/LMS/Learning/Courseware/markComplete')) {
            return {
                ok: false,
                message: 'Phiên đăng nhập có thể đã hết hạn. Hãy đăng nhập lại rồi thử tiếp.',
                data
            };
        }

        if (data === false || data === 0 || (data === null && rawText.trim())) {
            return {
                ok: false,
                message: getErrorMessage(response, data, rawText),
                data
            };
        }

        if (data && typeof data === 'object') {
            const status = data.status == null ? '' : String(data.status).toUpperCase();

            if ((status && status !== 'SUCCESS') || data.success === false || data.ok === false || data.error) {
                return {
                    ok: false,
                    message: getErrorMessage(response, data, rawText),
                    data
                };
            }
        }

        return { ok: true, data };
    }

    function pageSubject(sourceDocument = document) {
        return (Array.from(sourceDocument.querySelectorAll('.lesson-header .gradeSubject span'))
            .find(span => /^Môn học:/i.test(span.textContent.trim()))?.textContent || '')
            .replace(/^Môn học:\s*/i, '').trim();
    }

    function clickPaginationLinkWithoutJavascriptNavigation(link) {
        const href = link.getAttribute('href');
        const javascriptHref = typeof href === 'string' && /^\s*javascript:/i.test(href);
        const preventNavigation = event => event.preventDefault();
        link.addEventListener('click', preventNavigation, true);
        if (javascriptHref) link.removeAttribute('href');
        try {
            link.click();
        } finally {
            if (javascriptHref) link.setAttribute('href', href);
            link.removeEventListener('click', preventNavigation, true);
        }
    }

    async function submitAutomaticComment(commentContext, answerSummary = '', subject = '', options = {}) {
        const settings = await chrome.storage.local.get({
            k12AutoCommentEnabled: false,
            k12AutoCommentProfile: { name: '', className: '', studentId: '' },
            k12SubjectRules: {}
        });
        const rule = K12AI.subjectRule(settings.k12SubjectRules?.[subject || pageSubject()], settings.k12AutoCommentEnabled);
        const enabled = options.contentAnswer ? rule.comment || rule.materialComment
            : answerSummary ? rule.comment : rule.materialComment;
        if (!enabled) {
            return { ok: true, commented: false };
        }

        const profile = settings.k12AutoCommentProfile || {};
        const name = String(profile.name || '').trim();
        const className = String(profile.className || '').trim();
        const studentId = String(profile.studentId || '').trim();

        if (!name || !className || !studentId) {
            return {
                ok: false,
                message: 'Thiếu Tên, Lớp hoặc Mã số trong mục Quản lý.'
            };
        }

        const context = commentContext || {};
        if (!context.objectType || !context.objectId || !context.lessonId || !context.site || !context.securityToken) {
            return { ok: false, message: 'Thiếu dữ liệu bài học để gửi bình luận.' };
        }

        const payload = {
            'fields[objectType]': context.objectType,
            'fields[objectId]': context.objectId,
            'fields[courseId]': context.courseId || '',
            'fields[scheduleId]': context.scheduleId || '',
            'fields[lessonId]': context.lessonId,
            'fields[title]': [name, className, studentId, answerSummary || 'đã xem ạ'].join(' - '),
            site: context.site,
            securityToken: context.securityToken
        };
        const { k12CommentHistory = [] } = await chrome.storage.local.get('k12CommentHistory');
        const historyKey = `${context.lessonId}:${context.objectType}:${context.objectId}`;
        const prior = k12CommentHistory.find(entry => entry.key === historyKey && entry.text === payload['fields[title]']);
        if (prior?.state === 'sent') return { ok: true, commented: true, duplicateSkipped: true, message: 'Bình luận này đã gửi trước đó.' };
        if (prior?.state === 'pending') return { ok: false, message: 'Lần gửi bình luận trước chưa xác định kết quả; hãy kiểm tra phần Thảo luận trước khi gửi lại.' };
        const entry = { key: historyKey, text: payload['fields[title]'], state: 'pending', time: new Date().toISOString() };
        if (options.contentAnswer) entry.kind = 'answer';
        const history = [entry, ...k12CommentHistory].slice(0, 100);
        await chrome.storage.local.set({ k12CommentHistory: history });
        const response = await fetch(COMMENT_ENDPOINT, {
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
            await chrome.storage.local.set({ k12CommentHistory });
            return { ok: false, message: getErrorMessage(response, data, rawText) };
        }

        if (response.redirected && !response.url.includes('/api/LMS/Social/Comment/edit')) {
            return {
                ok: false,
                message: 'Phiên đăng nhập có thể đã hết hạn. Hãy đăng nhập lại rồi thử tiếp.'
            };
        }

        if (data === false || data === 0) {
            await chrome.storage.local.set({ k12CommentHistory });
            return { ok: false, message: getErrorMessage(response, data, rawText) };
        }

        if (data && typeof data === 'object') {
            const status = data.status == null ? '' : String(data.status).toUpperCase();
            if ((status && status !== 'SUCCESS' && status !== 'OK')
                || data.success === false || data.ok === false || data.error) {
                await chrome.storage.local.set({ k12CommentHistory });
                return { ok: false, message: getErrorMessage(response, data, rawText) };
            }
        }
        if (!data || typeof data !== 'object' || !['SUCCESS', 'OK'].includes(String(data.status || '').toUpperCase())) {
            return { ok: false, message: 'K12 chưa trả xác nhận bình luận thành công; hãy kiểm tra phần Thảo luận.' };
        }
        entry.state = 'sent';
        entry.id = data.id || '';
        await chrome.storage.local.set({ k12CommentHistory: history });
        return { ok: true, commented: true, commentId: entry.id };
    }

    async function runCompletionWorkflow(request) {
        if (request.payload['options[coursewareType]'] === 'Courseware.Exercise') {
            return { ok: false, message: 'Bài tập cần đọc đề và nộp đáp án. Hãy dùng tính năng AI bài tập trong sidebar.' };
        }
        if (request.kind !== 'video' && !['Courseware.PDF', 'Courseware.Content'].includes(request.payload['options[coursewareType]'])) {
            return { ok: false, message: `Chưa hỗ trợ đánh dấu loại nội dung ${request.payload['options[coursewareType]'] || 'chưa xác định'}.` };
        }
        const completion = request.kind === 'video'
            ? await submitVideoCompletion(request.payload)
            : await submitCoursewareCompletion(request.payload);

        if (!completion.ok) {
            return completion;
        }
        if (request.kind !== 'video') {
            try {
                const page = await fetch(request.pageUrl, { credentials: 'include', cache: 'no-store' });
                const doc = new DOMParser().parseFromString(await page.text(), 'text/html');
                const percent = doc.querySelector(`.coursewarePercent${request.payload.coursewareId}`)?.textContent.trim();
                if (!page.ok || new URL(page.url || request.pageUrl).origin !== location.origin || percent !== '100') {
                    return { ok: false, completionOk: true, completed: false, message: 'K12 đã nhận yêu cầu đã xem; chưa xác minh được tiến độ 100%.' };
                }
            } catch (_) { return { ok: false, completionOk: true, completed: false, message: 'K12 đã nhận yêu cầu đã xem; tải lại tiến độ thất bại.' }; }
        }

        const completionMessage = request.kind === 'video'
            ? 'Video đã hoàn tất. status=SUCCESS, percent=100.'
            : 'Bài học đã được đánh dấu hoàn thành.';
        // A lesson with questions gets the AI answer comment instead of "đã xem ạ".
        if (request.skipComment) return { ok: true, completed: true, message: completionMessage };
        let comment;
        try {
            comment = await submitAutomaticComment(request.commentContext, '', request.subject);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Không gửi được bình luận.';
            return {
                ok: false,
                completionOk: true,
                message: completionMessage + ' Bình luận tự động chưa gửi được: ' + message
            };
        }

        if (!comment.ok) {
            return {
                ok: false,
                completionOk: true,
                message: completionMessage + ' Bình luận tự động chưa gửi được: ' + comment.message
            };
        }

        return {
            ok: true,
            completed: true,
            message: completionMessage + (comment.commented ? ' Đã gửi bình luận tự động.' : '')
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

        const request = extractPayload();

        if (request.missingFields.length > 0) {
            setStatus(`Không đủ dữ liệu để gửi request: ${request.missingFields.join(', ')}`, 'error');
            return;
        }

        state.isRunning = true;
        setButtonState('Đang chạy...', true);
        setStatus('Đang gửi yêu cầu hoàn thành bài học...', 'running');

        try {
            const result = await runCompletionWorkflow(request);

            if (result.ok) {
                setStatus(result.message, 'success');
                setButtonState('Hoàn thành lại', false);
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
            '<div class="k12ext-subheading">Hoàn thành bài học ngay bằng một lần bấm.</div>',
            `<button type="button" id="${BUTTON_ID}" class="k12ext-button">Hoàn thành bài</button>`,
            `<div id="${STATUS_ID}" class="k12ext-status" data-state="idle">Sẵn sàng hoàn thành bài học.</div>`
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
        const exercisePage = isCoursewarePageUrl() && getCoursewareType(getInlineScriptSource(), document, location.href) === 'Courseware.Exercise';
        if (!state.quickButtonEnabled || !state.signedIn || !isCoursewarePageUrl() || exercisePage) {
            state.confirmedVideoPage = false;
            state.confirmedUrl = '';
            removeUi();
            stopGuard();
            return;
        }

        detectVideoPage();
        createUi();
        startGuard();
    }

    function startGuard() {
        if (state.guardTimer) {
            return;
        }

        state.guardTimer = setInterval(() => {
            if (!state.quickButtonEnabled || !state.signedIn || !isCoursewarePageUrl()) {
                stopGuard();
                removeUi();
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
            if (message.action === 'postExerciseComment') {
                (async () => {
                    if (JSON.stringify(K12AI.validateExercise(message.exercise)) !== JSON.stringify(K12Exercise.readExercise())) throw new Error('Đề đã thay đổi, cần đọc và giải lại trước khi bình luận.');
                    if (message.result?.answers?.some(answer => answer.confidence < 0.7)) throw new Error('Có câu AI chưa chắc chắn; cần xem lại trước khi bình luận.');
                    const summary = K12AI.formatAnswerSummary(message.exercise, message.result);
                    const request = extractPayload();
                    return submitAutomaticComment(request.commentContext, summary, pageSubject());
                })().then(sendResponse, error => sendResponse({ ok: false, message: error.message }));
                return true;
            }
            if (message.action === 'getLessonListUrls') {
                sendResponse({ ok: true, urls: collectLessonListUrls() });
                return false;
            }
            if (message.action === 'advanceLessonPage') {
                const next = Number(message.page);
                const root = document.querySelector('#module3') || document.querySelector('#listingModule3') || document.querySelector('[id^="listingModule"]');
                const link = root && Array.from(root.querySelectorAll('a')).find(a => a.textContent.trim() === String(next));
                if (!Number.isInteger(next) || next < 2 || !link) {
                    sendResponse({ ok: true, advanced: false });
                    return false;
                }
                const before = getLessonCandidates().map(c => c.key).join('|');
                // K12 handles the click; temporarily remove javascript: hrefs
                // because Chromium blocks those URLs under the page CSP.
                clickPaginationLinkWithoutJavascriptNavigation(link);
                const started = Date.now();
                let lastSignature = '';
                let stable = 0;
                const timer = setInterval(() => {
                    const lessons = getLessonCandidates();
                    const signature = lessons.map(c => c.key).join('|');
                    stable = signature && signature === lastSignature ? stable + 1 : 0;
                    lastSignature = signature;
                    if (signature !== before && stable >= 2) {
                        clearInterval(timer);
                        sendResponse({ ok: true, advanced: true, lessons, pagination: listPagination() });
                    } else if (Date.now() - started > 15000) {
                        clearInterval(timer);
                        sendResponse({ ok: false, message: `Trang ${next} chưa tải được dữ liệu mới.` });
                    }
                }, 250);
                return true;
            }
            if (message.action === 'resolveExerciseLesson') {
                resolveLessonPageUrl(message.candidate).then(sendResponse, error => sendResponse({ ok: false, message: error.message }));
                return true;
            }
            if (message.action === 'getLessonCandidates') {
                const lessons = getLessonCandidates();
                const pagination = listPagination();
                const listing = K12AI.isLessonListUrl(location.href);
                const root = document.querySelector('#module3') || document.querySelector('#listingModule3');
                const nextReady = pagination.pages < 2 || Array.from(root?.querySelectorAll('a') || []).some(a => a.textContent.trim() === '2');
                sendResponse({
                    ok: true,
                    ready: !listing || (lessons.length > 0 && lessons.every(c => /\d+\s*%/.test(c.progress)) && nextReady),
                    lessons,
                    pagination,
                    message: lessons.length > 0
                        ? `${lessons.length} bài học tìm thấy trên trang.`
                        : 'Trang này chưa có bài học trong danh sách để chọn.'
                });
                return true;
            }

            if (message.action === 'refreshLessonProgress') {
                // Lesson/learn relaunches the lesson, which makes K12 recompute progress and unlocks.
                resolveLessonPageUrl(message.candidate).then(sendResponse, error => sendResponse({ ok: false, message: error.message }));
                return true;
            }

            if (message.action === 'completeLessonFromSidebar') {
                completeLessonFromSidebar(message.candidate, message.options).then(sendResponse);
                return true;
            }

            if (message.action === 'verifyLessonComments') {
                verifyLessonComments(message.candidate, message.profile, message.wanted).then(sendResponse, error => sendResponse({ ok: false, message: error.message }));
                return true;
            }

            if (message.action === 'readLessonContent' || message.action === 'commentLessonContent') {
                (message.action === 'readLessonContent'
                    ? readLessonContent(message.candidate)
                    : commentLessonContent(message.candidate, message.exercise, message.result))
                    .then(sendResponse, error => sendResponse({ ok: false, message: error.message }));
                return true;
            }

            if (message.action === 'setQuickButtonEnabled') {
                state.quickButtonEnabled = message.enabled !== false;
                ensureUi();
                sendResponse({ ok: true, enabled: state.quickButtonEnabled });
                return true;
            }

            if (message.action === 'getStatus') {
                sendResponse({
                    isCoursewarePage: isCoursewarePageUrl(),
                    isVideoPage: state.confirmedVideoPage || detectVideoPage(),
                    isRunning: state.isRunning,
                    uiPresent: Boolean(document.getElementById(UI_ID))
                });
                return true;
            }

            if (message.action === 'runProcess') {
                if (isCoursewarePageUrl()) {
                    detectVideoPage();
                    ensureUi();
                }

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

        const request = extractPayload();

        if (request.missingFields.length > 0) {
            sendResponse({
                ok: false,
                message: `Không đủ dữ liệu: ${request.missingFields.join(', ')}`
            });
            return;
        }

        state.isRunning = true;
        setButtonState('Đang chạy...', true);
        setStatus('Đang gửi yêu cầu hoàn thành bài học...', 'running');

        try {
            const result = await runCompletionWorkflow(request);

            if (result.ok) {
                const message = result.message;
                setStatus(message, 'success');
                setButtonState('Hoàn thành lại', false);
                sendResponse({ ok: true, message });
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
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'local') return;
            if (changes.k12QuickButtonEnabled) state.quickButtonEnabled = changes.k12QuickButtonEnabled.newValue !== false;
            if (changes.k12AuthSession) state.signedIn = Boolean(changes.k12AuthSession.newValue?.token);
            if (changes.k12QuickButtonEnabled || changes.k12AuthSession) ensureUi();
        });
        chrome.storage.local.get({ k12QuickButtonEnabled: true, k12AuthSession: null })
            .then((settings) => {
                state.quickButtonEnabled = settings.k12QuickButtonEnabled !== false;
                state.signedIn = Boolean(settings.k12AuthSession?.token);
                ensureUi();
            })
            .catch(() => ensureUi());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
