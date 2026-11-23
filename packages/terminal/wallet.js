export function listWallets(injected){
 return Object.entries(injected??{}).filter(([,wallet])=>wallet&&typeof wallet.apiVersion==='string'&&/^4\./.test(wallet.apiVersion)&&typeof wallet.connect==='function').map(([id,wallet])=>({id,name:typeof wallet.name==='string'?wallet.name.slice(0,80):'Midnight wallet',wallet}));
}
export async function connectWallet(wallet,network){
 if(!['preview','undeployed'].includes(network))throw new Error('Unsupported wallet network');
 const api=await wallet.connect(network);
 const status=await api.getConnectionStatus();
 if(status?.status!=='connected')throw new Error('Wallet is not connected');
 const {unshieldedAddress}=await api.getUnshieldedAddress();
 if(typeof unshieldedAddress!=='string'||!unshieldedAddress.startsWith(network==='preview'?'mn_addr_preview1':'mn_addr_undeployed1'))throw new Error('Wallet returned an address for another network');
 return {api,address:unshieldedAddress};
}
