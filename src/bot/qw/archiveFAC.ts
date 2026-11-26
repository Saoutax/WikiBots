import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { BotInstance } from '@/lib';
import {
    dayjs,
    deriveTalkPage,
    extractChineseDate,
    findTemplates,
    getLatestTimestamp,
    normalizeHeadingSpacing,
    sameTitle,
} from '@/utils';
import { archiveDiscussion } from '../modules';

const bot = new BotInstance(api);

const TARGET = 'Qiuwen_talk:内容评选';
const CLAIM_HEADING = '第一批特色条目认领';
const SUMMARY = '机器人：存档讨论';
const MOVE_SOURCE = 'Qiuwen talk:内容评选';

type ActionCode = 'FAC' | 'FAR' | 'GA' | 'GAR' | 'POTD';
type ActionResult = 'pass' | 'fail';

interface ActionInfo {
    code: ActionCode;
    result: ActionResult;
    date: string;
    link: string;
}

interface ThreadInfo {
    title: string;
    start: number;
    end: number;
    text: string;
    targets: string[];
    action: ActionInfo | undefined;
    body: string;
}

const FAIL_WORDS = [
    '落选',
    '落選',
    '未通过',
    '未通過',
    '未当选',
    '未當選',
    '未达',
    '未達',
    '撤销',
    '撤銷',
    '移除',
    '不符',
];

const PASS_WORDS = [
    '当选',
    '當選',
    '入选',
    '入選',
    '通过',
    '通過',
    '维持',
    '維持',
    '恭喜',
    '获评',
    '獲評',
];

/**
 * 解析讨论串的第二存档目标
 *
 * @param root - 讨论串解析结果
 * @param article2 - Article2 模板
 * @returns 目标页标题
 */
const resolveTargets = (
    root: ReturnType<typeof Parser.parse>,
    article2: Parser.TranscludeToken | undefined,
): string[] => {
    const archiveTo = findTemplates(root, '存档至', '存檔至');

    if (archiveTo.length > 0) {
        const targets = new Set<string>();

        for (const template of archiveTo) {
            for (let i = 1; i <= 10; i++) {
                const value = template.getValue(i)?.trim();
                if (value) {
                    targets.add(value);
                }
            }
        }

        return [...targets];
    }

    const raw = article2?.getValue('1')?.trim();
    const target = raw ? deriveTalkPage(raw) : undefined;

    return target ? [target] : [];
};

/**
 * 按关键词判断评选类型
 *
 * @param text - 包含评选类型说明的文本
 * @returns 评选类型代码
 */
const classifyType = (text: string): ActionCode | undefined => {
    const content = text.replaceAll("'", '').replaceAll('_', ' ');

    if (content.includes('每日影像')) {
        return 'POTD';
    }

    const reselect = content.includes('重选') || content.includes('重選');

    if (content.includes('特色')) {
        return reselect ? 'FAR' : 'FAC';
    }

    if (content.includes('好文章') || content.includes('优良') || content.includes('優良')) {
        return reselect ? 'GAR' : 'GA';
    }

    return undefined;
};

/**
 * 解析讨论串的评选类型
 *
 * @param root - 讨论串解析结果
 * @param article2 - Article2 模板
 * @returns 评选类型代码
 */
const parseActionType = (
    root: ReturnType<typeof Parser.parse>,
    article2: Parser.TranscludeToken | undefined,
): ActionCode | undefined => {
    if (!article2) {
        return undefined;
    }

    const index = article2.getAbsoluteIndex();
    const line = root.getLines().find(([, start, end]) => index >= start && index < end)?.[0];

    if (!line) {
        return undefined;
    }

    const lineRoot = Parser.parse(line);

    for (const link of lineRoot.querySelectorAll<Parser.LinkToken>('link')) {
        const target = typeof link.link === 'string' ? link.link : link.link.title,
            label = link.innerText.replaceAll("'", '').trim(),
            code = classifyType(`${target} ${label}`);

        if (code) {
            return code;
        }
    }

    const plain = lineRoot.plainText(),
        at = plain.indexOf('提名类型');

    return classifyType(at >= 0 ? plain.slice(at) : plain);
};

/**
 * 解析评选结果
 *
 * @param archiveTop - Archive top 模板
 * @returns 结果代码
 */
const parseResult = (archiveTop: Parser.TranscludeToken): ActionResult | undefined => {
    const status = archiveTop.getValue('status')?.trim().toLowerCase();

    if (status === '+' || status === 'done') {
        return 'pass';
    }

    if (status === '-') {
        return 'fail';
    }

    const result = archiveTop.getValue('result');
    if (!result) {
        return undefined;
    }

    const text = Parser.parse(result).plainText();

    if (FAIL_WORDS.some(word => text.includes(word))) {
        return 'fail';
    }

    if (PASS_WORDS.some(word => text.includes(word))) {
        return 'pass';
    }

    return undefined;
};

