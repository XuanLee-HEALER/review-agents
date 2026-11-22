import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(resolve(root,process.env.PILOT_MANIFEST??"evals/reviewbench-pilot.json"),"utf8"));
for(const [path,hash] of Object.entries(manifest.runtime_hashes)) {
 if(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')!==hash)throw Error(`Frozen runtime changed: ${path}`);
}
const phase=process.argv[2]??'baseline';
if(!['baseline','controls','repeat'].includes(phase))throw Error('Use baseline, controls or repeat');
const output=resolve(root,process.env.PILOT_OUTPUT??'.local/eval-results/pilot-v1',phase);mkdirSync(output,{recursive:true});
const jobs: any[]=phase==='controls'?JSON.parse(readFileSync(resolve(root,'evals/pilot-controls.json'),'utf8')):manifest.cases.flatMap((c:any)=>Object.keys(c.candidate_reference_indices).map(role=>({id:c.nwo.replaceAll('/','_')+'-'+role,role,repo:resolve(root,'.local/eval-repos',c.nwo.replaceAll('/','_')),base:c.base,head:c.head,nwo:c.nwo}))).filter((j:any)=>phase!=='repeat'||['AA-Factory/aafactory-prototype','UniverseCitiz3n/msgraph-kb-mcp'].includes(j.nwo));
const selectedIds=process.env.PILOT_JOB_IDS?.split(',');
if(selectedIds){for(const id of selectedIds)if(!jobs.some(j=>j.id===id))throw Error(`Unknown job: ${id}`);for(let i=jobs.length-1;i>=0;i--)if(!selectedIds.includes(jobs[i].id))jobs.splice(i,1);}
let next=0;const results:any[]=[];
async function worker(){while(next<jobs.length){const j=jobs[next++];j.repo=resolve(root,j.repo);const dir=resolve(output,j.id);mkdirSync(dir,{recursive:true});
 const report=resolve(dir,'report.json'),task=resolve(dir,'task');const start=Date.now();
 const args=[process.execPath,resolve(root,`src/${j.role}.ts`),...(existsSync(resolve(task,'state.json'))?['--resume',task]:['--repo',j.repo,'--base',j.base,'--head',j.head,'--task',task,'--tool-sets',manifest.configuration.tool_sets]),'--model',manifest.configuration.model,'--effort',manifest.configuration.effort,'--max-turns','30','--compact-threshold','120000','--out',report];
 if(process.env.REVIEW_CONFIG)args.push('--config',process.env.REVIEW_CONFIG);
 console.log(`Start ${phase} ${j.id}`);
 const p=Bun.spawn(args,{cwd:j.repo,stdout:'ignore',stderr:Bun.file(resolve(dir,'progress.log'))});
 const exitCode=await p.exited;const r=existsSync(report)?JSON.parse(readFileSync(report,'utf8')):{};
 const item={...j,exitCode,status:r.status,findings:r.findings?.length,actualModels:r.actualModels,turns:r.turns,totalTokens:r.totalTokens,durationMs:Date.now()-start,report};
 writeFileSync(resolve(dir,'run.json'),JSON.stringify(item,null,2));results.push(item);writeFileSync(resolve(output,'results.json'),JSON.stringify(results,null,2));console.log(`Done ${j.id}: ${r.status}, ${r.findings?.length??0} findings`);
}}
await Promise.all([worker(),worker(),worker()]);
if(results.some(r=>r.exitCode===2))process.exitCode=2;
