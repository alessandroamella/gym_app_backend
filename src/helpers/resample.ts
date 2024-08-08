import _ from 'lodash';

export function resampleArray(inputArray: number[], n: number) {
  // If input array is empty, return an array of n zeros
  if (inputArray.length === 0) {
    return Array(n).fill(0);
  }

  // If input array has only one element, return an array of n copies of that element
  if (inputArray.length === 1) {
    return Array(n).fill(inputArray[0]);
  }

  // If n is 1, return the average of all elements
  if (n === 1) {
    return [_.mean(inputArray)];
  }

  const step = (inputArray.length - 1) / (n - 1);
  return _.range(n).map((i) => {
    const exactIndex = i * step;
    const lowerIndex = Math.floor(exactIndex);
    const upperIndex = Math.ceil(exactIndex);

    if (lowerIndex === upperIndex) {
      return inputArray[lowerIndex];
    } else {
      const lowerWeight = upperIndex - exactIndex;
      const upperWeight = exactIndex - lowerIndex;
      return (
        inputArray[lowerIndex] * lowerWeight +
        inputArray[upperIndex] * upperWeight
      );
    }
  });
}
