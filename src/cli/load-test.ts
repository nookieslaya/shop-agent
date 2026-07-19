import { loadTestReport } from "../observability/load-test-report.js";
const args=Object.fromEntries(process.argv.slice(2).filter(item=>item.startsWith("--")).map(item=>{const [key,...value]=item.slice(2).split("=");return[key,value.join("=")||"true"]}));
const base=String(args.url??"http://localhost:3000").replace(/\/$/,""),target=String(args.target??"health"),requests=Math.min(1000,Math.max(1,Number(args.requests??50))),concurrency=Math.min(50,Math.max(1,Number(args.concurrency??5))),storeId=String(args["store-id"]??"");
if(target!=="health"&&target!=="chat")throw new Error("--target must be health or chat");
if(target==="chat"&&(!storeId||args.confirm!==storeId))throw new Error("Chat load test requires --store-id=ID --confirm=ID because it can consume OpenAI quota");
const url=target==="health"?`${base}/health`:`${base}/v1/chat`,latencies:number[]=[],started=Date.now();let errors=0,next=0;
async function worker(){while(next<requests){next++;const requestStarted=Date.now();try{const response=await fetch(url,target==="health"?{}:{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({storeId,message:String(args.message??"Pokaż dostępne produkty")})});if(!response.ok)errors++;await response.arrayBuffer()}catch{errors++}latencies.push(Date.now()-requestStarted)}}
await Promise.all(Array.from({length:Math.min(concurrency,requests)},worker));
console.log(JSON.stringify({target,url,...loadTestReport(latencies,errors,Date.now()-started)},null,2));
if(errors)process.exitCode=1;
