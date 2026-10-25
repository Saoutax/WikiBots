import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { dayjs, getLatestTimestamp } from '@/utils';
import { archiveDiscussion, statusList } from '../modules';

const bot = new BotInstance(api);

interface ParsedResult {
    preface: string;
    requests: string[];
}

const parseSignatureRequests = (text: string): ParsedResult => {
    const root = Parser.parse(text);
    const headings = root.querySelectorAll('heading');
    const targetHeading = headings.find(h => h.level === 2 && h.innerText === '条目署名申请');

    if (!targetHeading) {
        return { preface: text, requests: [] };
    }

    const headingEnd = targetHeading.getAbsoluteIndex() + targetHeading.toString().length;

    const h3Headings = headings.filter(h => h.level === 3 && h.getAbsoluteIndex() >= headingEnd);

    return {
        preface: text.slice(0, headingEnd),
        requests: h3Headings
            .map(h => {
                const sec = h.section();
                return sec ? text.slice(sec.startIndex, sec.endIndex) : '';
            })
            .filter(Boolean),
    };
};

(async () => {
    await run({ api, site: 'qw' }, async () => {
        const target = 'Qiuwen_talk:条目署名申请';

        const { content, revid } = await bot.getContent(target);
        const parsed = parseSignatureRequests(content);
        const archiveArr: string[] = [];

        const currentTime = dayjs().tz();

        const remaining = parsed.requests.filter(request => {
            const root = Parser.parse(request),
                template = root.querySelector<Parser.TranscludeToken>('template#Template:Status')!,
                status = template.getValue('1');
            if (
                status &&
                statusList.includes(status) &&
                dayjs(currentTime).diff(getLatestTimestamp(request), 'day') >= 3
            ) {
                archiveArr.push(request);
                return false;
            }
            return true;
        });

        if (archiveArr.length > 0) {
            await archiveDiscussion(api, {
                target,
                archiveTitle: `${target}/存档/${currentTime.format('YYYY年')}`,
                discussion: `${parsed.preface}\n` + remaining.join(''),
                archive: archiveArr.join(''),
                summary: '机器人：存档讨论',
                baserevid: revid,
            });
            console.log('Successfully archived.');
        } else {
            console.log('No threads need to be archived.');
        }
    });
})();
