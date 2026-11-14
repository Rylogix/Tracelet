import {it,expect} from "vitest";
import {usageState,type ProviderUsage} from "../../frontend/components/usage-model";
const row:ProviderUsage={provider:'fixture',name:'Fixture',kinds:['username'],available:true,attempts:3,successes:2,failures:1,quota_limit:null,remaining:null,reset:null,last_update:null,last_success:null,percentage:null,source:'local attempts',safety_limit_per_minute:10,budget:null,alerts:[],blocked_until:0};
it('never invents an allowance or meter for unknown provider quota',()=>{
 const state=usageState(row);expect(state.value).toBe('3 local');expect(state.percentage).toBeNull();expect(state.status).toBe('Locally tracked');
});
it('uses confirmed remaining quota and calculated consumption',()=>{
 const state=usageState({...row,quota_limit:100,remaining:25});expect(state.value).toBe('25/100 left');expect(state.percentage).toBe(75);expect(state.provenance).toBe('Provider-reported usage');
});
it('distinguishes personal caps from provider allowance and honors zero budgets',()=>{
 const state=usageState({...row,budget:10});expect(state.value).toBe('7 budget left');expect(state.percentage).toBe(30);expect(state.provenance).toBe('Personal local budget');
 expect(usageState({...row,budget:0}).status).toBe('Budget reached');
});
it('labels expired reports as stale instead of pretending they have reset',()=>{
 const state=usageState({...row,quota_limit:100,remaining:0,reset:'2020-01-01T00:00:00Z'});expect(state.status).toBe('Needs update');expect(state.percentage).toBeNull();expect(state.value).not.toContain('100 left');
});
it('surfaces rate limiting, exhaustion and unavailability',()=>{
 expect(usageState({...row,blocked_until:Date.now()/1000+30}).status).toBe('Rate limited');
 expect(usageState({...row,quota_limit:100,remaining:0}).status).toBe('Exhausted');
 expect(usageState({...row,available:false}).status).toBe('Unavailable');
});
