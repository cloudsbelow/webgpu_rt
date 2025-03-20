import * as fs from 'fs';
import { Allcb } from './src/util/util.js';

//const fs=require('fs');

let b64v = ""
for(let i=65; i<91; i++)b64v+=String.fromCharCode(i);
for(let i=97; i<123; i++)b64v+=String.fromCharCode(i);
for(let i=48; i<58; i++)b64v+=String.fromCharCode(i);
b64v+="+/";

function toB64(a){
  let str=""; let pad=(3-a.length%3)%3;
  for(let i=0; i<a.length; i+=3){
    let num = (a[i]<<16)+((a[i+1]??0)<<8)+(a[i+2]??0)
    str+=b64v[(num>>18)]+b64v[(num>>12)&0x3f]+b64v[(num>>6)&0x3f]+b64v[(num)&0x3f]
  }
  return str.substring(0,str.length-pad)+"==".substring(0,pad);
}

const basefolder = "assets/scene1/pillars-"
const out = "assets/scene1.js"
const files = ["cube.ind","cube.ver","dragon.ind","dragon.ver","pillar.ind","pillar.ver"]
let str="//forgive me\nexport const files = {};\n\n";
const cb = new Allcb(()=>{
  console.log("writing")
  fs.writeFileSync(out, str);
},files.length);

files.forEach(filepath=>{
  fs.access(basefolder+filepath,fs.constants.R_OK,(err)=>{
    fs.readFile(basefolder+filepath,(err,content)=>{
      str+=`files["${filepath}"] = "${toB64(new Uint8Array(content))}";\n\n`;
      cb.c();
    })
  })
})