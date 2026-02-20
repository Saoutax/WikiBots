import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import { zhapi, cmapi, Login } from "../utils/apiLogin.js";

dayjs.extend(utc);

const now = dayjs.utc();
const start = now.toISOString();
const end = now.subtract(260, "hour").toISOString();

async function getPages() {
    const pages = new Set();
    let cont;

    do {
        const { data } = await zhapi.post({
            list: "recentchanges",
            rcprop: "title|timestamp",
            rctype: "edit|new",
            rctag: "疑似外链调用内部文件",
            rcnamespace: "0|4|8|10|12|14|274|828",
            rcstart: start,
            rcend: end,
            rclimit: "max",
            rccontinue: cont,
        });

        const list = data?.query?.recentchanges;
        if (!list?.length) {
            break;
        }

        for (const rc of list) {
            pages.add(rc.title);
        }

        cont = data?.continue?.rccontinue;
    } while (cont);

    return Array.from(pages);
}

async function matchFiles(titles) {
    const matches = {};

    for (const title of titles) {
        const { data } = await zhapi.post({
            action: "query",
            prop: "revisions",
            titles: title,
            rvprop: "content",
            formatversion: 2,
        });

        const page = data?.query?.pages?.[0];
        if (!page || !page.revisions?.[0]?.content) {
            continue;
        }

        const content = page.revisions[0].content;

        const filepathRegex = /\{\{filepath:([^|}]+)/g,
            urlRegex =
                /(?:img|commons)\.moegirl\.org\.cn\/(?:common|thumb)\/.*?\/.*?\/([^/]+\.\w+)/g,
            extTest =
                /\.(png|gif|jpg|jpeg|webp|svg|pdf|jp2|mp3|ttf|woff2|ogg|ogv|oga|flac|opus|wav|webm|midi|mid|mpg|mpeg)$/i;

        let match;

        while ((match = filepathRegex.exec(content))) {
            const file = match[1].trim();
            if (extTest.test(file)) {
                matches[`File:${file}`] = title;
            }
        }

        while ((match = urlRegex.exec(content))) {
            let file = match[1];
            try {
                file = decodeURIComponent(file).trim();
            } catch {
                continue;
            }
            if (extTest.test(file)) {
                matches[`File:${file}`] = title;
            }
        }
    }

    return matches;
}

async function notInCat(fileList, category) {
    const results = await Promise.all(
        fileList.map(async file => {
            const { data } = await cmapi.post({
                action: "query",
                prop: "categories",
                titles: file,
                cllimit: "max",
                formatversion: 2,
            });
            const page = data?.query?.pages?.[0];
            if (!page || page.missing) {
                return null;
            }
            const inCategory = page.categories?.some(c => c.title === `Category:${category}`);
            return inCategory ? null : file;
        }),
    );

    return results.filter(Boolean);
}

async function addTemplate(file, pageName) {
    await cmapi.postWithToken(
        "csrf",
        {
            action: "edit",
            title: file,
            appendtext: `\n{{非链入使用|[[zhmoe:${pageName}]]}}`,
            summary: "标记存在非链入使用的文件",
            minor: true,
            bot: true,
            tags: "Bot",
        },
        { retry: 10 },
    );

    console.log(`${file}已标记。`);
}

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await Promise.all([new Login(zhapi).login("zh.bot"), new Login(cmapi).login("cm.bot")]);

    const pages = await getPages();
    const fileList = await matchFiles(pages);
    const titles = Object.keys(fileList);
    const needMark = await notInCat(titles, "非链入使用的文件");

    for (const file of needMark) {
        await addTemplate(file, fileList[file]);
    }

    console.log(`End time: ${new Date().toISOString()}`);
})();
