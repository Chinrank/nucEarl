const http = require("http");
const querystring = require("querystring");

const server = http
    .createServer((req, res) => {
        if (req.url === "/redirect") {
            res.statusCode = 200;
            res.setHeader("Location", "localhost:" + process.argv[2]);
            res.end();
        } else {
            typicalResponse(req, res);
        }
    })
    .listen(parseInt(process.argv[2]), () => console.log("httpServer started"));

server.on("connection", socket => {
    socket.setTimeout(30000);
    socket.setKeepAlive(true);
});

function typicalResponse(req, res) {
    let body = "";
    req.on("data", chunk => {
        body += chunk;
    });
    req.on("end", () => {
        res.statusCode = 200;
        res.setHeader("Set-Cookie", ["jam=nice", "me=jv"]);
        res.setHeader("Content-Type", "text/plain");
        res.write("I am http\r\n");
        res.write(JSON.stringify(req.headers));
        res.write("\r\n");
        res.write(body);
        res.end(process.argv[2]);
    });
}
