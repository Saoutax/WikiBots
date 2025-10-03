export class QueryCategory {
    constructor(api) {
        this.api = api;
    }

    /**
     * 查询分类成员
     * @param {string|string[]} categories - 分类名或分类名数组
     * @param {boolean} [recursive=false] - 是否递归查询子分类
     * @returns {Promise<string[]>} - 分类下页面
     */
    async queryCat(categories, recursive = false) {
        categories = [].concat(categories);

        const visited = new Set();
        const results = new Set();

        for (const cat of categories) {
            await this._queryCategory(cat, recursive, visited, results);
        }

        return [...results];
    }

    /**
     * 递归查询分类
     * @private
     */
    async _queryCategory(cat, recursive, visited, results) {
        if (visited.has(cat)) {
            return;
        }
        visited.add(cat);

        let cmcontinue;
        do {
            const { data } = await this.api.post({
                action: 'query',
                list: 'categorymembers',
                cmtitle: cat,
                cmlimit: 'max',
                cmcontinue,
            }, { retry: 10 });

            const members = data?.query?.categorymembers || [];
            for (const member of members) {
                if (member.ns === 14 && recursive) {
                    await this._queryCategory(member.title, true, visited, results);
                } else {
                    results.add(member.title);
                }
            }

            cmcontinue = data?.continue?.cmcontinue;
        } while (cmcontinue);
    }
}

export default QueryCategory;