import type { Dayjs } from 'dayjs';
import Parser, { type HeadingToken } from 'wikiparser-node';
import { getLatestTimestamp } from './getLatestTimestamp';

interface ParsedThread {
    preface: string;
    sections: {
        title: string;
        content: string;
        thread: string;
        timestamp: Dayjs | undefined;
    }[];
}

/**
 * 解析讨论串
 *
 * @param text 需要解析的文本
 * @returns 解析结果对象，包含以下结构：
 *          - `preface`: 前言内容，即第一个标题之前的文本
 *          - `sections`: 章节数组，每个章节包含：
 *              - `title`: 章节标题
 *              - `content`: 章节内容（不含标题行）
 *              - `thread`: 完整章节文本（标题行 + 正文）
 *              - `timestamp`: 该章节内最新的时间戳（Dayjs 对象）
 */
const parseThread = (text: string): ParsedThread => {
    const root = Parser.parse(text);
    const headings = root.querySelectorAll<HeadingToken>('heading');
    const topLevel = Math.min(...headings.map(h => h.level));
    const filteredHeadings = headings.filter(h => h.level === topLevel);

    const result: ParsedThread = { preface: text, sections: [] };

    if (filteredHeadings.length) {
        result.preface = text.slice(0, filteredHeadings[0]!.getAbsoluteIndex());
    }

    filteredHeadings.forEach(heading => {
        const sectionRange = heading.section()!;

        const headingStart = heading.getAbsoluteIndex();
        const headingEnd = headingStart + heading.toString().length;
        const sectionEnd = sectionRange.endIndex;

        const content = text.slice(headingEnd, sectionEnd);
        const thread = text.slice(headingStart, sectionEnd);

        result.sections.push({
            title: heading.innerText,
            content,
            thread,
            timestamp: getLatestTimestamp(content),
        });
    });

    return result;
};

/**
 * 将 parsedThread 重新拼接为字符串
 *
 * @param result parseSections 的解析结果
 * @returns 拼接后的完整文本
 */
const parsedToString = (result: ParsedThread): string =>
    result.preface + result.sections.map(s => s.thread).join('');

export { parseThread, parsedToString };
