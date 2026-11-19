import Parser from 'wikiparser-node';
import { run, qwapi as api } from '@/api';
import { BotInstance } from '@/lib';
import { dayjs, getLatestTimestamp } from '@/utils';
import { archiveDiscussion } from '../modules';

const bot = new BotInstance(api);

const TARGET = 'Qiuwen_talk:侵权提报';
const MAR_DAYS = 3;

/**
 * Template:CopyvioEntry 及其全部重定向
 */
const copyvioTemplates = [
    'CopyvioEntry',
    'Preload2/Qiuwen:侵权提报/CopyvioEntry',
    'Qiuwen talk:侵权提报/Preload2/CopyvioEntry',
    'Qiuwen:侵权提报/Preload2/CopyvioEntry',
].map(name => name.toLowerCase());

const templatePrefix = 'template:';

/** 解析器会在模板名前补 `Template:`，并把标题内空格转为下划线 */
const normalizeTemplateName = (name: string): string => {
    const lower = name.toLowerCase();
    return (lower.startsWith(templatePrefix) ? lower.slice(templatePrefix.length) : lower)
        .replaceAll('_', ' ')
        .trim();
};

const isCopyvioTemplate = (template: Parser.TranscludeToken): boolean =>
    copyvioTemplates.includes(normalizeTemplateName(template.name));

interface Entry {
    title: string;
    start: number;
    end: number;
    text: string;
}

interface DateSection {
    heading: string;
    start: number;
    end: number;
    entries: Entry[];
}

const parseDateSections = (content: string): DateSection[] => {
    const headings = Parser.parse(content).querySelectorAll<Parser.HeadingToken>('heading');

    const sections: DateSection[] = [];
    let current: DateSection | undefined;

    for (const heading of headings) {
        const section = heading.section();
        if (!section) {
            continue;
        }

        const start = heading.getAbsoluteIndex();

        if (heading.level === 2) {
            current = {
                heading: content.slice(start, start + heading.toString().length),
                start,
                end: section.endIndex,
                entries: [],
            };
            sections.push(current);
        } else if (heading.level === 4) {
            if (!current) {
                console.log(`Skip entry outside date section: ${heading.innerText}`);
                continue;
            }
            current.entries.push({
                title: heading.innerText,
                start,
                end: section.endIndex,
                text: content.slice(start, section.endIndex),
            });
        }
    }

    return sections;
};

/**
 * 规范二级标题前的空行，保留且仅保留一个空行
 *
 * @param text - 页面内容
 * @returns 规范后的内容
 */
const normalizeHeadingSpacing = (text: string): string => {
    const headings = Parser.parse(text)
        .querySelectorAll<Parser.HeadingToken>('heading')
        .filter(({ level }) => level === 2)
        .map(heading => heading.getAbsoluteIndex());

    let result = text;

    for (const start of headings.reverse()) {
        let newlines = 0;
        while (start - newlines > 0 && result[start - newlines - 1] === '\n') {
            newlines++;
        }

        if (start - newlines === 0) {
            continue;
        }

        result = `${result.slice(0, start - newlines)}\n\n${result.slice(start)}`;
    }

    return result;
};

(async () => {
    await run({ api, site: 'qw' }, async () => {
        const { content, revid } = await bot.getContent(TARGET);
        const sections = parseDateSections(content);

        if (sections.length === 0) {
            console.log('No date sections found.');
            return;
        }

        const currentTime = dayjs().tz();
        const archivedSections: { heading: string; entries: Entry[] }[] = [];
        const removeRanges: [number, number][] = [];
        let archivedCount = 0;

        for (const section of sections) {
            const archivedEntries: Entry[] = [];
            let remaining = 0;

            for (const entry of section.entries) {
                const template = Parser.parse(entry.text)
                    .querySelectorAll<Parser.TranscludeToken>('template')
                    .find(isCopyvioTemplate);
                const page = template?.getValue('1')?.trim();

                if (!page) {
                    console.log(`Skip ${entry.title}: CopyvioEntry template not found.`);
                    remaining++;
                    continue;
                }

                const timestamp = getLatestTimestamp(entry.text);
                if (!timestamp || dayjs(currentTime).diff(timestamp, 'day') < MAR_DAYS) {
                    console.log(
                        `Skip ${entry.title}: latest comment is less than ${MAR_DAYS} days old.`,
                    );
                    remaining++;
                    continue;
                }

                try {
                    if (await bot.checkExist(page)) {
                        console.log(`Skip ${entry.title}: ${page} still exists.`);
                        remaining++;
                        continue;
                    }
                } catch (error) {
                    console.log(`Skip ${entry.title}: failed to check ${page}: ${String(error)}`);
                    remaining++;
                    continue;
                }

                console.log(`Archive ${entry.title}: ${page} no longer exists.`);
                archivedEntries.push(entry);
            }

            if (archivedEntries.length === 0) {
                continue;
            }

            archivedSections.push({ heading: section.heading, entries: archivedEntries });
            archivedCount += archivedEntries.length;

            if (remaining === 0) {
                removeRanges.push([section.start, section.end]);
            } else {
                removeRanges.push(
                    ...archivedEntries.map(({ start, end }): [number, number] => [start, end]),
                );
            }
        }

        if (archivedCount === 0) {
            console.log('No entries need to be archived.');
            return;
        }

        const archive = archivedSections
            .map(
                ({ heading, entries }) =>
                    `${heading.trimEnd()}\n${entries.map(e => e.text).join('')}`,
            )
            .join('\n')
            .trimEnd();

        removeRanges.sort((a, b) => b[0] - a[0]);

        let discussion = content;
        for (const [start, end] of removeRanges) {
            discussion = discussion.slice(0, start) + discussion.slice(end);
        }
        discussion = normalizeHeadingSpacing(discussion).trimEnd() + '\n';

        await archiveDiscussion(api, {
            target: TARGET,
            archiveTitle: `${TARGET}/存档/${currentTime.format('YYYY年')}`,
            discussion,
            archive,
            summary: '机器人：存档讨论',
            baserevid: revid,
        });
        console.log(`Archived ${archivedCount} entries.`);
    });
})();
