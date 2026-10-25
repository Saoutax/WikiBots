import { run, uewapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { dayjs, parseThread, parsedToString } from '@/utils';

const bot = new BotInstance(api);

(async () => {
    await run({ api, site: 'uew' }, async () => {
        if (dayjs.tz().date() === 1) {
            const { content, revid } = await bot.getContent('地球联合百科讨论:会议大厅');

            const currentThread = parseThread(content);
            const { sections } = currentThread;

            let archive = '';
            const remainingSections = sections.filter(section => {
                const today = dayjs.tz().startOf('day'),
                    lastComment = dayjs(section.timestamp);
                if (today.diff(lastComment, 'day') >= 5) {
                    archive += `${section.thread}\n`;
                    console.log(`Need archive: ${section.title}`);
                    return false;
                }
                return true;
            });

            const newDiscussion = parsedToString({
                preface: currentThread.preface,
                sections: remainingSections,
            });

            if (archive !== '') {
                const hallTitle = '地球联合百科讨论:会议大厅',
                    archiveTitle = `地球联合百科讨论:会议大厅/存档/${dayjs().tz().subtract(1, 'month').format('YYYY年MM月')}`;

                // 先写存档页再更新会议大厅：第二步失败只会留下可清理的重复存档，
                // 反过来则讨论串已从大厅移除却未写入存档
                await bot.edit({
                    title: archiveTitle,
                    text: archive,
                    summary: '存档过期讨论串',
                    tags: 'Bot',
                });
                console.log(`Done: ${archiveTitle}`);

                await bot.edit({
                    title: hallTitle,
                    text: newDiscussion,
                    baserevid: revid,
                    summary: '存档过期讨论串',
                    tags: 'Bot',
                });
                console.log(`Done: ${hallTitle}`);

                await api.postWithToken('csrf', {
                    action: 'protect',
                    title: archiveTitle,
                    protections: 'edit=sysop|move=sysop',
                    reason: '会议大厅存档',
                    tags: 'Bot',
                    bot: true,
                });
                console.log('Protect success.');
            } else {
                console.log('No thread need archive.');
            }
        } else {
            console.log('Not archive day, skipped.');
        }
    });
})();
