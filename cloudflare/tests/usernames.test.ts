import {it,expect,describe} from 'vitest';
import {interpret,platforms} from '../src/usernames';
import responses from './fixtures/username-responses.json';
describe('real public-profile response contracts',()=>{
 for(const response of responses)it(response.provider+' '+response.expected,()=>{const platform=platforms.find(p=>p.id===response.provider)!;const result=interpret(platform,response.target,response.status,response.data);expect(result.status).toBe(response.expected);if(result.status==='found'){expect(result.finding?.evidence).toMatch(/^https:\/\//);expect(result.finding?.confidence).toBe('low');expect(result.finding?.value).not.toHaveProperty('email')}})
 it('never reports a blocked or malformed response as absence',()=>{for(const p of platforms){expect(interpret(p,'example',403,{}).status).toBe('unavailable');expect(interpret(p,'example',429,{}).status).toBe('unavailable');expect(interpret(p,'example',200,{}).status).toBe('unavailable')}});
 it('requires an exact returned username, not a fuzzy display-name match',()=>{const p=platforms.find(p=>p.id==='gitlab')!;expect(interpret(p,'alice',200,[{username:'alice-other'}]).status).toBe('unavailable')});
 it('does not mistake GraphQL errors for a missing account',()=>{const p=platforms.find(p=>p.id==='opencollective')!;expect(interpret(p,'alice',200,{data:{account:null},errors:[{message:'Rate limited'}]}).status).toBe('unavailable')});
 it('uses fixed HTTPS endpoints and unique platform IDs',()=>{expect(new Set(platforms.map(p=>p.id)).size).toBe(platforms.length);for(const p of platforms){expect(new URL(p.endpoint).protocol).toBe('https:');expect(p.endpoint).not.toMatch(/https:\/\/[^/]*\{/);expect(p.timeout_ms).toBeLessThanOrEqual(4000)}})
});
