import { cloneDeep } from 'es-toolkit/object';
import Parser from 'wikiparser-node';
import { run, vjpapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { parseThread, parsedToString, dayjs } from '@/utils';

const bot = new BotInstance(api);

const getParsedThread = async () => {
    const { content, revid } = await bot.getContent('Vocawiki:讨论版');
    return { thread: parseThread(content), revid };
};

(async () => {
    await run({ api, site: 'vjp' }, async () => {
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
            if (mar) {
                const longerType = ['s', 'suspended', 'n', 'noreply'],
                    defaultOffset = longerType.includes(mar.getValue().status!) ? 10 : 3,
                    offset = Number(mar.getValue()['archive-offset'] || defaultOffset);
                const archiveTime = dayjs(mar.getValue().time, 'YYYYMMDD')
                    .tz()
                    .add(offset, 'day')
                    .format('YYYYMMDD');
                if (currentTime >= archiveTime) {
                    archive += section.thread;
                    section.thread = `== ${section.title} ==\n{{Saved|link=Vocawiki:讨论版/存档/${currentYear}|title=${section.title}}}\n\n`;
                    console.log(`存档讨论串：${section.title}`);
                }
                return true;
            }
            if (!mar && dayjs(currentTime).diff(dayjs(section.timestamp), 'day') >= 10) {
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
    });
})();
