import type { QueryPage } from 'types-mediawiki-response';
import { BaseApi } from '@/utils';
import type { PageContent } from './types';

class GetContent extends BaseApi {
    /**
     * 获取页面内容与版本号
     * @param title - 页面标题
     * @returns 页面内容与版本号
     */
    get = async (title: string): Promise<PageContent> => {
        const pages = await this.queryPages<QueryPage<'revisions'>>({
            action: 'query',
            prop: 'revisions',
            rvprop: 'content|ids',
            titles: title,
        });
        const page = pages[0];
        const revision = page?.revisions?.[0];
        if (revision?.content === undefined || revision.revid === undefined) {
            throw new Error(`Failed to get content of ${title}: ${JSON.stringify(page ?? pages)}`);
        }
        return { content: revision.content, revid: revision.revid };
    };
}

export { GetContent };
