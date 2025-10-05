/**
 * 分割数组
 * @param {Array} arr - 原数组
 * @returns {Array[]} - 分割后的数组
 */
function chunk(arr, size = 500) {
    const res = [];
    for (let i = 0; i < arr.length; i += size) {
        res.push(arr.slice(i, i + size));
    }
    return res;
}

export class CheckGlobalUsage {
    constructor(api) {
        this.api = api;
    }

    /**
     * 检查文件是否有全域使用
     * @param {string|string[]} input - 文件名或文件名数组
     * @returns {Promise<boolean|Object<string, boolean>>} - 单文件返回 boolean，多文件返回对象
     */
    async check(input) {
        const isSingle = typeof input === 'string';
        const titles = isSingle ? [input] : input;

        try {
            const results = await Promise.all(
                chunk(titles).map(async group => {
                    const chunkResult = new Map(group.map(t => [t, false]));
                    let gucontinue;

                    do {
                        const res = await this.api.post({
                            action: 'query',
                            prop: 'globalusage',
                            titles: group.join('|'),
                            ...(gucontinue ? { gucontinue } : {}),
                            gulimit: 'max'
                        });

                        for (const page of Object.values(res?.data?.query?.pages || {})) {
                            if (page.globalusage?.length) {
                                chunkResult.set(page.title, true);
                            }
                        }

                        gucontinue = res?.data?.continue?.gucontinue;
                    } while (gucontinue);

                    return Object.fromEntries(chunkResult);
                })
            );

            const result = Object.assign({}, ...results);
            return isSingle ? result[input] : result;
        } catch (err) {
            console.error('CheckGlobalUsage error:', err);
            return isSingle ? false : Object.fromEntries(titles.map(t => [t, true]));
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
     * @returns {Promise<boolean|Object<string, boolean>>} - 单个查询返回 boolean，批量查询返回对象
     */
    async check(input) {
        const isSingle = typeof input === 'string';
        const titles = isSingle ? [input] : input;

        try {
            const results = await Promise.all(
                chunk(titles).map(async group => {
                    const res = await this.api.post({
                        action: 'query',
                        prop: 'info',
                        titles: group.join('|')
                    });

                    const pages = res?.data?.query?.pages || {};
                    return Object.fromEntries(
                        Object.values(pages).map(p => [p.title, 'redirect' in p])
                    );
                })
            );

            const result = Object.assign({}, ...results);
            return isSingle ? result[input] : result;

        } catch (err) {
            console.error('CheckRedirect error:', err);
            return isSingle ? false : Object.fromEntries(titles.map(t => [t, false]));
        }
    }
}
