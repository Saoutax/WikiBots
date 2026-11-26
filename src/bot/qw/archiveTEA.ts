import { cloneDeep } from 'es-toolkit/object';
import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { BotInstance } from '@/lib';
import {
    dayjs,
    getLatestTimestamp,
    normalizeTemplateName,
    parsedToString,
    parseThread,
} from '@/utils';
import { archiveDiscussion } from '../modules';

const bot = new BotInstance(api);

const MESSAGE_TARGET = 'Qiuwen_talk:茶馆/消息',
    INACTIVE_DAYS = 7,
    MOVED_DAYS = 3;

/** Template:移动至 及其重定向 */
const MOVED_TEMPLATE_NAMES = new Set(
    ['移动至', '移動至', 'Movedto', 'Moveto', 'Moved to', 'Switchto', '已移动至', '已移動至'].map(
        normalizeTemplateName,
    ),
);

/**
 * 取章节中仅有的移动通知模板
 *
 * 空白与注释不计入正文；模板之外还有内容时返回 undefined。
 *
 * @param content - 章节正文（不含标题）
 * @returns 仅含移动模板时返回这些模板，否则返回 undefined
 */
const getMovedTemplates = (content: string): Parser.TranscludeToken[] | undefined => {
    const templates: Parser.TranscludeToken[] = [];

    for (const child of Parser.parse(content).childNodes) {
        if (child.type === 'comment') {
            continue;
        }
        if (child.type === 'text') {
            if (child.text().trim() === '') {
                continue;
            }
            return undefined;
        }
        if (
            child.type !== 'template' ||
            !MOVED_TEMPLATE_NAMES.has(normalizeTemplateName(child.name ?? ''))
        ) {
            return undefined;
        }
        templates.push(child as Parser.TranscludeToken);
    }

    return templates.length ? templates : undefined;
};

/**
 * 取移动通知的签名文本
 *
 * @param templates - 章节中仅有的移动模板
 * @returns 各模板签名拼接后的文本，没有签名时返回空字符串
 */
const getMovedSign = (templates: Parser.TranscludeToken[]): string =>
    templates
        .map(template => template.getValue('sign') ?? template.getValue(11))
        .filter((sign): sign is string => sign !== undefined)
        .join('\n');

const main = async (targets: string[]) => {
    const currentTime = dayjs().tz(),
        currentMonth = dayjs().tz().format('YYYY年MM月');

    const makeArchiveTitle = (text: string) => {
        const idx = text.lastIndexOf('/') + 1;
        return `${text.slice(0, idx)}存档/${text.slice(idx)}/${currentMonth}`;
    };

    for (const target of targets) {
        const { content: pageContent, revid } = await bot.getContent(target);
        const discussionThread = parseThread(pageContent);

        let archive = '';
        const newDiscussion = cloneDeep(discussionThread);

        const removeIndices: number[] = [];

        for (const [i, { thread, content, timestamp }] of discussionThread.sections.entries()) {
            if (target === MESSAGE_TARGET) {
                if (timestamp && currentTime.diff(timestamp, 'day') >= INACTIVE_DAYS) {
                    archive += thread;
                    removeIndices.push(i);
                }
                continue;
            }
            const movedTemplates = getMovedTemplates(content);
            if (movedTemplates) {
                const movedTime = getLatestTimestamp(getMovedSign(movedTemplates));
                if (!movedTime || currentTime.diff(movedTime, 'day') >= MOVED_DAYS) {
                    archive += thread;
                    removeIndices.push(i);
                }
                continue;
            }
            const mar = Parser.parse(content).querySelector<Parser.TranscludeToken>(
                'template:is(#Template:MarkAsResolved, #Template:正在公示, #Template:讨论结束)',
            );
            if (!mar) {
                continue;
            }
            const time = dayjs(mar.getValue('time')),
                day = Number.isFinite(Number(mar.getValue('days')))
                    ? Number(mar.getValue('days'))
                    : 3;
            if (time && dayjs(currentTime).diff(time, 'day') >= day) {
                archive += thread;
                removeIndices.push(i);
            }
        }

        for (const i of removeIndices.reverse()) {
            newDiscussion.sections.splice(i, 1);
        }

        if (!archive) {
            continue;
        }

        const archiveTitle = makeArchiveTitle(target);
        await archiveDiscussion(api, {
            target,
            archiveTitle,
            discussion: parsedToString(newDiscussion),
            archive,
            summary: '机器人：存档讨论',
            baserevid: revid,
        });
        console.log(`Archived: ${target} → ${archiveTitle}`);
    }
};

(async () => {
    await run(
        { api, site: 'qw' },
        async () => {
            await main([
                'Qiuwen_talk:茶馆/编辑',
                'Qiuwen_talk:茶馆/其他',
                'Qiuwen_talk:茶馆/方针',
                MESSAGE_TARGET,
            ]);
        },
        true,
    );
})();
