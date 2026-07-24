import { uewapi as api, Login } from '@/api';
import { BotInstance } from '@/lib';
import { dayjs, parseThread, parsedToString } from '@/utils';

const bot = new BotInstance(api);

(async () => {
    console.log(`Start time: ${new Date().toISOString()}`);

    await new Login(api).login({ site: 'uew', account: 'bot' });

    if (dayjs.tz().date() === 1) {
        const content = await bot.getContent('地球联合百科讨论:会议大厅');

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
            const archiveTitle = `地球联合百科讨论:会议大厅/存档/${dayjs().tz().subtract(1, 'month').format('YYYY年MM月')}`;
            await Promise.all(
                Object.entries({
                    '地球联合百科讨论:会议大厅': newDiscussion,
                    [archiveTitle]: archive,
                }).map(async ([title, text]) => {
                    await api.postWithToken('csrf', {
                        action: 'edit',
                        title,
                        text,
                        summary: '存档过期讨论串',
                        tags: 'Bot',
                        bot: true,
                    });
                    console.log(`Done: ${title}`);
                }),
            );

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

    console.log(`End time: ${new Date().toISOString()}`);
})();
