export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

//use this
// async function demoDung3s() {
//     await sleep(3000); Dừng lại 3000 mili giây (3 giây)
// }