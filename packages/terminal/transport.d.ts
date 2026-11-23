export function validateCompanionUrl(value:string):string;
export function createTransport(options:{location:{hostname:string};storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;fetcher?:typeof fetch}):{hosted:boolean;readonly configured:boolean;configure(url:string,token:string):void;disconnect():void;request(path:string,body?:unknown):Promise<any>};
