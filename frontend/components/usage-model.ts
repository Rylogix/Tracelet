export type ProviderUsage={
  provider:string;name:string;kinds:string[];available:boolean;unit?:string;
  attempts:number;successes:number;failures:number;quota_limit:number|null;
  remaining:number|null;reset:string|null;last_update:string|null;last_success:string|null;
  percentage:number|null;source:string;safety_limit_per_minute:number;
  budget:number|null;alerts:number[];blocked_until:number;
};
export function usageState(row:ProviderUsage,now=Date.now()) {
  const stale=!!row.reset&&Number.isFinite(Date.parse(row.reset))&&Date.parse(row.reset)<=now;
  const capped=row.budget!==null&&row.attempts>=row.budget;
  const limited=row.blocked_until>now/1000;
  const exhausted=row.remaining===0&&!stale;
  const status=!row.available?"Unavailable":limited?"Rate limited":capped?"Budget reached":exhausted?"Exhausted":stale?"Needs update":row.remaining!==null?"Provider reported":"Locally tracked";
  const value=!row.available?"Unavailable":limited?"Rate limited":capped?"Budget reached":exhausted?"Exhausted":stale?"Needs update":row.remaining!==null?`${row.remaining}${row.quota_limit!==null?"/"+row.quota_limit:""} left`:row.budget!==null?`${Math.max(0,row.budget-row.attempts)} budget left`:`${row.attempts} local`;
  const percentage=!stale&&row.remaining!==null&&row.quota_limit!==null&&row.quota_limit>0
    ?Math.min(100,Math.max(0,(row.quota_limit-row.remaining)/row.quota_limit*100))
    :row.budget!==null&&row.budget>0?Math.min(100,row.attempts/row.budget*100):null;
  const provenance=!stale&&row.remaining!==null&&row.quota_limit!==null?"Provider-reported usage":"Personal local budget";
  return {status,value,percentage,provenance,warn:limited||capped||exhausted||row.alerts.length>0,stale};
}
