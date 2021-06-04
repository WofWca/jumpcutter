export function assertNever(arg: never): never {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(`Value was not expected to be "${arg}"`);
  } else {
    throw new Error();
  }
}
