import Parser, { type TranscludeToken } from 'wikiparser-node';
import { qwapi as api, Login } from '@/api';
import data from '@/config/status_data.json';
import { BotInstance } from '@/lib';
import { dayjs } from '@/utils';

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
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'qw', account: 'bot' });

    const target = 'Qiuwen_talk:版本删除提报';

    const parsed = parseRevdelRequests(await bot.getContent(target));
    const archiveArr: string[] = [];

    const allowList = [
        ...new Set([
            ...data.done.status,
            ...data.nd.status,
            ...data.wd.status,
            ...data.ad.status,
            ...data.rd.status,
        ]),
    ];

    const remaining = parsed.requests.filter(request => {
        const root = Parser.parse(request),
            template = root.querySelector<TranscludeToken>('template#Template:Revdel')!,
            status = template.getValue('status');
        if (status && allowList.includes(status)) {
            archiveArr.push(request);
            return false;
        }
        return true;
    });

    if (archiveArr.length > 0) {
        const discussion = `${parsed.preface}\n` + remaining.join('');
        const archive = archiveArr.join('');

        const archiveTitle = `${target}/存档/${dayjs().tz().format('YYYY年')}`;
        const append = await bot.checkExist(archiveTitle);
        const params = {
            action: 'edit',
            summary: '机器人：存档讨论',
            minor: true,
            bot: true,
        };
        await Promise.all([
            api.postWithToken('csrf', {
                ...params,
                title: target,
                text: discussion,
            }),
            api.postWithToken('csrf', {
                ...params,
                title: archiveTitle,
                ...(append
                    ? { appendtext: `\n\n${archive}` }
                    : { text: `{{talkarchive}}\n\n${archive}` }),
            }),
        ]);
        console.log('Successfully archived.');
    } else {
        console.log('No threads need to be archived.');
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
