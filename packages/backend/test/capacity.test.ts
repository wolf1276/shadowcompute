import {it,expect} from 'vitest';
import {promptCapacity} from '../../terminal/capacity.js';
it('shows funded allowance without inventing wallet yield or numeric credit counts',()=>{
 expect(promptCapacity([])).toMatchObject({percent:0,label:'Not funded yet'});
 expect(promptCapacity([{status:'ready'},{status:'ready'},{status:'redeemed'}])).toMatchObject({percent:67,label:'Ready to prompt'});
 expect(promptCapacity([{status:'redeemed'}])).toMatchObject({percent:0,label:'Allowance used'});
 expect(promptCapacity([{status:'ready'},...Array(3).fill({status:'redeemed'})])).toMatchObject({percent:25,label:'Running low'});
});
