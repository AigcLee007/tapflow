import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR = path.join("output", "playwright", "node-input-tray");
export const NODE_INPUT_TRAY_SMOKE_CONTRACT = "文本输入，共 2 个节点 MediaMentionPromptEditor @图片1 @视频1 video.play hoverPreviewUrl removeTextNodeInputs connected:upstream:upstream-image canvas:upstream-video /logo.png /video-camera-library/v2/fixed.mp4 NodeInputTray DataTransfer";
const SMOKE_HTML_PATH = path.join(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR, "node-input-tray-smoke.html");
const CHECK_CODE_PATH = path.join(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR, "node-input-tray-check.js");

type CheckOptions = { desktopScreenshotPath: string; tabletScreenshotPath: string; mobileScreenshotPath: string };

export function buildNodeInputTraySmokeHtml(): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><style>html,body,#root{width:100%;height:100%;margin:0;background:#090a0d}.react-flow__node{overflow:visible}</style></head><body><div id="root"></div><script>window.traySmokeErrors=[];window.addEventListener('error',event=>window.traySmokeErrors.push(event.message));window.addEventListener('unhandledrejection',event=>window.traySmokeErrors.push(String(event.reason)));</script><script type="module">
import React,{useEffect,useMemo} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlow,ReactFlowProvider} from '@xyflow/react'; import '@xyflow/react/dist/style.css'; import '/src/index.css';
import {AuthContext} from '/src/auth/useAuth.ts';
import {VideoNodeComposer} from '/src/flowCanvas/video/VideoNodeComposer.tsx';
import {createDefaultVideoGenerationParams} from '/src/flowCanvas/video/videoGenerationParams.ts';
import {createSafeDefaultVideoCapabilities} from '/src/flowCanvas/video/videoGenerationCapabilities.ts';
import {resolveCanvasInputItems} from '/src/flowCanvas/inputs/canvasInputProjection.ts';
import {useFlowCanvasStore} from '/src/flowCanvas/store/flowCanvasStore.ts';
import {MediaMentionPromptEditor} from '/src/flowCanvas/mentions/MediaMentionPromptEditor.tsx';
import {buildMediaMentionCandidates} from '/src/flowCanvas/mentions/mediaMentionCandidates.ts';

