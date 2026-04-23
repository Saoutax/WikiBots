import dayjs, { type Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import utc from 'dayjs/plugin/utc';

dayjs.extend(customParseFormat);
dayjs.extend(utc);

interface Thread {
    preface: string;
    [index: number]: {
        title: string;
        content: string;
        thread: string;
        timestamp: Dayjs;
    };
}

/**
 * 解析讨论串
 *
 * @param text 需要解析的文本
 * @returns 解析结果对象，包含以下结构：
 *          - `preface`: 前言内容，即第一个标题之前的文本
 *          - `[index: number]`: 按顺序编号的章节（从 1 开始），每个章节包含：
 *              - `title`: 章节标题
 *              - `content`: 章节内容
 *              - `thread`: 完整章节文本（标题行 + 正文）
 *              - `timestamp`: 该章节内最新的时间戳（Dayjs 对象）
 */
const parseThread = (text: string) => {
    const headingRegex = /^==\s*(.+?)\s*==\s*$/gm,
        timestampRegex =
            /([1-9]\d{3}年(?:0?[1-9]|1[012])月(?:0?[1-9]|[12]\d|3[01])日 *(?:[(（](?:[金木水火土日月]|(?:星期)?[一二三四五六日])[)）])? *(?:[01]\d|2[0-3]):(?:[0-5]\d)(?::[0-5]\d)? *[(（](?:[CJ]ST|UTC(?:[+-](?:[1-9]|1[012]))?)[)）])/gmu;

    const headings = [...text.matchAll(headingRegex)].map(match => ({
        title: match[1]!.trim(),
        raw: match[0],
        start: match.index!,
        end: match.index! + match[0].length,
    }));

    const result: Thread = { preface: headings.length ? text.slice(0, headings[0]!.start) : text };

    headings.forEach((heading, index) => {
        const content = text.slice(heading.end, headings[index + 1]?.start ?? text.length);
        const timestamps = [...content.matchAll(timestampRegex)].map(m =>
            dayjs.utc(m[1], 'YYYY年M月D日 HH:mm').valueOf(),
        );

        result[index + 1] = {
            title: heading.title,
            content,
            thread: heading.raw + content,
            timestamp: dayjs.utc(Math.max(...timestamps)),
        };
    });

    return result;
};

export { parseThread };
