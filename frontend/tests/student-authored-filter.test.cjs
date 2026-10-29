const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/js/views/students/StudentsView.js'),'utf8');

test('Created-by-me remains a separate dynamic scope from edited-by-me',()=>{
 const method=source.slice(source.indexOf('  getStudentListParams('),source.indexOf('  async refreshStudentTable('));
 const view=vm.runInNewContext(`({${method}})`);
 const authored=view.getStudentListParams({studentScope:'authored'});
 assert.equal(authored.scope,'authored');assert.equal(authored.branch_id,undefined);
 assert.equal(view.getStudentListParams({studentScope:'created'}).scope,'created');
 assert.equal(view.getStudentListParams({studentScope:'all'}).scope,'all');
 assert(source.includes('>Creados por mí</option>'));
 assert(source.includes('>Creados o modificados por mí</option>'));
});
