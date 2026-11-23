import {it,expect,vi} from 'vitest';
import {listWallets,connectWallet} from '../../terminal/wallet.js';
it('discovers compatible injected wallets and lets the caller choose',()=>{
 const a={name:'Lace',apiVersion:'4.1.0',connect:vi.fn()};
 const b={name:'Other',apiVersion:'4.0.0',connect:vi.fn()};
 expect(listWallets({random:a,second:b,old:{apiVersion:'3.0.0',connect(){}}})).toMatchObject([{id:'random',name:'Lace'},{id:'second',name:'Other'}]);
 expect(listWallets(undefined)).toEqual([]);
});
it('connects to Preview and rejects disconnected or wrong-network wallets',async()=>{
 const api={getConnectionStatus:async()=>({status:'connected'}),getUnshieldedAddress:async()=>({unshieldedAddress:'mn_addr_preview1abc'})};
 const wallet={connect:vi.fn(async()=>api)};
 expect((await connectWallet(wallet,'preview')).address).toBe('mn_addr_preview1abc');expect(wallet.connect).toHaveBeenCalledWith('preview');
 await expect(connectWallet({connect:async()=>({...api,getConnectionStatus:async()=>({status:'disconnected'})})},'preview')).rejects.toThrow('not connected');
 await expect(connectWallet({connect:async()=>({...api,getUnshieldedAddress:async()=>({unshieldedAddress:'mn_addr1abc'})})},'preview')).rejects.toThrow('another network');
});
