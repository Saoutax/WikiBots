import { splitAndJoin } from "./arrayUtils.js";

class BatchQuery {
    constructor(api) {
        this.api = api;
    }

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
                const title = page.title;
                const content = page.revisions[0].content;

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
