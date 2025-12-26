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
        const isSingle = typeof input === "string";
        const titles = isSingle ? [input] : input;

        try {
            const results = await Promise.all(
                chunk(titles).map(async group => {
                    const chunkResult = new Map(group.map(t => [t, false]));
                    let gucontinue;

                    do {
                        const res = await this.api.post({
                            action: "query",
                            prop: "globalusage",
                            titles: group.join("|"),
                            ...(gucontinue ? { gucontinue } : {}),
                            gulimit: "max",
                        });

                        for (const page of Object.values(res?.data?.query?.pages || {})) {
                            if (page.globalusage?.length) {
                                chunkResult.set(page.title, true);
                            }
                        }

                        gucontinue = res?.data?.continue?.gucontinue;
                    } while (gucontinue);

                    return Object.fromEntries(chunkResult);
                }),
            );

            const result = Object.assign({}, ...results);
            return isSingle ? result[input] : result;
        } catch (err) {
            console.error("CheckGlobalUsage error:", err);
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
        const isSingle = typeof input === "string";
        const titles = isSingle ? [input] : input;

        try {
            const results = await Promise.all(
                chunk(titles).map(async group => {
                    const res = await this.api.post({
                        action: "query",
                        prop: "info",
                        titles: group.join("|"),
                    });

                    const pages = res?.data?.query?.pages || {};
                    return Object.fromEntries(
                        Object.values(pages).map(p => [p.title, "redirect" in p]),
                    );
                }),
            );

            const result = Object.assign({}, ...results);
            return isSingle ? result[input] : result;
        } catch (err) {
            console.error("CheckRedirect error:", err);
            return isSingle ? false : Object.fromEntries(titles.map(t => [t, false]));
        }
    }
}

export class GetEmbeddedPages {
    constructor(api) {
        this.api = api;
    }

    /**
     * 获取嵌入页面
     * @param {string} title - 模板名
     * @param {string} [namespace="*"] - 命名空间
     * @returns {Promise<string[]>} 页面标题数组
     */
    async get(title, namespace = "*") {
        const result = [];
        const eol = Symbol();
        let geicontinue;

        while (geicontinue !== eol) {
            const { data } = await this.api.post(
                {
                    generator: "embeddedin",
                    geititle: title,
                    geinamespace: namespace,
                    geilimit: "500",
                    ...(geicontinue ? { geicontinue } : {}),
                },
                { retry: 10 },
            );

            if (data.query?.pages) {
                result.push(...Object.values(data.query.pages).map(p => p.title));
            }

            geicontinue = data.continue?.geicontinue ?? eol;
        }

        return result;
    }
}

export class GetLinkedPages {
    constructor(api) {
        this.api = api;
    }

    /**
     * 查询链入页面
     * @param {string|string[]} input - 页面标题或标题数组
     * @param {string|number} [namespace="*"] - 命名空间
     * @param {boolean} [redirect=false] - 是否包含重定向
     * @returns {Promise<Object<string, string[]>>} - 对象键为输入标题，值为链入页面标题数组
     */
    async get(input, namespace = "*", redirect = false) {
        const titles = Array.isArray(input) ? input : [input];

        const results = await Promise.all(
            chunk(titles).map(async group => {
                const chunkResult = new Map(group.map(title => [title, []]));
                let lhcontinue;

                do {
                    const res = await this.api.post({
                        prop: "linkshere",
                        titles: group.join("|"),
                        lhprop: "title",
                        lhnamespace: namespace,
                        lhshow: redirect ? "redirects|!redirects" : "!redirects",
                        lhlimit: "max",
                        formatversion: 2,
                        ...(lhcontinue ? { lhcontinue } : {}),
                    });

                    for (const page of res.data.query.pages || []) {
                        if (page.linkshere?.length) {
                            chunkResult.set(
                                page.title,
                                page.linkshere.map(lh => lh.title),
                            );
                        }
                    }

                    lhcontinue = res.data.continue?.lhcontinue;
                } while (lhcontinue);

                return Object.fromEntries(chunkResult);
            }),
        );

        return Object.assign({}, ...results);
    }
}
