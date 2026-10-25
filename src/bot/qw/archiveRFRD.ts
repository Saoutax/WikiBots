import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { dayjs, getLatestTimestamp } from '@/utils';
import { archiveDiscussion, statusList } from '../modules';

const bot = new BotInstance(api);

interface RevdelRequests {
    preface: string;
    requests: string[];
}

const parseRevdelRequests = (text: string): RevdelRequests => {
    const root = Parser.parse(text);
    const headings = root.querySelectorAll('heading');
    const reportHeading = headings.find(h => h.level === 2 && h.innerText === '提报区域');

    if (!reportHeading) {
        return { preface: text, requests: [] };
    }

    const headingEnd = reportHeading.getAbsoluteIndex() + reportHeading.toString().length;
    const section = reportHeading.section();

    if (!section) {
        return { preface: text.slice(0, headingEnd), requests: [] };
    }

    const revdelPositions = root
        .querySelectorAll('template')
        .filter(t => t.name.endsWith('Revdel'))
        .map(t => t.getAbsoluteIndex())
        .filter(idx => idx >= section.startIndex && idx < section.endIndex)
        .sort((a, b) => a - b);

    const positions = [...revdelPositions, section.endIndex];

    return {
        preface: text.slice(0, headingEnd),
        requests: positions.slice(0, -1).map((pos, i) => text.slice(pos, positions[i + 1]!)),
    };
};

(async () => {
    await run({ api, site: 'qw' }, async () => {
        const target = 'Qiuwen_talk:版本删除提报';

        const { content, revid } = await bot.getContent(target);
        const parsed = parseRevdelRequests(content);
        const archiveArr: string[] = [];

        const currentTime = dayjs().tz();

        const remaining = parsed.requests.filter(request => {
            const root = Parser.parse(request),
                template = root.querySelector<Parser.TranscludeToken>('template#Template:Revdel')!,
                status = template.getValue('status');
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
