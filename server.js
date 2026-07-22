const http = require('http');

// Cria um servidor HTTP simples que responde com status 200
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot do Discord rodando com sucesso!\n');
});

// O Render injeta a porta automaticamente na variável process.env.PORT
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🌐 Servidor HTTP web rodando na porta ${PORT}`);
});