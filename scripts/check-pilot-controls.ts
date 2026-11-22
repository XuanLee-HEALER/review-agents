import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(import.meta.dir,'..');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const baseline=resolve(root,'.local/eval-repos/Imageomics_catalog');
async function evaluate(repo:string, file:string, fail:boolean){
 const source=readFileSync(resolve(repo,file),'utf8');
 const calls:string[]=[];const warnings:unknown[]=[];const tags=new Set();
 const item={id:'outside/model',tags:['sample']};
 const fetch=async(url:string)=>{calls.push(url);if(fail)throw Error('synthetic failure');return {ok:true,json:async()=>item};};
 const get=async(url:string)=>{if(url.includes('?author='))return {json:[]};const r=await fetch(url);return {json:await r.json()};};
 const args=['fetch','get','ADDITIONAL_HF_REPOS','ORGANIZATION_NAME','API_BASE_URL','console','allTags'];
 const values=[fetch,get,[{type:'models',repo:item.id}],'org','https://fixture.invalid/',{warn:(...x:unknown[])=>warnings.push(x),log:()=>{},error:()=>{}},tags];
 let body:string;
 if(file==='scripts/export-tags.js'){
  const a=source.indexOf('const collectHFTags =');const b=source.indexOf('\n};',a)+3;
  body=source.slice(a,b)+'\nawait collectHFTags("models");return [...allTags];';
 }else{
  const a=source.indexOf('// Fetch additional HF repos');
  // Include the inserted declaration in the repaired source.
  const declaration=source.lastIndexOf('const additionalFullIds',a);
  const start=declaration>=0?declaration:a;const end=source.indexOf('// Process the data',a);
  body='let hfItems=[];const repoType="models";'+source.slice(start,end)+';return hfItems;';
 }
 const result=await new AsyncFunction(...args,body)(...values);
 return {calls:calls.length,warnings:warnings.length,result};
}
const checks:any[]=[];
for(const file of ['main.js','scripts/export-tags.js']){
 const before=await evaluate(baseline,file,false);const after=await evaluate(resolve(root,'.local/eval-controls/catalog-performance'),file,false);
 if(before.calls!==2||after.calls!==1||JSON.stringify(before.result)!==JSON.stringify(after.result))throw Error('Duplicate fetch control failed');
 checks.push({file,baselineCalls:before.calls,repairedCalls:after.calls,equalResult:true});
}
const before=await evaluate(baseline,'scripts/export-tags.js',true);const after=await evaluate(resolve(root,'.local/eval-controls/catalog-quality'),'scripts/export-tags.js',true);
if(before.warnings!==0||after.warnings!==1||JSON.stringify(before.result)!==JSON.stringify(after.result))throw Error('Diagnostic control failed');
checks.push({baselineWarnings:before.warnings,repairedWarnings:after.warnings,equalResult:true});
writeFileSync(resolve(root,'.local/eval-results/pilot-v1/control-checks.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks,null,2));
