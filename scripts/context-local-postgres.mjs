/** Explicit local fallback: a separate PG16 cluster in tmpfs, never the container's existing database. */
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
export async function startTmpfsContextPostgres(container) {
  if(!/^[A-Za-z0-9_.-]+$/.test(container)) throw new Error('LOCAL_CONTAINER_NAME_INVALID');
  const directory='/dev/shm/context-proof-'+randomUUID();
  const pgPort=20000+Math.floor(Math.random()*30000);
  const run=args=>execFileSync('docker',['exec','-u','postgres',container,...args],{encoding:'utf8',stdio:'pipe',timeout:60000});
  if(!run(['postgres','--version']).includes(' 16.')) throw new Error('LOCAL_PG16_REQUIRED');
  let server;const connections=new Set();let started=false;
  async function close() {
    for(const child of connections) child.kill();
    if(server) await new Promise(resolve=>server.close(resolve));
    if(started) run(['pg_ctl','-D',directory,'-m','immediate','-w','stop']);
    run(['rm','-rf',directory]);
  }
  try {
    run(['initdb','-D',directory,'-U','postgres','--auth=trust','--wal-segsize=1','--no-locale']);
    run(['pg_ctl','-D',directory,'-l',directory+'/proof.log','-o',
      `-p ${pgPort} -h 127.0.0.1 -k ${directory} -c shared_buffers=2MB -c min_wal_size=2MB -c max_wal_size=8MB -c max_connections=20`,'-w','start']);
    started=true;
    server=createServer(socket=>{
      const child=spawn('docker',['exec','-i',container,'nc','127.0.0.1',String(pgPort)],{stdio:['pipe','pipe','pipe']});
      connections.add(child);socket.pipe(child.stdin);child.stdout.pipe(socket);
      child.stderr.resume();child.on('error',()=>socket.destroy());child.on('exit',()=>{connections.delete(child);socket.destroy();});
      socket.on('error',()=>child.kill());socket.on('close',()=>child.kill());child.stdin.on('error',()=>socket.destroy());
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    return {port:server.address().port,close};
  } catch(error) {await close().catch(()=>{});throw error;}
}
