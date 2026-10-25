import { cloneDeep } from 'es-toolkit/object';
import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { parseThread, parsedToString, dayjs } from '@/utils';
import { archiveDiscussion } from '../modules';

const bot = new BotInstance(api);

const main = async (targets: string[]) => {
    const currentTime = dayjs().tz(),
        currentMonth = dayjs().tz().format('YYYY年MM月');

    const makeArchiveTitle = (text: string) => {
        const idx = text.lastIndexOf('/') + 1;
        return `${text.slice(0, idx)}存档/${text.slice(idx)}/${currentMonth}`;
    };

    for (const target of targets) {
        const { content: pageContent, revid } = await bot.getContent(target);
        const discussionThread = parseThread(pageContent);

        let archive = '';
        const newDiscussion = cloneDeep(discussionThread);

        const removeIndices: number[] = [];

        for (const [i, { thread, content }] of discussionThread.sections.entries()) {
            const mar = Parser.parse(content).querySelector<Parser.TranscludeToken>(
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
        await archiveDiscussion(api, {
            target,
            archiveTitle,
            discussion: parsedToString(newDiscussion),
            archive,
            summary: '机器人：存档讨论',
            baserevid: revid,
        });
        console.log(`Archived: ${target} → ${archiveTitle}`);
    }
};

(async () => {
    await run({ api, site: 'qw' }, async () => {
        await main(['Qiuwen_talk:茶馆/编辑', 'Qiuwen_talk:茶馆/其他']);
    });
})();
