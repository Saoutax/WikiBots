import { splitAndJoin } from "./arrayUtils.js";

class BatchQuery {
    constructor(api) {
        this.api = api;
    }

    /**
     * 批量查询页面
     * @async
     * @param {*} titlesArray 标题数组
     * @param {number} [timeout=3000] 延时，可选
     * @returns {object} {标题:内容}
     */
    async query(titlesArray, timeout = 3000) {
        const batchTitles = splitAndJoin(titlesArray, 500);
        const result = {};

        const total = batchTitles.length;
        let index = 0;

        for (const titles of batchTitles) {
            const { data } = await this.api.postWithToken("csrf", {
                action: "query",
                prop: "revisions",
                rvprop: "content",
                titles,
                formatversion: 2,
            });

            const pages = data?.query?.pages;
            if (!pages) {
                continue;
            }

            for (const page of Object.values(pages)) {
                const revisions = page.revisions;
                if (!revisions?.length) {
                    continue;
                }

                const title = page.title;
                const content = revisions[0].content;

                result[title] = content;
            }

            index++;
            console.log(`BatchQuery: ${index}/${total} completed`);

            if (index < total) {
                await new Promise(resolve => {
                    setTimeout(resolve, timeout);
                });
            }
        }

        return result;
    }
}

export default BatchQuery;
