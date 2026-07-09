import Parser, { type TranscludeToken } from 'wikiparser-node';
import { qwapi as api, Login } from '@/api';
import data from '@/config/status_data.json';
import { BotInstance } from '@/lib';
import { dayjs, getLatestTimestamp } from '@/utils';

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
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'qw', account: 'bot' });

    const target = 'Qiuwen_talk:条目署名申请';

    const parsed = parseSignatureRequests(await bot.getContent(target));
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

    const currentTime = dayjs().tz();

    const remaining = parsed.requests.filter(request => {
        const root = Parser.parse(request),
            template = root.querySelector<TranscludeToken>('template#Template:Status')!,
            status = template.getValue('1');
        if (
            status &&
            allowList.includes(status) &&
            dayjs(currentTime).diff(getLatestTimestamp(request), 'day') >= 3
        ) {
            archiveArr.push(request);
            return false;
        }
        return true;
    });

    if (archiveArr.length > 0) {
        const discussion = `${parsed.preface}\n` + remaining.join('');
        const archive = archiveArr.join('');

        const archiveTitle = `${target}/存档/${currentTime.format('YYYY年')}`;
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
