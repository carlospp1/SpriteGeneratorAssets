/* For the AI workers: the AI library writes its errors and warnings to the console. Inside a worker those
   messages are kept quiet; the worker reports the error to the page, which shows it as a notification. */
const nada = () => {};
console.error = nada;
console.warn = nada;
console.log = nada;
console.info = nada;
