import { qwapi as api } from '@/api';
import { dayjs } from '@/infra';
import { run } from '@/runner';
import { archiveList } from '@/tasks';

const TARGET = 'Qiuwen_talk:存废讨论/文件快速删除提报';

const getReportedTitle = (
    _firstLine: string,
    links: { title: string; ns: number }[],
): string | undefined => links.find(({ ns }) => ns === 6)?.title;

(async () => {
    await run(
        { api, site: 'qw' },
        () =>
            archiveList(api, {
                target: TARGET,
                archiveTitle: `${TARGET}/存档/${dayjs().tz().format('YYYY年')}`,
                getReportedTitle,
            }),
        true,
    );
})();
