export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

//use this
// async function demoDung3s() {
//     await sleep(3000); Pause for 3000 milliseconds (3s)
// }