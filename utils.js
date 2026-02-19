/**
 * Splits an array into chunks of a fixed size.
 *
 * @typeParam T - Element type.
 * @param xs - Source array.
 * @param size - Chunk size. Must be at least 1.
 * @returns A new array of chunks.
 * @throws {RangeError} If `size` is less than 1.
 */
function chunks(xs, size) {
  if (size < 1) throw new RangeError(`chunk size must be ≥ 1, got ${size}`);
  const result = [];
  for (let i = 0; i < xs.length; i += size) {
    result.push(xs.slice(i, i + size));
  }
  return result;
}

module.exports = {
  chunks,
};