/**
 * 解析评选截止日期
 *
 * @param text - 讨论串原文
 * @returns 形如「2026-09-20」的日期
 */
const parseDeadline = (text: string): string | undefined => {
    const plain = Parser.parse(text).plainText(),
        period = plain.indexOf('评选期');

    if (period >= 0) {
        const to = plain.indexOf('至', period);

        if (to >= 0) {
            const date = extractChineseDate(plain.slice(to + 1, to + 70));

            if (date) {
                return date;
            }
        }
    }

    const pending = plain.indexOf('若在');

    return pending >= 0 ? extractChineseDate(plain.slice(pending + 2, pending + 70)) : undefined;
};

/**
 * 推导评选结束日期
 *
 * @param root - 讨论串解析结果
 * @param text - 讨论串原文
 * @param archiveTop - Archive top 模板
 * @param result - 评选结果
 * @returns 形如「2026-09-20」的日期
 */
const deriveDate = (
    root: ReturnType<typeof Parser.parse>,
    text: string,
    archiveTop: Parser.TranscludeToken,
    result: ActionResult,
): string => {
    const makePublic = findTemplates(root, 'make public')[0],
        endtime = makePublic?.getValue('endtime'),
        endDate = endtime ? extractChineseDate(endtime) : undefined;

    if (endDate) {
        return endDate;
    }

    if (result === 'fail') {
        const deadline = parseDeadline(text);

        if (deadline) {
            return deadline;
        }
    }

    const timestamp = getLatestTimestamp(archiveTop.toString()) ?? getLatestTimestamp(text);

    return (timestamp ?? dayjs().tz()).format('YYYY-MM-DD');
};

/**
 * 生成目标讨论页正文：去掉原标题与存档至提示
 *
 * @param text - 讨论串原文
 * @returns 目标页正文
 */
const buildBody = (text: string): string => {
    const root = Parser.parse(text);

    root.querySelector<Parser.HeadingToken>('heading')?.remove(true);
    for (const template of findTemplates(root, '存档至', '存檔至')) {
        template.remove(true);
    }

    return root.toString().trim();
};

/**
 * 生成当月存档页片段
 *
 * @param thread - 讨论串
 * @returns 存档片段
 */
const buildArchiveBlock = ({ text }: ThreadInfo): string => text.trimEnd();

/**
 * 生成目标讨论页片段
 *
 * @param thread - 讨论串
 * @returns 目标页片段
 */
const buildDestinationBlock = ({ title, body }: ThreadInfo): string =>
    `== ${title} ==\n{{移动自|${MOVE_SOURCE}}}\n${body}`;

/**
 * 更新目标页的 Article history
 *
 * @param content - 目标页原文
 * @param action - 评选信息
 * @returns 更新后的内容
 */
const updateArticleHistory = (content: string, action: ActionInfo | undefined): string => {
    const root = Parser.parse(content),
        template = findTemplates(root, 'article history', 'articlehistory')[0];

    if (!template) {
        if (!action) {
            return content;
        }

        const history =
            Parser.parse('{{Article history}}').querySelectorAll<Parser.TranscludeToken>(
                'template',
            )[0]!;

        history.setValue('action1', action.code, true);
        history.setValue('action1date', action.date, true);
        history.setValue('action1link', action.link, true);
        history.setValue('action1result', action.result, true);

        const head = history.toString();

        return content.trim() ? `${head}\n\n${content.trimStart()}` : head;
    }

    if (!action) {
        return content;
    }

    let max = 0;

    for (const key of template.getKeys()) {
        if (!key.toLowerCase().startsWith('action')) {
            continue;
        }

        const index = Number.parseInt(key.slice(6), 10);
        if (Number.isFinite(index)) {
            max = Math.max(max, index);
        }
    }

    for (let i = 1; i <= max; i++) {
        if (template.getValue(`action${i}link`)?.trim() === action.link) {
            return content;
        }
    }

    const index = max + 1,
        start = template.getAbsoluteIndex(),
        length = template.toString().length;

    template.setValue(`action${index}`, action.code, true);
    template.setValue(`action${index}date`, action.date, true);
    template.setValue(`action${index}link`, action.link, true);
    template.setValue(`action${index}result`, action.result, true);

    const updated = template.toString();

    return content.slice(0, start) + updated + content.slice(start + length);
};

/**
 * 解析已结案的评选讨论串
 *
 * @param content - 页面内容
 * @param revid - 页面版本号
 * @param archiveTitle - 当月存档页标题
 * @returns 已结案讨论串
 */
