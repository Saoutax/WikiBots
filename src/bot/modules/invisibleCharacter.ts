import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { BotInstance } from '@/lib';
import { BaseApi } from '@/utils';
import { getTimeData, updateTimeData } from '@/utils';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

interface PageMap {
    title: string;
    pageid: number;
}

class InvisibleCharacter extends BaseApi {
    main = async (config: string, name: string) => {
        const now = dayjs().tz(),
            rcstart = now.toISOString(),
            rcend = await getTimeData(name);

        const bot = new BotInstance(this.api);

        const { pageids } = await bot.getJson<{ pageids: number[] }>(config);

        const {
            data: {
                query: { recentchanges },
            },
        } = await this.api.post({
            action: 'query',
            list: 'recentchanges',
            rcstart,
            rcend,
            rctag: 'invisibleCharacter',
            rclimit: 'max',
        });

        const pages = new Set<string>();
        (recentchanges as PageMap[]).forEach(({ title, pageid }) => {
            if (!pageids.includes(pageid)) {
                pages.add(title);
            }
        });

        if (pages.size > 0) {
            const content = await bot.batchQuery([...pages]),
                regex =
                    // oxlint-disable-next-line no-misleading-character-class
                    /[\u180E\u2005-\u200F\u2028-\u202F\u205F\u2060-\u206E\u3164\uFE00-\uFE0F\uFEFF\u{E0100}-\u{E01EF}]+/gu,
                result: Record<string, string> = {};
            for (const [title, text] of Object.entries(content)) {
                const newContent = text.replace(regex, '');
                if (newContent !== text) {
                    result[title] = newContent;
                }
            }

            await Promise.all(
                Object.entries(result).map(async ([title, text]) => {
                    await this.api.postWithToken('csrf', {
                        action: 'edit',
                        title,
                        text,
                        summary: '移除不可见字符',
                        tags: 'Bot',
                        minor: true,
                        bot: true,
                    });
                    console.log(`Done: ${title}`);
                }),
            );
        } else {
            console.log('No page need to process.');
        }

        await updateTimeData(name, rcstart);
    };
}

export { InvisibleCharacter };
