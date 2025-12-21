class GetJSON {
    constructor(api) {
        this.api = api;
    }

    /**
     * 获取页面JSON内容
     * @param {string} [title] 页面标题
     * @returns {Promise<object} 返回解析后的JSON
     */
    async get(title) {
        const {
            data: {
                query: {
                    pages: [
                        {
                            revisions: [{ content }],
                        },
                    ],
                },
            },
        } = await this.api.get({
            action: "query",
            prop: "revisions",
            rvprop: "content",
            titles: title,
        });

        return JSON.parse(content);
    }
}

export default GetJSON;
