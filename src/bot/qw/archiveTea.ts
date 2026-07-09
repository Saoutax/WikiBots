import { cloneDeep } from 'es-toolkit/object';
import Parser, { type TranscludeToken } from 'wikiparser-node';
import { qwapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';
import { parseThread, parsedToString, dayjs } from '@/utils';

const bot = new BotInstance(api);

const main = async (targets: string[]) => {
    const currentTime = dayjs().tz(),
        currentMonth = dayjs().tz().format('YYYY年MM月');

    const makeArchiveTitle = (text: string) => {
        const idx = text.lastIndexOf('/') + 1;
        return `${text.slice(0, idx)}存档/${text.slice(idx)}/${currentMonth}`;
    };

    for (const target of targets) {
        const discussionThread = parseThread(await bot.getContent(target));

        let archive = '';
        const newDiscussion = cloneDeep(discussionThread);

        const removeIndices: number[] = [];

        for (const [i, { thread, content }] of discussionThread.sections.entries()) {
            const mar = Parser.parse(content).querySelector<TranscludeToken>(
                'template:is(#Template:MarkAsResolved, #Template:正在公示, #Template:讨论结束)',
            );
            if (!mar) {
                continue;
            }
            const time = dayjs(mar.getValue('time')),
                day = Number.isFinite(Number(mar.getValue('days')))
                    ? Number(mar.getValue('days'))
                    : 3;
            if (time && dayjs(currentTime).diff(time, 'day') >= day) {
                archive += thread;
                removeIndices.push(i);
            }
        }

        for (const i of removeIndices.reverse()) {
            newDiscussion.sections.splice(i, 1);
        }

        if (!archive) {
            continue;
        }

        const archiveTitle = makeArchiveTitle(target);
        const append = await bot.checkExist(archiveTitle);
        const params = {
            action: 'edit',
            summary: '机器人：存档讨论',
            minor: true,
            bot: true,
        };
        await Promise.all([
            api.postWithToken('csrf', {
                ...params,
                title: target,
                text: parsedToString(newDiscussion),
            }),
            api.postWithToken('csrf', {
                ...params,
                title: archiveTitle,
                ...(append
                    ? { appendtext: `\n\n${archive}` }
                    : { text: `{{talkarchive}}\n\n${archive}` }),
            }),
        ]);
        console.log(`Archived: ${target} → ${archiveTitle}`);
    }
};

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'qw', account: 'bot' });

    await main(['Qiuwen_talk:茶馆/编辑', 'Qiuwen_talk:茶馆/其他']);

    console.log(`End time: ${new Date().toISOString()}`);
})();
