const TAG=/^#[0289PYLQGRJCUV]{3,15}$/;
const PHONE=/^[1-9][0-9]{7,14}$/;
const normal=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');

function records(text,delimiter) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"' && text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;continue;}
    if(c==='"'){if(cell)throw new Error('Aspas fora de um campo CSV.');quoted=true;}
    else if(c===delimiter){row.push(cell);cell='';}
    else if(c==='\n' || c==='\r'){if(c==='\r' && text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('Aspas sem fechamento no CSV.');
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}

export function previewContactCsv(text,existing=[]) {
  if(typeof text!=='string' || text.length>200000)throw new Error('O CSV deve ter no máximo 200 KB.');
  const source=text.replace(/^\uFEFF/,'');const first=source.split(/\r?\n/,1)[0];
  const comma=records(first,',')[0]?.length||0,semicolon=records(first,';')[0]?.length||0;
  const rows=records(source,semicolon>comma?';':',');if(rows.length<2)throw new Error('O CSV precisa de cabeçalho e ao menos uma linha.');
  if(rows.length>501)throw new Error('O CSV pode ter no máximo 500 linhas.');
  const headers=rows.shift().map(normal);
  const tagIndex=headers.findIndex(x=>['tag','tagdojogador','playertag','clashtag'].includes(x));
  const phoneIndex=headers.findIndex(x=>['telefone','phone','phone1value','celular'].includes(x));
  if(tagIndex<0 || phoneIndex<0)throw new Error('Inclua as colunas Tag e Telefone (ou Phone 1 - Value).');
  const known=new Set(existing),seen=new Set(),valid=[],errors=[];
  for(const [index,row] of rows.entries()){
    const tag=(row[tagIndex]||'').trim().toUpperCase();const raw=(row[phoneIndex]||'').trim();const phone=raw.replace(/\D/g,'');
    let reason='';
    if(row.length!==headers.length)reason='Quantidade de colunas diferente do cabeçalho.';
    else if(!TAG.test(tag))reason='Tag inválida.';
    else if(seen.has(tag))reason='Tag repetida no arquivo.';
    else if(!/^\+?[0-9 ()-]+$/.test(raw) || !PHONE.test(phone))reason='Telefone inválido; informe o código do país.';
    if(reason)errors.push({line:index+2,reason});else{valid.push({playerTag:tag,phone,action:known.has(tag)?'Atualizar':'Cadastrar'});seen.add(tag);}
  }
  return {valid,errors};
}
