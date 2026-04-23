import { BaseApi } from '@/utils';

class FlagDelete extends BaseApi {
    /**
     * 批量挂删页面
     * @param titles - 页面标题数组
     * @param reason - 挂删理由
     * @param user - 用户名
     * @param summary - 编辑摘要，默认为挂删理由
     * @returns 成功挂删的页面数组
     */
    del = async (titles: string[], reason: string, user: string, summary: string = reason) => {
        const result: string[] = [];
        await Promise.all(
            titles.map(async title => {
                const { data } = await this.api.postWithToken('csrf', {
                    action: 'edit',
                    title,
                    text: `<noinclude>{{即将删除|user=${user}|1=${reason}}}</noinclude>`,
                    summary,
                    tags: 'Bot',
                    bot: true,
                    minor: true,
                    nocreate: true,
                });
                if (data?.edit?.newtimestamp) {
                    result.push(title);
                }
            }),
        );
        return result;
    };
}

export { FlagDelete };
