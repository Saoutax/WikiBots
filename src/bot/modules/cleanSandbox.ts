import { EditPage } from '@/lib/edit';
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
            revid: number;
        },
    ];
    touched: string;
}

class CleanSandbox extends BaseApi {
    #edit = new EditPage(this.api);

    main = async (pageMap: PageMap) => {
        const {
            data: {
                query: { pages },
            },
        } = await this.api.post<{ query: { pages: Pages[] } }>({
            prop: 'revisions|info',
            titles: Object.keys(pageMap),
            rvprop: 'timestamp|revid',
            inprop: 'touched',
        });
        await Promise.all(
            pages.map(async ({ title, revisions: [{ timestamp, revid }], touched }) => {
                const minutes = (Date.now() - new Date(touched || timestamp).getTime()) / 60000;
                if (minutes > 180) {
                    await this.#edit.edit({
                        title,
                        text: pageMap[title]!.content,
                        baserevid: revid,
                        summary: pageMap[title]!.summary,
                        tags: 'Bot',
                    });
                    console.log('Success.');
                } else {
                    console.log(`${title} 在 ${minutes.toFixed(1)} 分钟前存在编辑，跳过。`);
                }
            }),
        );
    };
}

export { CleanSandbox };
