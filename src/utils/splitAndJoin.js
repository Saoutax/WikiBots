/**
 * @param {Array} list
 * @param {number} chunkSize
 * @returns {Array}
 */
function splitAndJoin(list, chunkSize) {
    const chunks = [];
    for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list
            .slice(i, i + chunkSize)
            .map(item => String(item).replaceAll(" ", "_"))
            .join("|");
        chunks.push(chunk);
    }
    return chunks;
}

export default splitAndJoin;
