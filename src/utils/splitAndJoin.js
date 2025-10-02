/**
 * @param {Array} list
 * @param {number} chunkSize
 * @returns {Array}
 * @author 星海 <https://github.com/lovelyCARDINAL/WikiBots/blob/main/src/utils/splitAndJoin.js>
 */
function splitAndJoin(list, chunkSize) {
	const chunks = [];
	for (let i = 0; i < list.length; i += chunkSize) {
		const chunk = list.slice(i, i + chunkSize);
		const joinedChunk = chunk.join('|').replaceAll(' ', '_');
		chunks.push(joinedChunk);
	}
	return chunks;
}

export default splitAndJoin;