import fs from 'fs'
import http from 'http'
import * as util from './src/util/util.js'

const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/x-icon'
}
const durls = {
  '/':"src/browser/index.html",
  '/favicon.ico':'src/browser/favicon.png'
}
function rejectReq(num, res, err){
  console.log("rejected a request with reason "+num+" for "+err);
  res.writeHead(num, { 'Content-Type': 'text/plain' });
  if(num == 404) res.end('not found');
  if(num == 500) res.end('server error');
}

const f = new util.FileContextServer('f', "./")

const server = http.createServer((req, res) => {
  console.log("SERVING: "+ req.url, req.method);
  const spath = req.url.split('/');
  if(spath[1]=='f'){
    return f.processRequest(req,res)
  }
  if(req.method === 'GET'){
    const file = durls[req.url]?durls[req.url]:req.url.slice(1);
    fs.access(file, fs.constants.R_OK, (err)=>{
      if(err) return rejectReq(404, res, err);
      const fstream = fs.createReadStream(file);
      res.writeHead(200, {'Content-Type': contentTypes[file.match(/\.[a-zA-Z]+$/)?.[0]]})
      fstream.pipe(res);
      fstream.on('close', ()=>{res.end()});
    });
  }
});
const port = 3000;
const address = '0.0.0.0'
server.listen(port, address, () => {
  console.log(`Server listening at http://${address}:${port}`);
});





