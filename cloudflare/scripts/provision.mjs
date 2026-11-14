import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export async function database(api,account){
  const base=`/accounts/${encodeURIComponent(account)}/d1/database`;
  for(let page=1;page<=100;page++){
    const listing=await api(`${base}?per_page=100&page=${page}`);
    const matches=listing.result.filter(item=>item.name==='tracelet');
    if(matches.length>1)throw new Error('Multiple Tracelet databases found; choose one explicitly.');
    if(matches.length===1)return matches[0].uuid;
    if(listing.result.length<100||listing.result_info?.total_pages===page)break;
    if(page===100)throw new Error('Database listing exceeded the safety bound.');
  }
  return (await api(base,{method:'POST',body:JSON.stringify({name:'tracelet'})})).result.uuid;
}
export async function ensureKey(list,put){
  if(list.some(item=>item.name==='ENCRYPTION_KEY'))return false;
  await put(randomBytes(32).toString('base64'));return true;
}
async function main(){
  const account=process.env.CLOUDFLARE_ACCOUNT_ID;
  const token=process.env.CLOUDFLARE_API_TOKEN;
  if(!account||!token)throw new Error('Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in GitHub Actions repository secrets.');
  const api=async(path,options={})=>{
    const response=await fetch('https://api.cloudflare.com/client/v4'+path,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)});
    const data=await response.json();
    if(!response.ok||!data.success)throw new Error(`Cloudflare rejected ${options.method||'GET'} ${path} (HTTP ${response.status}). Check account ID and token permissions.`);
    return data;
  };
  if(process.argv[2]==='database'){
    const config=readFileSync('wrangler.jsonc','utf8');
    if(!config.includes('REPLACE_WITH_YOUR_D1_DATABASE_ID')){console.log('Using the existing configured D1 database.');return}
    const id=await database(api,account);
    if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error('Cloudflare did not return a valid database identifier.');
    writeFileSync('wrangler.jsonc',config.replace('REPLACE_WITH_YOUR_D1_DATABASE_ID',id));
    console.log('Tracelet database configured for this deployment.');
  }else if(process.argv[2]==='secret'){
    const base=`/accounts/${encodeURIComponent(account)}/workers/scripts/tracelet/secrets`;
    const listing=await api(base);
    const created=await ensureKey(listing.result,async value=>{
      await api(base,{method:'PUT',body:JSON.stringify({name:'ENCRYPTION_KEY',type:'secret_text',text:value})});
    });
    console.log(created?'Deployment encryption key created securely.':'Existing encryption key preserved.');
  }else throw new Error('Choose database or secret.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Cloudflare provisioning failed. Check the account ID, token permissions, and workflow step. No secret values were logged.');process.exitCode=1});
