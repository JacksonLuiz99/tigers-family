import test from 'node:test';
import assert from 'node:assert/strict';
import { previewContactCsv } from '../public/contact-import.js';

test('prévia aceita CSV simples e exportação do Google com Tag adicional',()=>{
  const simple=previewContactCsv('Tag;Telefone\n#98Q9LLG2P;+55 (65) 99999-9999\n',['#98Q9LLG2P']);
  assert.deepEqual(simple.valid,[{playerTag:'#98Q9LLG2P',phone:'5565999999999',action:'Atualizar'}]);
  const google=previewContactCsv('\uFEFFName,Phone 1 - Value,Tag\n"Ana, Tiger",+5565999999999,#98Q9LLG2P\n');
  assert.equal(google.valid[0].action,'Cadastrar');
});
test('prévia separa erros, tags repetidas e campos com quebras de linha',()=>{
  const data=previewContactCsv('Tag,Phone 1 - Value,Notes\n#98Q9LLG2P,+5565999999999,"linha 1\nlinha 2"\n#98Q9LLG2P,+5565999999999,duplicado\n#INVALID,+5565999999999,ruim');
  assert.equal(data.valid.length,1);assert.deepEqual(data.errors.map(x=>x.reason),['Tag repetida no arquivo.','Tag inválida.']);
  assert.throws(()=>previewContactCsv('Nome,Telefone\nAna,123'),/Tag/);
  assert.throws(()=>previewContactCsv('Tag,Telefone\n#98Q9LLG2P,"+5565999999999'),/Aspas/);
});
