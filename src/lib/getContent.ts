import { BaseApi } from '@/utils';
import type { PageContent } from './types';

interface MWPage {
    title: string;
    revisions?: { content: string; revid: number }[];
}

class GetContent extends BaseApi {
    /**
     * 获取页面内容与版本号
     * @param title - 页面标题
     * @returns 页面内容与版本号
     */
    get = async (title: string): Promise<PageContent> => {
        const pages = await this.queryPages<MWPage>({
            action: 'query',
            prop: 'revisions',
            rvprop: 'content|revid',
            titles: title,
        });
        const revision = pages[0]?.revisions?.[0];
        if (!revision) {
            throw new Error(`Failed to get content of ${title}.`);
        }
        return { content: revision.content, revid: revision.revid };
    };
}

export { GetContent };
