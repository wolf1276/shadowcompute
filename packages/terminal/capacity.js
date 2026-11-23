// Only funded, claimed yield is spendable; unclaimed simulated rewards are not an allowance.
export function promptCapacity(credits){
 const total=credits.length,available=credits.filter(c=>c.status==='ready').length;
 const percent=total?Math.round(available/total*100):0;
 return {percent,label:!total?'Not funded yet':!available?'Allowance used':percent<=25?'Running low':'Ready to prompt',description:!total?'No claimed yield allowance is available yet.':`${percent}% of this session’s claimed simulated yield remains available for prompts.`};
}
