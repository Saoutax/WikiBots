import type { ApiQueryResponseWithResult, InfoPage, QueryPage } from 'types-mediawiki-response';
import { createRateLimiter } from '@/infra';
import { BaseApi, BotInstance } from '@/lib';

interface PageMap {
    [title: string]: {
        content: string;
        summary: string;
    };
}

class CleanSandbox extends BaseApi {
    #bot = new BotInstance(this.api);

    main = async (pageMap: PageMap): Promise<void> => {
        const {
            data: {
                query: { pages = [] },
            },
        } = await this.api.post<
            ApiQueryResponseWithResult & {
                query: { pages?: (QueryPage<'revisions'> & InfoPage)[] };
            }
        >({
            prop: 'revisions|info',
            titles: Object.keys(pageMap),
            rvprop: 'timestamp|ids',
            inprop: 'touched',
        });
        const limiter = createRateLimiter();
        await limiter.map(pages, async ({ title, revisions, touched }) => {
            const rev = revisions?.[0];
            if (!title || !rev) {
                return;
            }
            const minutes =
                (Date.now() - new Date(touched || rev.timestamp || 0).getTime()) / 60000;
            if (minutes > 180) {
                await this.#bot.edit({
                    title,
                    text: pageMap[title]!.content,
                    ...(rev.revid !== undefined ? { baserevid: rev.revid } : {}),
                    summary: pageMap[title]!.summary,
                    tags: 'Bot',
                });
                console.log('Success.');
            } else {
                console.log(`${title} 在 ${minutes.toFixed(1)} 分钟前存在编辑，跳过。`);
            }
        });
    };
}

export { CleanSandbox };
