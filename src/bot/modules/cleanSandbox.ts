import { BaseApi } from '@/utils';

interface PageMap {
    [title: string]: {
        content: string;
        summary: string;
    };
}

interface Pages {
    title: string;
    revisions: [
        {
            timestamp: string;
        },
    ];
    touched: string;
}

class CleanSandbox extends BaseApi {
    main = async (pageMap: PageMap) => {
        const {
            data: {
                query: { pages },
            },
        } = await this.api.post({
            prop: 'revisions|info',
            titles: Object.keys(pageMap),
            rvprop: 'timestamp|content',
            inprop: 'touched',
        });
        await Promise.all(
            (pages as Pages[]).map(async ({ title, revisions: [{ timestamp }], touched }) => {
                const minutes = (Date.now() - new Date(touched || timestamp).getTime()) / 60000;
                if (minutes > 180) {
                    await this.api
                        .postWithToken('csrf', {
                            action: 'edit',
                            title,
                            text: pageMap[title]!.content,
                            summary: pageMap[title]!.summary,
                            minor: true,
                            bot: true,
                            tags: 'Bot',
                            watchlist: 'nochange',
                        })
                        .then(data => {
                            console.log(data);
                        });
                } else {
                    console.log(`${title} 在 ${minutes.toFixed(1)} 分钟前存在编辑，跳过。`);
                }
            }),
        );
    };
}

export { CleanSandbox };
