import ts from 'typescript';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
// Parse source and compiler-erased output without importing application/provider modules.
const files = [];
function walk(dir) { for (const e of readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
  const p = `${dir}/${e.name}`; if(e.isDirectory()) walk(p); else if(p.endsWith('.ts')) files.push(p);
} }
walk('src');
const modules = new Set(files), all = new Map(), runtime = new Map(), lazy = [];
const pathOf = (file, spec) => spec.startsWith('.') ? relative('.', resolve(dirname(file), spec.replace(/\.js$/, '.ts'))).replaceAll('\\','/') : undefined;
function dependencies(file, source, types) {
  const found = new Set();
  function add(spec) { const p=pathOf(file,spec); if(modules.has(p)) found.add(p); }
  function visit(n) {
    if ((ts.isImportDeclaration(n)||ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) add(n.moduleSpecifier.text);
    if (types && ts.isImportTypeNode(n) && ts.isLiteralTypeNode(n.argument) && ts.isStringLiteral(n.argument.literal)) add(n.argument.literal.text);
    if (types && ts.isCallExpression(n) && n.expression.kind===ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(n.arguments[0])) lazy.push({from:file,to:pathOf(file,n.arguments[0].text)});
    ts.forEachChild(n,visit);
  }
  visit(ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true)); return [...found].sort();
}
for(const file of files) {
  const source=readFileSync(file,'utf8'); all.set(file,dependencies(file,source,true));
  const emitted=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  runtime.set(file,dependencies(file,emitted,false));
}
function backEdges(g) {
  const state=new Map(), stack=[], out=[];
  function visit(n) { state.set(n,1); stack.push(n); for(const d of g.get(n)??[]) {
    if(state.get(d)===1) out.push([...stack.slice(stack.indexOf(d)),d]); else if(!state.has(d)) visit(d);
  } stack.pop(); state.set(n,2); }
  for(const n of g.keys()) if(!state.has(n)) visit(n); return out;
}
function components(g) {
  let next=0; const index=new Map(),low=new Map(),stack=[],active=new Set(),out=[];
  function visit(n) { index.set(n,next);low.set(n,next++);stack.push(n);active.add(n);
    for(const d of g.get(n)??[]) { if(!index.has(d)){visit(d);low.set(n,Math.min(low.get(n),low.get(d)));}else if(active.has(d)) low.set(n,Math.min(low.get(n),index.get(d))); }
    if(low.get(n)===index.get(n)){const c=[];let d;do{d=stack.pop();active.delete(d);c.push(d);}while(d!==n);if(c.length>1||(g.get(n)??[]).includes(n))out.push(c.sort());}
  }
  for(const n of g.keys())if(!index.has(n))visit(n);return out.sort((a,b)=>a[0].localeCompare(b[0]));
}
const result={method:'TypeScript AST static imports/reexports/import-type queries; emitted JS static imports for runtime initialization. DFS back-edges are not an enumeration of all simple cycles.',modules:files.length,
 source_back_edges:backEdges(all),source_components:components(all),runtime_back_edges:backEdges(runtime),runtime_components:components(runtime),
 runtime_edges:[...runtime].flatMap(([from,ds])=>ds.map(to=>({from,to}))),
 runtime_graph_sha256:createHash('sha256').update(JSON.stringify([...runtime])).digest('hex'),lazy_import_edges:lazy};
result.runtime_edge_count=result.runtime_edges.length;
result.runtime_edges_sha256=createHash('sha256').update(JSON.stringify(result.runtime_edges)).digest('hex');
delete result.runtime_edges; // Keep exact graph fingerprint/count; avoid duplicating hundreds of unchanged edges.
const output=process.argv[2];if(output){mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({modules:result.modules,source_back_edges:result.source_back_edges.length,source_components:result.source_components.length,runtime_back_edges:result.runtime_back_edges.length,runtime_components:result.runtime_components.length,runtime_graph_sha256:result.runtime_graph_sha256}));
