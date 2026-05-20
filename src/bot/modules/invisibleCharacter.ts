import { BotInstance } from '@/lib';
import { dayjs } from '@/utils';
import { BaseApi } from '@/utils';
import { getTimeData, updateTimeData } from '@/utils';

interface PageMap {
    title: string;
    pageid: number;
}

class InvisibleCharacter extends BaseApi {
    main = async (name: string, config?: string) => {
        const now = dayjs().tz(),
            rcstart = now.toISOString(),
            rcend = await getTimeData(name);

        const bot = new BotInstance(this.api);

        const pageids: number[] = [];
        if (config) {
            const result = await bot.getJson<{ pageids: number[] }>(config);
            pageids.push(...(result?.pageids ?? []));
        }

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
            if (pageids.length === 0 || !pageids.includes(pageid)) {
                pages.add(title);
            }
        });

        if (pages.size > 0) {
            const content = await bot.batchQuery([...pages]),
                bmpInvisible = /[\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206E\u3164\uFEFF]+/gu,
                variationSelectors = /[\uFE00-\uFE0F]+/gu,
                astralInvisible = /[\u{E0100}-\u{E01EF}]+/gu,
                hasInvisible = (text: string) =>
                    bmpInvisible.test(text) ||
                    variationSelectors.test(text) ||
                    astralInvisible.test(text),
                removeInvisible = (text: string) =>
                    text
                        .replace(bmpInvisible, '')
                        .replace(variationSelectors, '')
                        .replace(astralInvisible, ''),
                result: Record<string, string> = {};
            for (const [title, text] of Object.entries(content)) {
                if (hasInvisible(text)) {
                    result[title] = removeInvisible(text);
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