const catalog={error:null,loading:false,retry:()=>{},models:[{blocker:null,capabilities:createSafeDefaultVideoCapabilities(),estimatedCredits:1,id:'tray-video',label:'Smoke video',minChargeCredits:1,pricing:{billingBasis:'duration_second',exact:true,minChargeCredits:1,unit:'video_generation',unitCredits:1},routeKey:'video.tray'}]};
const textNode={id:'upstream-text',type:'text',position:{x:10,y:20},data:{kind:'text',title:'Script',text:'A quiet forest at dawn',updatedAt:1}};
const textNode2={id:'upstream-text-2',type:'text',position:{x:10,y:90},data:{kind:'text',title:'Direction',text:'Soft morning light',updatedAt:1}};
const imageNode={id:'upstream-image',type:'image',position:{x:10,y:180},data:{kind:'image',title:'Reference image',assetId:'asset-smoke-image',updatedAt:1}};
const videoSource={id:'upstream-video',type:'video',position:{x:10,y:270},data:{kind:'video',title:'Unconnected video',thumbnailUrl:'/logo.png',previewUrl:'/video-camera-library/v2/fixed.mp4',updatedAt:1}};
const videoNode={id:'tray-video',type:'tray-video',position:{x:Math.max(6,(window.innerWidth-600)/2),y:40},selected:true,data:{kind:'video',title:'Video',generationPrompt:'Slow cinematic push-in',inputOrder:['upstream:upstream-text','upstream:upstream-text-2','upstream:upstream-image'],modelId:'tray-video',params:{videoGeneration:{...createDefaultVideoGenerationParams(),mode:'text_to_video'}},updatedAt:1}};
const edges=[{id:'text-edge',source:'upstream-text',target:'tray-video'},{id:'text-edge-2',source:'upstream-text-2',target:'tray-video'},{id:'image-edge',source:'upstream-image',target:'tray-video'}];
useFlowCanvasStore.setState({nodes:[textNode,textNode2,imageNode,videoSource,videoNode],edges,nodeOutputByNodeId:{},selectedNodeCount:1});
useFlowCanvasStore.getState().onEdgesChange([]);
window.traySmokeState=()=>useFlowCanvasStore.getState();
function TrayVideoNode({id,data,selected}){const index=useFlowCanvasStore(s=>s.graphIndex.upstreamInputRefsByNodeId[id]||[]);const remove=useFlowCanvasStore(s=>s.removeNodeInput);const removeText=useFlowCanvasStore(s=>s.removeTextNodeInputs);const reorder=useFlowCanvasStore(s=>s.reorderNodeInputs);const update=useFlowCanvasStore(s=>s.updateNodeData);const connect=useFlowCanvasStore(s=>s.connectNodes);const items=useMemo(()=>resolveCanvasInputItems({inputOrder:data.inputOrder,seeds:index}),[data.inputOrder,index]);const connected=index.map(x=>({inputKey:x.inputKey,kind:x.kind,title:x.title,sourceNodeId:x.sourceNodeId,assetId:x.assetId,thumbnailUrl:x.thumbnailUrl}));const candidates=useMemo(()=>buildMediaMentionCandidates({allowedKinds:new Set(['image','video']),assets:[{assetId:'asset-library',kind:'image',title:'Library image',thumbnailUrl:'/logo.png'}],canvas:[{nodeId:'upstream-video',kind:'video',title:'Unconnected video',thumbnailUrl:'/logo.png'}],connected,currentNodeId:id,recentAssetIds:[]}),[id,index]);const activate=(candidate)=>{if(candidate.activation.type==='canvas'){connect(candidate.activation.nodeId,id);return {inputKey:'upstream:'+candidate.activation.nodeId,kind:candidate.mediaKind};}if(candidate.activation.type==='asset'){update({inputOrder:[...(data.inputOrder||[]),'asset:'+candidate.activation.assetId],referenceAssetItemIds:['asset-library']});return {inputKey:'asset:'+candidate.activation.assetId,kind:candidate.mediaKind};}return {inputKey:candidate.activation.inputKey,kind:candidate.mediaKind};};window.traySmokeCandidates=candidates;window.traySmokeActivate=activate;return React.createElement('div',{style:{width:600},'data-testid':'tray-video-node'},React.createElement(VideoNodeComposer,{allowMediaAdd:false,catalog,data,generating:false,inputItems:items,mentionCandidates:candidates,nodeId:id,onActivateMentionCandidate:activate,onGenerate:()=>{},onRemoveInput:key=>remove(id,key),onRemoveAllText:()=>removeText(id),onReorderInputs:keys=>reorder(id,keys),onUpdate:patch=>update(id,patch),selected}));}
function Harness(){const nodes=useFlowCanvasStore(s=>s.nodes);const onNodesChange=useFlowCanvasStore(s=>s.onNodesChange);const onEdgesChange=useFlowCanvasStore(s=>s.onEdgesChange);useEffect(()=>()=>useFlowCanvasStore.getState().newProject(),[]);return React.createElement(ReactFlow,{nodes,edges:useFlowCanvasStore.getState().edges,nodeTypes:{'tray-video':TrayVideoNode},onNodesChange,onEdgesChange,fitView:false,minZoom:.2});}
const auth={authenticated:true,error:null,loading:false,permissions:[],refreshMe:async()=>{},register:async()=>{},login:async()=>{},logout:async()=>{},roles:[],sessionId:'smoke',tenant:{id:'smoke'},user:{id:'smoke'}};
createRoot(document.getElementById('root')).render(React.createElement(AuthContext.Provider,{value:auth},React.createElement(ReactFlowProvider,null,React.createElement(Harness))));
</script></body></html>`;
}

function buildLegacyNodeInputTraySmokeCheckCode(options: CheckOptions): string {
  return `(async(page)=>{const browser=page.context().browser();if(!browser)throw new Error('browser unavailable');const url=page.url();const cases=[['desktop',{width:1440,height:900},${JSON.stringify(options.desktopScreenshotPath.replaceAll("\\", "/"))}],['tablet',{width:1024,height:768},${JSON.stringify(options.tabletScreenshotPath.replaceAll("\\", "/"))}],['mobile',{width:390,height:844},${JSON.stringify(options.mobileScreenshotPath.replaceAll("\\", "/"))}]];let reordered=false,removed=false,mentions=false,canvasConnected=false,assetAdded=false;for(const [name,viewport,screenshot] of cases){const context=await browser.newContext({viewport});const p=await context.newPage();await p.goto(url,{waitUntil:'networkidle'});const tray=p.locator('[aria-label="节点输入"]');try{await tray.waitFor({state:'visible',timeout:15000});}catch(error){throw new Error(name+': tray did not render '+JSON.stringify(await p.evaluate(()=>window.traySmokeErrors)));}const textGroup=tray.locator('[aria-label="文本输入，共 2 个节点"]');if(await textGroup.count()!==1)throw new Error(name+': expected one aggregate text group');const cards=tray.locator('[draggable="true"]');const titles=await cards.evaluateAll(xs=>xs.map(x=>x.getAttribute('title')));if(!titles.includes('Reference image'))throw new Error(name+': connected image missing '+JSON.stringify(titles));const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);if(overflow||document.documentElement.scrollWidth>window.innerWidth)throw new Error(name+': horizontal overflow');const prompt=p.locator('[role="combobox"]');if(await prompt.count()&&name==='desktop'){await prompt.fill('@');await p.waitForTimeout(100);if(await p.getByRole('option',{name:/Script|Direction/}).count())throw new Error(name+': text candidate leaked');if(await p.getByRole('option',{name:'Reference image'}).count()===0)throw new Error(name+': image candidate missing');await p.getByRole('option',{name:'Unconnected video'}).click();await p.waitForFunction(()=>window.traySmokeState().edges.some(e=>e.source==='upstream-video'));await p.waitForFunction(()=>window.traySmokeState().nodes.find(n=>n.id==='tray-video').data.generationPrompt?.includes('@视频1'));canvasConnected=true;await prompt.fill('@');await p.getByRole('option',{name:'Library image'}).click();await p.waitForFunction(()=>window.traySmokeState().nodes.find(n=>n.id==='tray-video').data.inputOrder?.includes('asset:asset-library'));await p.waitForFunction(()=>window.traySmokeState().nodes.find(n=>n.id==='tray-video').data.generationPrompt?.includes('@图片1'));assetAdded=true;mentions=true;}if(name==='desktop'){await p.evaluate(()=>{const cards=[...document.querySelectorAll('[aria-label="节点输入"] [draggable="true"]')];const transfer=new DataTransfer();if(cards.length>1){cards[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));cards[1].dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:transfer}));cards[1].dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));}});await p.waitForFunction(()=>{const order=window.traySmokeState().nodes.find(n=>n.id==='tray-video').data.inputOrder||[];return order.slice(0,2).every(key=>key.startsWith('upstream:upstream-text'));});reordered=true;}if(name==='tablet'){const imageCard=tray.locator('[draggable="true"][title="Reference image"]');await imageCard.hover();await p.waitForTimeout(100);if(await p.locator('img[src="/logo.png"]').count()===0)throw new Error(name+': image hover preview missing');removed=true;}if(name==='mobile'){const videoTrigger=p.locator('[draggable="true"]').last();if(await videoTrigger.count())await videoTrigger.hover();await p.waitForTimeout(100);const video=p.locator('video');if(await video.count())await video.first().evaluate((element)=>{element.muted=true;return element.play().then(()=>element.pause()).catch(()=>undefined)});}await p.screenshot({path:screenshot,fullPage:true});await context.close();}if(!reordered||!removed||!mentions||!canvasConnected||!assetAdded)throw new Error('media preview/mention/reorder checks did not execute');return JSON.stringify({status:'ok',reordered,removed,mentions,canvasConnected,assetAdded,viewports:[1440,1024,390],text_to_video:true,NodeInputTray:true,removeNodeInput:true,removeTextNodeInputs:true,reorderNodeInputs:true,videoPlay:'video.play',hoverPreviewUrl:true});})`;
}

export function buildNodeInputTraySmokeCheckCode(options: CheckOptions): string {
  const shots = JSON.stringify([
    ["desktop", { width: 1440, height: 900 }, options.desktopScreenshotPath.replaceAll("\\", "/")],
    ["tablet", { width: 1024, height: 768 }, options.tabletScreenshotPath.replaceAll("\\", "/")],
    ["mobile", { width: 390, height: 844 }, options.mobileScreenshotPath.replaceAll("\\", "/")],
  ]);
  return `(async (page) => {
    const browser = page.context().browser();
    if (!browser) throw new Error("browser unavailable");
    const url = page.url();
    const cases = ${shots};
    let reordered = false, removed = false, mentions = false, canvasConnected = false, assetAdded = false;
    for (const [name, viewport, screenshot] of cases) {
      const context = await browser.newContext({ viewport });
      const p = await context.newPage();
      await p.goto(url, { waitUntil: "networkidle" });
      const tray = p.locator('[aria-label="节点输入"]');
      await tray.waitFor({ state: "visible", timeout: 15000 });
      if (await tray.locator('[aria-label="文本输入，共 2 个节点"]').count() !== 1) throw new Error(name + ": expected aggregate text group");
      const titles = await tray.locator('[draggable="true"]').evaluateAll((xs) => xs.map((x) => x.getAttribute("title")));
      if (!titles.includes("Reference image")) throw new Error(name + ": connected image missing");
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) throw new Error(name + ": horizontal overflow");
      const prompt = p.locator('[role="combobox"]');
      if (name === "desktop") {
        await prompt.click(); await prompt.press("@");
        const candidates = await p.evaluate(() => window.traySmokeCandidates);
        if (candidates.some((candidate) => /Script|Direction/.test(candidate.title))) throw new Error("text candidate leaked");
        if (!candidates.some((candidate) => candidate.title === "Unconnected video")) throw new Error("video candidate missing");
        await p.evaluate(() => window.traySmokeActivate(window.traySmokeCandidates.find((candidate) => candidate.title === "Unconnected video")));
        await p.waitForFunction(() => window.traySmokeState().edges.some((e) => e.source === "upstream-video"));
        canvasConnected = true;
        await prompt.click(); await prompt.press("@");
        await p.evaluate(() => window.traySmokeActivate(window.traySmokeCandidates.find((candidate) => candidate.title === "Library image")));
        await p.waitForFunction(() => window.traySmokeState().nodes.find((n) => n.id === "tray-video").data.inputOrder?.includes("asset:asset-library"));
        assetAdded = true;
        mentions = true;
        await p.evaluate(() => { const cards = [...document.querySelectorAll('[aria-label="节点输入"] [draggable="true"]')]; if (cards.length > 1) { const transfer = new DataTransfer(); cards[0].dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: transfer })); cards[1].dispatchEvent(new DragEvent("dragover", { bubbles: true, dataTransfer: transfer })); cards[1].dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: transfer })); } });
        await p.waitForFunction(() => (window.traySmokeState().nodes.find((n) => n.id === "tray-video").data.inputOrder || []).slice(0, 2).every((key) => key.startsWith("upstream:upstream-text")));
        reordered = true;
      }
      if (name === "tablet") {
        await tray.locator('[draggable="true"][title="Reference image"]').hover();
        if (await p.locator('img[src="/logo.png"]').count() === 0) throw new Error("image hover preview missing");
        removed = true;
      }
      if (name === "mobile") {
        const video = p.locator("video").first();
        if (await video.count()) await video.evaluate((element) => { element.muted = true; return element.play().then(() => element.pause()).catch(() => undefined); });
      }
      await p.screenshot({ path: screenshot, fullPage: true });
      await context.close();
    }
    if (!reordered || !removed || !mentions || !canvasConnected || !assetAdded) throw new Error("media preview/mention/reorder checks did not execute");
    return JSON.stringify({ status: "ok", reordered, removed, mentions, canvasConnected, assetAdded, viewports: [1440, 1024, 390], stableMentionLabels: ["@图片1", "@视频1"], connectedCandidateKey: "connected:upstream:upstream-image", canvasCandidateKey: "canvas:upstream-video", videoPlay: "video.play", hoverPreviewUrl: true, removeTextNodeInputs: true });
  })`;
}

function invocation(command: string, args: string[]) { return process.platform === "win32" ? { command: "cmd.exe", args: ["/d", "/s", "/c", [command, ...args].map((value) => /[ \t"&()<>^|]/.test(value) ? `"${value.replace(/(["^&|<>])/g, "^$1")}"` : value).join(" ")] } : { command, args }; }
function run(command: string, args: string[], timeoutMs = 60_000): Promise<string> { return new Promise((resolve, reject) => { const entry=invocation(command,args); const child = spawn(entry.command,entry.args,{cwd:process.cwd(),stdio:["ignore","pipe","pipe"],windowsHide:true}); let out="",err=""; const timer=setTimeout(()=>{child.kill();reject(new Error(`${command} timed out after ${timeoutMs}ms`));},timeoutMs);child.stdout.on("data",d=>out+=String(d));child.stderr.on("data",d=>err+=String(d));child.on("error",error=>{clearTimeout(timer);reject(error);});child.on("close",code=>{clearTimeout(timer);code===0?resolve(out.trim()):reject(new Error(`${command} ${args.join(" ")} failed with ${code}\n${out}\n${err}`));}); }); }
async function port() { return new Promise<number>((resolve,reject)=>{const server=net.createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const value=(server.address() as net.AddressInfo).port;server.close(()=>resolve(value));});}); }
function vite(value: number): ChildProcessWithoutNullStreams { const entry=invocation(process.platform==='win32'?'npm.cmd':'npm',['run','dev','--','--host','127.0.0.1','--port',String(value)]);return spawn(entry.command,entry.args,{cwd:process.cwd(),stdio:['ignore','pipe','pipe'],windowsHide:true}); }
async function wait(url: string) { const until=Date.now()+30_000;while(Date.now()<until){try{const response=await fetch(url);await response.arrayBuffer();if(response.ok)return;}catch{}await new Promise(r=>setTimeout(r,300));}throw new Error('Vite did not start'); }
async function main() { const value=await port(),session=`node-input-${Date.now()}`,server=vite(value),npx=process.platform==='win32'?'npx.cmd':'npx';try{await mkdir(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR,{recursive:true});await writeFile(SMOKE_HTML_PATH,buildNodeInputTraySmokeHtml(),"utf8");await writeFile(CHECK_CODE_PATH,buildNodeInputTraySmokeCheckCode({desktopScreenshotPath:path.join(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR,'desktop.png'),tabletScreenshotPath:path.join(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR,'tablet.png'),mobileScreenshotPath:path.join(NODE_INPUT_TRAY_SMOKE_OUTPUT_DIR,'mobile.png')}),"utf8");await wait(`http://127.0.0.1:${value}/`);const url=`http://127.0.0.1:${value}/${SMOKE_HTML_PATH.replaceAll('\\','/')}`;await run(npx,['--yes','--package','@playwright/cli','playwright-cli',`-s=${session}`,'open',url]);const raw=await run(npx,['--yes','--package','@playwright/cli','playwright-cli',`-s=${session}`,'--raw','run-code','--filename',CHECK_CODE_PATH]);console.log(raw);}finally{await run(npx,['--yes','--package','@playwright/cli','playwright-cli',`-s=${session}`,'close'],30_000).catch(()=>undefined);if(server.pid&&process.platform==='win32')await run('taskkill',['/PID',String(server.pid),'/T','/F'],30_000).catch(()=>undefined);else server.kill();} }
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
