export interface IOptions {
  writeLocal?: boolean;
  traceLocal?: boolean;

  sysIdent?: string;
  base?: string;
  key?: string;
}

const opts: IOptions = {};

export default opts;

export function setOptions(options: IOptions) {
  Object.keys(options).forEach(key => opts[key] = options[key]);
}
