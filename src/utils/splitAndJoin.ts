/**
 * 将数组分割成指定大小的块，并将每个块中的元素转换为字符串，
 * 将其中的空格替换为下划线，最后用竖线连接成一个字符串。
 *
 * @param list 要处理的数组
 * @param size 每个块的大小，默认为 500
 * @returns 包含每个块连接后字符串的数组
 *
 * @example
 * const input = ['hello world', 'foo bar', 'baz'];
 * const result = splitAndJoin(input, 2);
 * // result: ['hello_world|foo_bar', 'baz']
 */
const splitAndJoin = (list: unknown[], size = 500) => {
    const result = [];
    for (let i = 0; i < list.length; i += size) {
        const chunk = list
            .slice(i, i + size)
            .map(item => String(item).replaceAll(' ', '_'))
            .join('|');
        result.push(chunk);
    }
    return result;
};

export { splitAndJoin };
