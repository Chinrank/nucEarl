const http = require("http");
const net = require("net");
const url = require("url");

const proxy = http.createServer((req, res) => {
    res.end("hello");
});
proxy.on("connect", (req, cltSocket, head) => {
    const srvUrl = url.parse(`http://${req.url}`);
    const srvSocket = net.connect(srvUrl.port, srvUrl.hostname, () => {
        cltSocket.write(
            "HTTP/1.1 200 Connection Established\r\n" + "Proxy-agent: Node.js-Proxy\r\n\r\n"
        );
        srvSocket.write(head);
        srvSocket.pipe(cltSocket);
        cltSocket.pipe(srvSocket);
    });
});
proxy.on("error", err => console.log(err));

proxy.listen(parseInt(process.argv[2]), () => console.log("httpProxyServer started"));
