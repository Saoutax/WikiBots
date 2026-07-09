import { cloneDeep } from 'es-toolkit/object';
import type { MwApiParams } from 'wiki-saikou';
import Parser, { type TranscludeToken } from 'wikiparser-node';
import { vjpapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';
import { parseThread, parsedToString, dayjs } from '@/utils';

const bot = new BotInstance(api);

const getParsedThread = async () => {
    const content = await bot.getContent('Vocawiki:讨论版');
    return parseThread(content);
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'vjp', account: 'bot' });

    const discussionThread = await getParsedThread();

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
        const mar = parsedSection.querySelector<TranscludeToken>(
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

    const PAGE_MAP = {
        [`Vocawiki:讨论版/存档/${currentYear}`]: {
            content: archive ? `\n\n${archive}` : '',
            append: true,
        },
        'Vocawiki:讨论版': {
            content: newDiscussion,
            append: false,
        },
    };

    for (const [title, { content, append }] of Object.entries(PAGE_MAP)) {
        const params: MwApiParams = {
            action: 'edit',
            title,
            summary: '存档过期讨论串',
            minor: true,
            bot: true,
            tags: 'Bot',
            watchlist: 'nochange',
        };
        if (append) {
            params.appendtext = content;
        } else {
            params.text = content;
        }
        await api.postWithToken('csrf', params, {
            retry: 50,
            noCache: true,
        });
    }
    console.log('存档成功。');

    console.log(`End time: ${new Date().toISOString()}`);
})();
