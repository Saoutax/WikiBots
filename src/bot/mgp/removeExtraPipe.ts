import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { MwApiResponse } from 'wiki-saikou';
import Parser, { type LinkToken } from 'wikiparser-node';
import { zhapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';
import { getTimeData, updateTimeData } from '@/utils';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

const now = dayjs.utc(),
    rcstart = now.toISOString(),
    rcend = await getTimeData('removeExtraPipe');

const getPages = async () => {
    const titles = new Set<string>();
    let cont;
    do {
        const { data } = (await api.post({
            format: 'json',
            list: 'recentchanges',
            formatversion: '2',
            rcstart,
            rcend,
            rcnamespace: '0|10', // (main), Template
            rclimit: 'max',
            rccontinue: cont,
        })) as MwApiResponse;
        const list = data?.query?.recentchanges;
        if (!list?.length) {
            break;
        }
        for (const pages of list) {
            titles.add(pages.title);
        }
        cont = data.continue?.rccontinue;
    } while (cont);
    return [...titles];
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'zh', account: 'bot' });

    const bot = new BotInstance(api);

    const pages = await getPages(),
        pageContent = await bot.batchQuery(pages);

    const modify: Record<string, string> = {};
    for (const [title, content] of Object.entries(pageContent)) {
        const parsed = Parser.parse(content),
            links = parsed.querySelectorAll<LinkToken>('link');
        for (const link of links) {
            // 暂时忽略带有锚点#的情况
            if (link.length === 1 || link.fragment) {
                continue;
            }
            const { innerText } = link,
                newLink = link.normalizeTitle(innerText);
            if (newLink.valid && !newLink.fragment && newLink.title === link.link.title) {
                link.link = innerText;
                link.innerText = undefined as unknown as string;
            }
        }

        const newContent = parsed.toString();
        if (newContent !== content) {
            modify[title] = newContent;
        }
    }

    for (const [title, text] of Object.entries(modify)) {
        await api.postWithToken('csrf', {
            action: 'edit',
            title,
            text,
            summary: '移除多余管道符',
            bot: true,
            minor: true,
            tags: 'Bot',
        });
        console.log(`√ ${title}`);
    }

    await updateTimeData('removeExtraPipe', rcstart);

    console.log(`End time: ${new Date().toISOString()}`);
})();
