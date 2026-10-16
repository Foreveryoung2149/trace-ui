/** Check our launch docs and compile README examples against the actual package. */
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));
const files=['README.md','docs/launch-demo.md','docs/webhook-doctor.md','assets/README.md'];
const external=new Set();let localLinks=0;
const slug=value=>value.toLowerCase().replace(/[`*_]/g,'').replace(/[^\p{L}\p{N}\s-]/gu,'').trim().replace(/\s/g,'-');
for(const name of files) {
  const path=resolve(root,name),source=await readFile(path,'utf8');
  for(const match of source.matchAll(/npm install (https:\/\/[^\s`]+)/g))external.add(match[1]);
  const links=[...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(match=>match[1]);
  for(const href of links) {
    if(href.startsWith('https://')){external.add(href);continue;}
    assert.ok(!href.includes('://'),`Unexpected link scheme in ${name}`);
    const [relative,fragment]=href.split('#');const target=relative?resolve(dirname(path),relative):path;
    assert.ok((await stat(target)).isFile(),`Missing local link in ${name}: ${href}`);localLinks++;
    if(fragment&&target.endsWith('.md')) {
      const targetText=await readFile(target,'utf8');
      const anchors=[...targetText.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match=>slug(match[1]));
      assert.ok(anchors.includes(fragment),`Missing Markdown anchor in ${name}: ${href}`);
    }
  }
}
const source=await readFile(resolve(root,'README.md'),'utf8');
const blocks=[...source.matchAll(/```tsx\r?\n([\s\S]*?)```/g)].map(match=>match[1]);
const canonical=path=>{const normalized=path.replaceAll('\\','/');return process.platform==='win32'?normalized.toLowerCase():normalized;};
const roots=blocks.map((_,index)=>resolve(root,`docs/__readme_example_${index}.tsx`).replaceAll('\\','/'));
const virtual=new Map(roots.map((path,index)=>[canonical(path),blocks[index]]));
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,jsx:ts.JsxEmit.ReactJSX,strict:true,noEmit:true,skipLibCheck:true};
const host=ts.createCompilerHost(options);
const existingSource=host.getSourceFile.bind(host),existingExists=host.fileExists.bind(host),existingRead=host.readFile.bind(host);
host.fileExists=path=>virtual.has(canonical(path))||existingExists(path);
host.readFile=path=>virtual.get(canonical(path))??existingRead(path);
host.getSourceFile=(path,languageVersion,onError,createNewSourceFile)=>virtual.has(canonical(path))?ts.createSourceFile(path,virtual.get(canonical(path)),languageVersion,true,ts.ScriptKind.TSX):existingSource(path,languageVersion,onError,createNewSourceFile);
const program=ts.createProgram(roots,options,host);
const diagnostics=ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:path=>path,getNewLine:()=> '\n'}));

let verifiedHttp=0;
if(process.argv.includes('--check-http'))for(const href of external) {
  const response=await fetch(href,{method:'HEAD',redirect:'follow',signal:AbortSignal.timeout(20000)});
  assert.ok(response.ok,`${href}: HTTP ${response.status}`);verifiedHttp++;
}
console.log(JSON.stringify({launchMarkdownFiles:files.length,localLinksChecked:localLinks,tsxExamplesCompiled:blocks.length,httpLinksVerified:verifiedHttp,registryAvailabilityClaimed:false}));
