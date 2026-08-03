import { zhapi, cmapi, Login } from '@/api';
import { BotInstance } from '@/lib';
import {
    booleanFilter,
    getTimeData,
    updateTimeData,
    readGHFile,
    writeGHFile,
    dayjs,
} from '@/utils';

const now = dayjs().tz(),
    lestart = now.toISOString(),
    leend = await getTimeData('deleteRedirect');

const cmbot = new BotInstance(cmapi);

const getRecentMoves = async (): Promise<string[]> => {
    try {
        const { data } = await cmapi.post({
            action: 'query',
            list: 'logevents',
            letype: 'move',
            lenamespace: 6,
            lelimit: 500,
            lestart,
            leend,
        });

        const files = data?.query?.logevents || [];
        return files.map((e: { title: string }) => e.title);
    } catch (err) {
        console.error('获取移动日志出错:', err);
        return [];
    }
};

const recordInUsed = async (inUsed: string[]) => {
    const filepath = 'data/inUsedRedirect.json',
        { content, sha } = await readGHFile(filepath),
        record = JSON.parse(content) as Record<string, string[]>;
    record[lestart] = inUsed;
    await writeGHFile(
        filepath,
        JSON.stringify(record, null, 4),
        'chore: auto record redirect for in-use files',
        sha,
    );
};

const processRecent = async () => {
    const filepath = 'data/inUsedRedirect.json',
        { content, sha } = await readGHFile(filepath),
        record = JSON.parse(content) as Record<string, string[]>,
        original = JSON.stringify(record);

    for (const [timestamp, files] of Object.entries(record)) {
        if (files.length === 0) {
            delete record[timestamp];
            continue;
        }

        const usage = await cmbot.checkGlobalUsage(files);
        const { isFalse: notInUsed, isTrue: inUsed } = booleanFilter(usage);

        if (notInUsed.length > 0) {
            await Promise.all(
                notInUsed.map(async title => {
                    await cmapi.postWithToken('csrf', {
                        action: 'delete',
                        title,
                        reason: '自动删除文件移动残留重定向',
                        tags: 'Bot',
                        bot: true,
                    });
                }),
            );
            console.log(`删除记录中的 ${notInUsed.length} 个新无使用重定向`);
        }

        if (inUsed.length > 0) {
            record[timestamp] = inUsed;
        } else {
            delete record[timestamp];
        }
    }

    if (JSON.stringify(record) !== original) {
        await writeGHFile(
            filepath,
            JSON.stringify(record, null, 4),
            'chore: auto update inUsedRedirect record',
            sha,
        );
    }
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(zhapi).login({ site: 'zh', account: 'bot' });
    await new Login(cmapi).login({ site: 'cm', account: 'bot' });

    const movedFiles = await getRecentMoves();

    const redirects = await cmbot.checkRedirect(movedFiles),
        { isTrue: isRedirect } = booleanFilter(redirects);

    const usage = await cmbot.checkGlobalUsage(isRedirect),
        { isFalse, isTrue } = booleanFilter(usage);

    if (isTrue.length > 0) {
        console.log(`共 ${isTrue.length} 个重定向仍存在使用：\n${isTrue.join('\n')}`);
        await recordInUsed(isTrue);
    }

    if (isFalse.length > 0) {
        await Promise.all(
            isFalse.map(async title => {
                await cmapi.postWithToken('csrf', {
                    action: 'delete',
                    title,
                    reason: '自动删除文件移动残留重定向',
                    tags: 'Bot',
                    bot: true,
                });
            }),
        );
    } else {
        console.log('没有需要删除的重定向');
    }

    await processRecent();

    await updateTimeData('deleteRedirect', lestart);

    console.log(`End time: ${new Date().toISOString()}`);
})();
