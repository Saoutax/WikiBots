import { run, zhapi, cmapi } from '@/api';
import { BotInstance } from '@/lib';
import { getTimeData, updateTimeData, dayjs } from '@/utils';
import { collectRecentChanges } from '../modules';

interface Config {
    excludeCategory: string[];
    excludePrefix: string[];
    excludeTitle: string[];
    excludeFile: string[];
}

const zhbot = new BotInstance(zhapi),
    cmbot = new BotInstance(cmapi);

const getPages = async (rcstart: string, rcend: string | undefined) => {
    const pages = new Set<string>();

    await collectRecentChanges<{ title: string }>(
        zhapi,
        {
            rcprop: 'title|timestamp',
            rctype: 'edit|new',
            rctag: '疑似外链调用内部文件',
            rcnamespace: '0|4|8|10|12|14|274|828',
            rcstart,
            rcend,
            rclimit: 'max',
        },
        list => {
            for (const rc of list) {
                pages.add(rc.title);
            }
        },
    );

    return Array.from(pages);
};

const matchFiles = async (titles: string[]) => {
    const matches: Record<string, string> = {};

    const { excludeCategory, excludePrefix, excludeTitle, excludeFile } =
        await zhbot.getJson<Config>('User:SaoMikoto/Bot/config/markImg.json');

    const exclude = [
        ...(await zhbot.queryCategory(excludeCategory, false, ['page'])),
        ...excludeTitle,
    ];

    const filteredTitles = titles.filter(
        title =>
            !exclude.includes(title) && !excludePrefix.some(prefix => title.startsWith(prefix)),
    );

    const pages = await zhbot.batchQuery(filteredTitles);

    const filepathRegex = /\{\{filepath:([^|}]+)/g;
    const urlRegex =
        /(?:img|commons)\.moegirl\.org\.cn\/(?:common|thumb)\/.*?\/.*?\/([^/]+\.\w+)|^https:\/\/storage\.moegirl\.org\.cn\/moegirl\/commons\/(?:.*\/)?([^/?!#]+)/g;
    const extTest =
        /\.(png|gif|jpg|jpeg|webp|svg|pdf|jp2|mp3|ttf|woff2|ogg|ogv|oga|flac|opus|wav|webm|midi|mid|mpg|mpeg)$/i;

    for (const [title, { content }] of Object.entries(pages)) {
        filepathRegex.lastIndex = 0;
        urlRegex.lastIndex = 0;

        let match;

        while ((match = filepathRegex.exec(content))) {
            const file = match[1]!.trim();
            if (extTest.test(file)) {
                const fileName = `File:${file}`;
                if (!excludeFile.includes(fileName)) {
                    matches[fileName] = title;
                }
            }
        }

        while ((match = urlRegex.exec(content))) {
            let file = (match[1] || match[2])!;
            try {
                file = decodeURIComponent(file).trim();
            } catch {
                continue;
            }
            if (extTest.test(file)) {
                const fileName = `File:${file}`;
                if (!excludeFile.includes(fileName)) {
                    matches[fileName] = title;
                }
            }
        }
    }

    return matches;
};

const notInCat = async (fileList: string[], category: string) => {
    const results = await Promise.all(
        fileList.map(async file => {
            const { data } = await cmapi.post({
                action: 'query',
                prop: 'categories',
                titles: file,
                cllimit: 'max',
            });
            const page = data?.query?.pages?.[0];
            if (!page || page.missing) {
                return null;
            }
            const inCategory = page.categories?.some(
                (cat: { title: string }) => cat.title === `Category:${category}`,
            );
            return inCategory ? null : file;
        }),
    );

    return results.filter(Boolean);
};

const addTemplate = async (file: string, pageName: string) => {
    await cmbot.edit({
        title: file,
        appendtext: `\n{{非链入使用|[[zhmoe:${pageName}]]}}`,
        summary: '标记存在非链入使用的文件',
        tags: 'Bot',
    });

    console.log(`${file}已标记。`);
};

(async () => {
    await run(
        [
            { api: zhapi, site: 'zh' },
            { api: cmapi, site: 'cm' },
        ],
        async () => {
            const now = dayjs.tz(),
                rcstart = now.toISOString(),
                rcend = await getTimeData('markImg');

            const pages = await getPages(rcstart, rcend);
            const fileList = await matchFiles(pages);
            const titles = Object.keys(fileList);
            const needMark = await notInCat(titles, '非链入使用的文件');

            for (const file of needMark) {
                if (!file) {
                    continue;
                }
                await addTemplate(file, fileList[file]!);
            }

            await updateTimeData('markImg', rcstart);
        },
    );
})();
