import Parser from 'wikiparser-node';

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

export { normalizeHeadingSpacing };
