import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import _ from 'lodash';
import type { MwApiParams } from 'wiki-saikou';
import Parser, { type TranscludeToken } from 'wikiparser-node';
import { vjpapi as api, Login } from '@/api';
import { parseThread } from '@/utils';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.tz.setDefault('Asia/Shanghai');

async function getParsedThread() {
    const {
        data: {
            query: {
                pages: [
                    {
                        revisions: [{ content }],
                    },
                ],
            },
        },
    } = await api.get({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        titles: 'Vocawiki:讨论版',
    });

    return parseThread(content);
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'vjp', account: 'bot' });

    const discussionThread = await getParsedThread();

    const currentTime = dayjs().tz().format('YYYYMMDD'),
        currentYear = dayjs().tz().format('YYYY年');

    let archive = '';
    const discussion = _.cloneDeep(discussionThread);
    Object.entries(discussionThread)
        .filter(([key]) => !isNaN(Number(key)))
        .sort(([a], [b]) => Number(a) - Number(b))
        .forEach(([key, value]) => {
            const numKey = Number(key);
            const parsedThread = Parser.parse(value.thread);
            const saved = parsedThread.querySelector('template#Template:Saved');
            if (saved && dayjs().tz().day() === 1) {
                delete discussion[Number(key)];
                console.log(`周一移除已存档讨论串：${value.title}`);
            }
            const mar = parsedThread.querySelector<TranscludeToken>(
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
                    discussion[numKey]!.content =
                        `== ${value.title} ==\n{{Saved|link=Vocawiki:讨论版/存档/${currentYear}|title=${value.title}}}\n\n`;
                    archive += discussionThread[numKey]!.content;
                    console.log(`存档讨论串：${value.title}`);
                }
            }
            if (!mar && Math.abs(dayjs(currentTime).diff(dayjs(value.timestamp), 'day')) >= 10) {
                discussion[numKey]!.content =
                    `== ${value.title} ==\n{{Saved|link=Vocawiki:讨论版/存档/${currentYear}|title=${value.title}}}\n\n`;
                archive += discussionThread[numKey]!.content;
                console.log(`存档讨论串：${value.title}`);
            }
        });

    const newDiscussion =
        discussion.preface +
        Object.keys(discussion)
            .filter(k => k !== 'preface')
            .sort((a, b) => Number(a) - Number(b))
            .map(k => discussion[Number(k)]!.content)
            .join('');

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
