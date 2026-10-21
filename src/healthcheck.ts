import http from 'node:http';

const port = Number(process.env.PFLUX_PORT ?? 8787);
http
  .get({ host: '127.0.0.1', port, path: '/healthz', timeout: 3000 }, (res) => {
    res.resume();
    process.exit(res.statusCode === 200 ? 0 : 1);
  })
  .on('error', () => process.exit(1));
