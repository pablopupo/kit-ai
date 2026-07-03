export const devLog = import.meta.env.DEV ? console.log.bind(console) : () => {}
export const devWarn = import.meta.env.DEV ? console.warn.bind(console) : () => {}
