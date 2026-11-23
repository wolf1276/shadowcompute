type Connected = {getConnectionStatus():Promise<{status:string}>;getUnshieldedAddress():Promise<{unshieldedAddress:string}>};
type Wallet = {name?:string;apiVersion?:string;connect(network:string):Promise<Connected>};
export function listWallets(injected:Record<string,unknown>|undefined):{id:string;name:string;wallet:Wallet}[];
export function connectWallet(wallet:Pick<Wallet,'connect'>,network:string):Promise<{api:Connected;address:string}>;
