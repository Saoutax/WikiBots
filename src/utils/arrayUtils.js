/**
 * @param {Array} list
 * @param {number} chunkSize
 * @returns {Array}
 */
function splitAndJoin(list, chunkSize) {
    const result = [];
    for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list
            .slice(i, i + chunkSize)
            .map(item => String(item).replaceAll(" ", "_"))
            .join("|");
        result.push(chunk);
    }
    return result;
}

/**
 * 分割数组
 * @param {Array} arr - 原数组
 * @returns {Array[]} - 分割后的数组
 */
function chunkArray(arr, size = 500) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

export { splitAndJoin, chunkArray };
