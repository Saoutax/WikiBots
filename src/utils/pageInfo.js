export class CheckGlobalUsage {
    constructor(api) {
        this.api = api;
    }

    /**
     * 检查文件是否有全域使用（支持单个或多个文件）
     * @param {string|string[]} input - 文件名或文件名数组
     * @returns {Promise<boolean|Object<string, boolean>>} - 单文件返回 boolean，多文件返回对象
     */
    async check(input) {
        const isSingle = typeof input === 'string';
        const titles = isSingle ? [input] : input;

        try {
            const res = await this.api.get({
                action: 'query',
                titles: titles.join('|'),
                prop: 'globalusage',
                gulimit: 500
            });

            const pages = res?.data?.query?.pages || {};
            const result = Object.fromEntries(
                titles.map(t => {
                    const page = Object.values(pages).find(p => p.title === t);
                    return [t, (page?.globalusage?.length ?? 0) > 0];
                })
            );

            return isSingle ? result[input] : result;
        } catch (err) {
            console.error('CheckGlobalUsage error:', err);
            return isSingle ? false : Object.fromEntries(titles.map(t => [t, false]));
        }
    }
}


export class CheckRedirect {
    constructor(api) {
        this.api = api;
    }

    /**
     * 检查页面是否为重定向页面
     * @param {string|string[]} input - 单个页面标题或页面标题数组
     * @returns {Promise<boolean|Object>} - 单个查询返回 boolean，批量查询返回 {标题: 是否重定向} 对象
     */
    async check(input) {
        const isSingle = typeof input === 'string';
        const titles = isSingle ? [input] : input;

        try {
            const res = await this.api.get({
                action: 'query',
                titles: titles.join('|'),
                prop: 'info'
            });

            const pages = res?.data?.query?.pages || {};
            const result = Object.fromEntries(
                titles.map(t => {
                    const page = Object.values(pages).find(p => p.title === t);
                    return [t, page ? ('redirect' in page) : false];
                })
            );

            return isSingle ? result[input] : result;

        } catch (err) {
            console.error('CheckRedirect error:', err);
            return isSingle ? false : Object.fromEntries(titles.map(t => [t, false]));
        }
    }
}
