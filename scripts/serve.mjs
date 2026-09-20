import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 8080;
const rootDir = process.cwd();

const server = http.createServer((req, res) => {
  let relativePath = req.url.split('?')[0];
  if (relativePath === '/' || relativePath === '') {
    res.writeHead(302, { Location: '/manager/' });
    res.end();
    return;
  } else if (relativePath.startsWith('/manager/')) {
    relativePath = relativePath.replace('/manager/', '/active/manager/');
  } else if (relativePath === '/manager') {
    relativePath = '/active/manager/index.html';
  } else if (relativePath.startsWith('/app/')) {
    relativePath = relativePath.replace('/app/', '/active/dashboard/');
  } else if (relativePath === '/app' || relativePath === '/mobile') {
    relativePath = '/active/dashboard/index.html';
  } else if (relativePath.startsWith('/business/')) {
    relativePath = relativePath.replace('/business/', '/active/business/');
  }

  let filePath = path.join(rootDir, relativePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Not Found: ${req.url}`);
    } else {
      let contentType = 'text/html; charset=utf-8';
      if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) contentType = 'application/javascript; charset=utf-8';
      if (filePath.endsWith('.css')) contentType = 'text/css; charset=utf-8';
      if (filePath.endsWith('.json')) contentType = 'application/json; charset=utf-8';
      if (filePath.endsWith('.png')) contentType = 'image/png';
      if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) contentType = 'image/jpeg';
      if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
      if (filePath.endsWith('.csv')) contentType = 'text/plain; charset=utf-8';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`========================================================`);
  console.log(`🚀 POSTING MAP Local Server Running:`);
  console.log(`   👉 Manager Dashboard: http://localhost:${PORT}/manager/`);
  console.log(`   👉 H-App (Mobile):     http://localhost:${PORT}/app/`);
  console.log(`   👉 Root URL:           http://localhost:${PORT}/`);
  console.log(`========================================================`);
});
