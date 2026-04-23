/**
 * 将数组分割成指定大小的块。
 *
 * @param arr 要分割的数组
 * @param size 每个块的大小，默认为 500
 * @returns 包含每个块（子数组）的新数组
 *
 * @example
 * const data = [1, 2, 3, 4, 5];
 * const chunks = chunkArray(data, 2);
 * // chunks: [[1, 2], [3, 4], [5]]
 */
const chunkArray = (arr: unknown[], size: number = 500) => {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
};

export { chunkArray };
