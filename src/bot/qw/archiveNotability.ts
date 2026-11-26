import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { dayjs } from '@/utils';
import { archiveList } from '../modules';

const TARGET = 'Qiuwen_talk:存废讨论/关注度提报';

/** Template:Findsources 及其重定向 Template:Find sources */
const findSourcesTemplates = new Set(['template:findsources', 'template:find sources']);

const getReportedTitle = (
    firstLine: string,
    links: { title: string; ns: number }[],
): string | undefined => {
    const fromTemplate = Parser.parse(firstLine)
        .querySelectorAll<Parser.TranscludeToken>('template')
        .find(({ name }) => findSourcesTemplates.has(name.replaceAll('_', ' ').toLowerCase()))
        ?.getValue('1')
        ?.trim();

    if (fromTemplate) {
        return fromTemplate;
    }

    return (links.find(({ ns }) => ns !== 2 && ns !== 3) ?? links[0])?.title;
};

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
