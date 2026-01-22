class FlagDelete {
    constructor(api) {
        this.api = api;
    }

    /**
     * 挂删页面
     * @param {string|string[]} input - 页面标题或标题数组
     * @param {string} reason - 挂删理由
     * @param {string} user - 用户名
     * @param {string} [summary=reason] - 编辑摘要，默认为挂删理由
     * @returns {Promise<string[]|void>} - 成功挂删的页面数组
     */
    async flagDelete(page, reason, user, summary = reason) {
        const successList = [];
        const flagDel = async title => {
            try {
                const { data } = await this.api.postWithToken("csrf", {
                    action: "edit",
                    title,
                    text: `<noinclude>{{即将删除|user=${user}|1=${reason}}}</noinclude>`,
                    summary,
                    tags: "Bot",
                    bot: true,
                    minor: true,
                });
                if (data?.error?.code === "badtoken") {
                    await this.api.getToken("csrf", true);
                    return await flagDel(title);
                }
                if (data?.edit?.newtimestamp) {
                    successList.push(title);
                }
            } catch (err) {
                console.error(`挂删失败（${title}）：`, err);
            }
        };

        if (Array.isArray(page)) {
            await Promise.all(page.map(flagDel));
        } else {
            await flagDel(page);
        }

        return successList;
    }
}

export default FlagDelete;
