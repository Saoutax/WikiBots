export class FlagDelete {
    constructor(api) {
        this.api = api;
    }

    /**
     * 挂删页面
     * @param {string|string[]} input - 页面标题或标题数组
     * @param {string} reason - 挂删理由
     * @param {string} summary - 编辑摘要
     */
    async flagDelete(page, reason, summary) {
        const flagDel = async (title) => {
            try {
                const del = await this.api.postWithToken('csrf',{
                    action: 'edit',
                    title,
                    text: `<noinclude>{{即将删除|user=机娘亚衣琴|1=${reason}}}</noinclude>`,
                    summary,
                    tags: 'Bot',
                    bot: true,
                    minor: true
                });

                if (del?.error?.code === 'badtoken') {
                    await this.api.getToken('csrf', true);
                    return await flagDel(title);
                }
            } catch (err) {
                console.error(`挂删失败（${title}）：`, err);
            }
        };

        if (Array.isArray(page)) {
            return await Promise.all(page.map(title => flagDel(title)));
        } else {
            return await flagDel(page);
        }
    }
}

export default FlagDelete;