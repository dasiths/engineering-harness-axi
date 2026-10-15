export class HarnessError extends Error {
  constructor(
    message: string,
    public readonly help: string,
    public readonly exitCode: 1 | 2 = 1
  ) {
    super(message);
    this.name = "HarnessError";
  }
}
