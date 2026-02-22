import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(customParseFormat);

/**
 * 解析讨论串
 * @param {string} text - 待处理文本
 * @returns {Object} - { preface: "...", 1: { title, thread, content, timestamp }, ... }
 */
function parseThread(text) {
    const headingRegex = /^==\s*(.+?)\s*==\s*$/gm,
        timestampRegex =
            /([1-9]\d{3}年(?:0?[1-9]|1[012])月(?:0?[1-9]|[12]\d|3[01])日 *(?:[(（](?:[金木水火土日月]|(?:星期)?[一二三四五六日])[)）])? *(?:[01]\d|2[0-3]):(?:[0-5]\d)(?::[0-5]\d)? *[(（](?:[CJ]ST|UTC(?:[+-](?:[1-9]|1[012]))?)[)）])/gmu;
    const result = { preface: "" },
        headings = [];

    let match;
    while ((match = headingRegex.exec(text))) {
        headings.push({
            title: match[1].trim(),
            raw: match[0],
            start: match.index,
            end: match.index + match[0].length,
        });
    }

    if (headings.length === 0) {
        result.preface = text;
        return result;
    }

    result.preface = text.slice(0, headings[0].start);

    headings.forEach((h, i) => {
        const next = headings[i + 1],
            start = h.end,
            end = next ? next.start : text.length,
            thread = text.slice(start, end);

        const timestamps = [...thread.matchAll(timestampRegex)].map(m =>
            dayjs.utc(m[1], "YYYY年M月D日 HH:mm"),
        );

        const newTimestamp = timestamps.length
            ? dayjs.utc(Math.max(...timestamps.map(t => t.valueOf()))).toISOString()
            : null;

        result[i + 1] = {
            title: h.title,
            thread,
            content: h.raw + thread,
            timestamp: newTimestamp,
        };
    });

    return result;
}

export default parseThread;
