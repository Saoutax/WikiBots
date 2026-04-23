/**
 * 格式化命名空间编号，使之符合 MediaWiki API 格式要求
 *
 * @param namespace 命名空间编号数组
 * @returns 命名空间字符串
 * @example
 * formatNamespace([0, 2, 4]); // '0|2|4'
 * formatNamespace([]); // '*'
 */
const formatNamespace = (namespace: number[]) => {
    return namespace.length === 0 ? '*' : namespace.join('|');
};

export { formatNamespace };
