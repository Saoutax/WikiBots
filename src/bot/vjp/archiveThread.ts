import { cloneDeep } from 'es-toolkit/object';
import Parser from 'wikiparser-node';
import { vjpapi as api } from '@/api';
import { dayjs } from '@/infra';
import { BotInstance } from '@/lib';
import { run } from '@/runner';
import { normalizeTemplateName, parsedToString, parseThread } from '@/wikitext';

const bot = new BotInstance(api);

/**
 * 判断章节正文是否仅包含 Template:Movedto 模板（忽略空白与 HTML 注释）
 *
 * @param content - 章节正文（不含标题行）
 */
const isOnlyMovedto = (content: string): boolean => {
    let hasTemplate = false;
    for (const child of Parser.parse(content).childNodes) {
        if (child.type === 'comment') {
            continue;
        }
        if (child.type === 'text') {
            if (child.text().trim() === '') {
                continue;
            }
            return false;
        }
        if (child.type !== 'template' || normalizeTemplateName(child.name ?? '') !== 'movedto') {
            return false;
        }
        hasTemplate = true;
    }
    return hasTemplate;
};

const getParsedThread = async () => {
    const { content, revid } = await bot.getContent('Vocawiki:讨论版');
    return { thread: parseThread(content), revid };
};

(async () => {
    await run(
        { api, site: 'vjp' },
        async () => {
            const { thread: discussionThread, revid } = await getParsedThread();

            const currentTime = dayjs().tz().format('YYYYMMDD'),
                currentYear = dayjs().tz().format('YYYY年');

            let archive = '';
            const discussion = cloneDeep(discussionThread);
            discussion.sections = discussion.sections.filter(section => {
                const parsedSection = Parser.parse(section.thread);
                const saved = parsedSection.querySelector('template#Template:Saved');
                if (saved && dayjs().tz().day() === 1) {
                    console.log(`周一移除已存档讨论串：${section.title}`);
                    return false;
                }
                const mar = parsedSection.querySelector<Parser.TranscludeToken>(
                    'template#Template:MarkAsResolved',
                );
                let shouldArchive = isOnlyMovedto(section.content);
                if (!shouldArchive && mar) {
                    const longerType = ['s', 'suspended', 'n', 'noreply'],
                        defaultOffset = longerType.includes(mar.getValue().status!) ? 10 : 3,
                        offset = Number(mar.getValue()['archive-offset'] || defaultOffset);
                    const archiveTime = dayjs(mar.getValue().time, 'YYYYMMDD')
                        .tz()
                        .add(offset, 'day')
                        .format('YYYYMMDD');
                    shouldArchive = currentTime >= archiveTime;
                } else if (
                    !shouldArchive &&
                    !mar &&
                    dayjs(currentTime).diff(dayjs(section.timestamp), 'day') >= 10
                ) {
                    shouldArchive = true;
                }
                if (shouldArchive) {
                    archive += section.thread;
                    section.thread = `== ${section.title} ==\n{{Saved|link=Vocawiki:讨论版/存档/${currentYear}|title=${section.title}}}\n\n`;
                    console.log(`存档讨论串：${section.title}`);
                }
                return true;
            });

            const newDiscussion = parsedToString(discussion);

            await bot.edit({
                title: `Vocawiki:讨论版/存档/${currentYear}`,
                appendtext: archive ? `\n\n${archive}` : '',
                summary: '存档过期讨论串',
                tags: 'Bot',
            });
            await bot.edit({
                title: 'Vocawiki:讨论版',
                text: newDiscussion,
                baserevid: revid,
                summary: '存档过期讨论串',
                tags: 'Bot',
            });
            console.log('存档成功。');
        },
        true,
    );
})();