const parseClosedThreads = (content: string, revid: number, archiveTitle: string): ThreadInfo[] => {
    const root = Parser.parse(content),
        headings = root
            .querySelectorAll<Parser.HeadingToken>('heading')
            .filter(({ level }) => level === 2),
        threads: ThreadInfo[] = [];

    for (const heading of headings) {
        const section = heading.section();

        if (!section) {
            continue;
        }

        const title = heading.innerText.trim();

        if (title === CLAIM_HEADING) {
            console.log(`Skip ${title}: claim section.`);
            continue;
        }

        const start = heading.getAbsoluteIndex(),
            end = section.endIndex,
            text = content.slice(start, end),
            sectionRoot = Parser.parse(text),
            archiveTop = findTemplates(sectionRoot, 'archive top')[0],
            hasBottom = findTemplates(sectionRoot, 'archive bottom').length > 0;

        if (!archiveTop || !hasBottom) {
            console.log(`Skip ${title}: not closed.`);
            continue;
        }

        const article2 = findTemplates(sectionRoot, 'article2')[0],
            targets = resolveTargets(sectionRoot, article2),
            filtered = targets.filter(
                target => !sameTitle(target, TARGET) && !sameTitle(target, archiveTitle),
            ),
            code = parseActionType(sectionRoot, article2),
            result = parseResult(archiveTop),
            action =
                code && result
                    ? {
                          code,
                          result,
                          date: deriveDate(sectionRoot, text, archiveTop, result),
                          link: `Special:固定链接/${revid}#${title}`,
                      }
                    : undefined;

        threads.push({
            title,
            start,
            end,
            text,
            targets: filtered,
            action,
            body: buildBody(text),
        });

        console.log(`Archive ${title}: ${filtered.join(', ') || 'no target page'}.`);
    }

    return threads;
};

/**
 * 删除已归档段落
 *
 * @param content - 页面内容
 * @param threads - 已归档讨论串
 * @returns 剩余内容
 */
const removeThreads = (content: string, threads: ThreadInfo[]): string => {
    let discussion = content;

    for (const { start, end } of [...threads].sort((a, b) => b.start - a.start)) {
        discussion = discussion.slice(0, start) + discussion.slice(end);
    }

    const trimmed = normalizeHeadingSpacing(discussion).trimEnd();

    return content.endsWith('\n') ? `${trimmed}\n` : trimmed;
};

/**
 * 把讨论串写入各自的目标讨论页
 *
 * @param threads - 已归档讨论串
 */
const archiveToTalkPages = async (threads: ThreadInfo[]): Promise<void> => {
    const groups = new Map<string, ThreadInfo[]>();

    for (const thread of threads) {
        for (const target of thread.targets) {
            const group = groups.get(target);

            if (group) {
                group.push(thread);
            } else {
                groups.set(target, [thread]);
            }
        }
    }

    for (const [target, group] of groups) {
        const exists = await bot.checkExist(target);

        let content = '',
            revid: number | undefined;

        if (exists) {
            const page = await bot.getContent(target);
            content = page.content;
            revid = page.revid;
        }

        const blocks: string[] = [];
        let updated = content;

        for (const thread of group) {
            if (updated.includes(thread.body)) {
                console.log(`Skip ${target}: ${thread.title} already archived.`);
                continue;
            }

            if (!thread.action) {
                console.log(`Skip Article history for ${thread.title}: unknown type or result.`);
            }

            updated = updateArticleHistory(updated, thread.action);
            blocks.push(buildDestinationBlock(thread));
        }

        if (blocks.length === 0) {
            continue;
        }

        const base = updated.trimEnd(),
            text = base ? `${base}\n\n${blocks.join('\n\n')}\n` : `${blocks.join('\n\n')}\n`;

        await bot.edit({
            title: target,
            text,
            summary: SUMMARY,
            ...(revid !== undefined ? { baserevid: revid } : {}),
        });

        console.log(`Write ${target}: ${blocks.length} threads.`);
    }
};

(async () => {
    await run(
        { api, site: 'qw' },
        async () => {
            const { content, revid } = await bot.getContent(TARGET),
                currentTime = dayjs().tz(),
                archiveTitle = `${TARGET}/存档/${currentTime.format('YYYY年M月')}`,
                threads = parseClosedThreads(content, revid, archiveTitle);

            if (threads.length === 0) {
                console.log('No threads need to be archived.');
                return;
            }

            await archiveToTalkPages(threads);

            await archiveDiscussion(api, {
                target: TARGET,
                archiveTitle,
                discussion: removeThreads(content, threads),
                archive: threads.map(buildArchiveBlock).join('\n\n'),
                summary: SUMMARY,
                baserevid: revid,
            });

            console.log(`Archived ${threads.length} threads.`);
        },
        true,
    );
})();
