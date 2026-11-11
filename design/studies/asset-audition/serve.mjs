import {createServer} from 'vite';
const server=await createServer({root:process.cwd(),configFile:false,server:{host:'127.0.0.1',port:5192,strictPort:true}});
await server.listen();console.log('Asset audition: http://127.0.0.1:5192/design/studies/asset-audition/viewer.html');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close().then(()=>process.exit()));
